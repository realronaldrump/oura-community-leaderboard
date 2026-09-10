import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Competition, CompetitionInvitePreview } from '../../types/competitionTypes';
import type { CreateCompetitionInput } from '../../services/competitionService';
import { competitionProfile, competitionFriend, makeCompetition, makeCompetitionInvite } from '../../test/competitionFixtures';
import CompeteView from './CompeteView';

const mocks = vi.hoisted(() => ({
    competitions: [] as Competition[],
    preview: null as CompetitionInvitePreview | null,
    previewLoading: false,
    previewError: null as string | null,
    create: vi.fn(), respond: vi.fn(), ensureInvite: vi.fn(), accept: vi.fn(), share: vi.fn(),
}));
vi.mock('../../hooks/useCompetitions', () => ({
    useCompetitions: () => ({ competitions: mocks.competitions, isLoading: false, error: null }),
    useCompetitionInvitePreview: () => ({ preview: mocks.preview, isLoading: mocks.previewLoading, error: mocks.previewError }),
}));
vi.mock('../../services/competitionService', () => ({ competitionService: {
    createCompetition: mocks.create, respondToCompetition: mocks.respond, ensureCompetitionInvite: mocks.ensureInvite, acceptCompetitionInviteToken: mocks.accept,
} }));
vi.mock('../../utils/inviteLink', () => ({ shareCompetitionInviteLink: mocks.share }));

const setup = (token?: string) => {
    const onClear = vi.fn();
    const props = { activeProfile: competitionProfile, profiles: [competitionProfile, competitionFriend], profileData: [], competitionInviteToken: token, onClearCompetitionInviteToken: onClear };
    return { ...render(<CompeteView {...props} />), onClear, props };
};
beforeEach(() => {
    vi.clearAllMocks();
    mocks.competitions = [];
    mocks.preview = null;
    mocks.previewLoading = false;
    mocks.previewError = null;
    mocks.respond.mockResolvedValue(undefined);
    mocks.share.mockResolvedValue('copied');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('competition flow', () => {
    it('has one creation entry point, without a template wall or setup counters', () => {
        setup();
        expect(screen.getAllByRole('button', { name: 'New competition' })).toHaveLength(1);
        expect(screen.queryByText(/templates|pending invites|starting tomorrow/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New competition' }));
        expect(screen.getByRole('dialog', { name: 'New competition' })).toBeInTheDocument();
    });

    it('creates, shows the new card immediately, and copies its invitation without a second lookup', async () => {
        mocks.create.mockImplementation(async (input: CreateCompetitionInput) => ({ competition: makeCompetition({ ...input, id: 'created' }), invite: makeCompetitionInvite() }));
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'New competition' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getByRole('heading', { name: 'Step Week' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Invite friends' }));
        expect(await screen.findByRole('button', { name: 'Link copied' })).toBeInTheDocument();
        expect(mocks.share).toHaveBeenCalledWith('test-token', 'Step Week');
        expect(mocks.ensureInvite).not.toHaveBeenCalled();
        expect(screen.getByText('Paste the link to invite a friend.')).toBeInTheDocument();
    });

    it('shows a pending invitation once and omits declined and closed invitations', () => {
        mocks.competitions = [
            makeCompetition({ title: 'Pending', startDate: '2099-01-01', endDate: '2099-01-07', participants: [{ profileId: competitionProfile.id, displayName: 'Alex', status: 'invited' }] }),
            makeCompetition({ id: 'declined', title: 'Declined', participants: [{ profileId: competitionProfile.id, displayName: 'Alex', status: 'declined' }] }),
            makeCompetition({ id: 'closed', title: 'Closed', endDate: '2000-01-01', participants: [{ profileId: competitionProfile.id, displayName: 'Alex', status: 'invited' }] }),
        ];
        setup();
        expect(screen.getAllByRole('heading', { name: 'Pending' })).toHaveLength(1);
        expect(screen.queryByRole('heading', { name: 'Declined' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Closed' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Join' }));
        expect(mocks.respond).toHaveBeenCalledWith('competition-1', competitionProfile.id, 'accepted');
    });

    it.each(['loading', 'invalid', 'error', 'closed'] as const)('does not offer Join or claim membership for a %s link', (state) => {
        mocks.previewLoading = state === 'loading';
        mocks.previewError = state === 'error' ? 'Could not load this invite.' : null;
        if (state === 'closed') mocks.preview = { invite: makeCompetitionInvite(), competition: makeCompetition({ status: 'cancelled', participants: [] }) };
        setup('token');
        expect(screen.queryByRole('button', { name: 'Join competition' })).not.toBeInTheDocument();
        expect(screen.queryByText(/already in|already joined/i)).not.toBeInTheDocument();
    });

    it('joins an available link and clears the invitation', async () => {
        mocks.preview = { invite: makeCompetitionInvite(), competition: makeCompetition({ startDate: '2099-01-01', endDate: '2099-01-07', participants: [] }) };
        mocks.accept.mockResolvedValue({ ...mocks.preview, competition: makeCompetition() });
        const { onClear } = setup('token');
        fireEvent.click(screen.getByRole('button', { name: 'Join competition' }));
        await waitFor(() => expect(onClear).toHaveBeenCalledOnce());
        expect(mocks.accept).toHaveBeenCalledWith('token', { profileId: competitionProfile.id, displayName: 'Alex' });
    });

    it('keeps all past competitions available in a collapsed history', () => {
        mocks.competitions = Array.from({ length: 10 }, (_, index) => makeCompetition({ id: `past-${index}`, title: `Past ${index}`, startDate: '2000-01-01', endDate: '2000-01-07' }));
        const { container } = setup();
        const details = container.querySelector('details');
        expect(details).not.toHaveAttribute('open');
        expect(screen.getByText('Past competitions (10)')).toBeInTheDocument();
        expect(container.querySelectorAll('article')).toHaveLength(10);
    });

    it('shows sharing failure and allows a retry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.competitions = [makeCompetition({ startDate: '2099-01-01', endDate: '2099-01-07' })];
        mocks.ensureInvite.mockResolvedValue(makeCompetitionInvite());
        mocks.share.mockRejectedValueOnce(new Error('clipboard')).mockResolvedValueOnce('copied');
        setup();
        fireEvent.click(screen.getByRole('button', { name: 'Invite friends' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not share');
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Invite friends' })));
        expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    });
});
