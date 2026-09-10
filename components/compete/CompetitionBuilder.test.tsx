import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { competitionProfile, competitionFriend } from '../../test/competitionFixtures';
import { getCompetitionTodayISODate } from '../../utils/profileTemporal';
import { shiftLocalISODate } from '../../utils/date';
import CompetitionBuilder from './CompetitionBuilder';

const setup = (onCreate = vi.fn().mockResolvedValue(undefined)) => {
    const onClose = vi.fn();
    const props = { isOpen: true, activeProfile: competitionProfile, profiles: [competitionProfile, competitionFriend], onClose, onCreate };
    return { ...render(<CompetitionBuilder {...props} />), onCreate, onClose, props };
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('simple competition setup', () => {
    it('needs no typing or configuration to create a seven-day challenge tomorrow', async () => {
        const { onCreate } = setup();
        expect(screen.getAllByRole('radio')).toHaveLength(5);
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        expect(screen.queryByText(/aggregation|operator|weight|checklist|add rule/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
        const input = onCreate.mock.calls[0][0];
        const tomorrow = shiftLocalISODate(getCompetitionTodayISODate({ timeZone: input.timeZone }), 1);
        expect(input).toMatchObject({ title: 'Step Week', format: 'race', scoring: 'total', mode: 'friends', startDate: tomorrow, endDate: shiftLocalISODate(tomorrow, 6), createShareInvite: true });
        expect(input.participants).toHaveLength(1);
        expect(input.rules[0]).toMatchObject({ metricId: 'steps', aggregation: 'total', capAtTarget: false });
    });

    it('selects sleep scoring and invites only chosen friends', async () => {
        const { onCreate } = setup();
        fireEvent.click(screen.getByRole('radio', { name: 'Sleep' }));
        fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
        expect(onCreate.mock.calls[0][0]).toMatchObject({ title: 'Sleep Week', scoring: 'average', participants: [expect.objectContaining({ status: 'accepted' }), expect.objectContaining({ profileId: competitionFriend.id, status: 'invited' })] });
    });

    it('removes selected friends from solo goals and uses the displayed daily target', async () => {
        const { onCreate } = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Sam' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Readiness' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Just me' }));
        expect(screen.getByText('Reach a readiness score of 80 each day.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
        await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
        const input = onCreate.mock.calls[0][0];
        expect(input).toMatchObject({ mode: 'solo', format: 'goal', createShareInvite: false, rules: [expect.objectContaining({ metricId: 'readiness_score', target: 80, aggregation: 'daily', capAtTarget: true })] });
        expect(input).not.toHaveProperty('scoring');
        expect(input.participants).toHaveLength(1);
    });

    it('opens with accessible choices, supports Escape, and resets when reopened', async () => {
        const { onClose, rerender, props } = setup();
        expect(screen.getByRole('dialog', { name: 'New competition' })).toHaveAttribute('aria-modal', 'true');
        await waitFor(() => expect(screen.getByRole('radio', { name: 'Steps' })).toHaveFocus());
        fireEvent.click(screen.getByRole('radio', { name: 'Just me' }));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledOnce();
        rerender(<CompetitionBuilder {...props} isOpen={false} />);
        rerender(<CompetitionBuilder {...props} />);
        expect(screen.getByRole('radio', { name: 'With friends' })).toBeChecked();
    });

    it('prevents repeat submissions, changes, and dismissal while saving', async () => {
        let finishCreate: (() => void) | undefined;
        const onCreate = vi.fn(() => new Promise<void>((resolve) => { finishCreate = resolve; }));
        const onClose = vi.fn();
        const { container } = render(<CompetitionBuilder isOpen activeProfile={competitionProfile} profiles={[]} onCreate={onCreate} onClose={onClose} />);
        fireEvent.submit(container.querySelector('form')!);
        fireEvent.submit(container.querySelector('form')!);
        expect(onCreate).toHaveBeenCalledOnce();
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByRole('radio', { name: 'Sleep' })).toBeDisabled();
        expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        fireEvent.mouseDown(container.querySelector('.ui-dialog-backdrop')!);
        expect(onClose).not.toHaveBeenCalled();
        await act(async () => finishCreate?.());
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('keeps choices after failure and lets the user retry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const onCreate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
        const { onClose } = setup(onCreate);
        fireEvent.click(screen.getByRole('radio', { name: 'Sleep' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Try again');
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('radio', { name: 'Sleep' })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Create competition' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    });
});
