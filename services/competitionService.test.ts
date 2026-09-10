import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCompetition, makeCompetitionInvite } from '../test/competitionFixtures';
import { competitionService } from './competitionService';

const mocks = vi.hoisted(() => ({ docs: new Map<string, unknown>(), set: vi.fn(), update: vi.fn(), commit: vi.fn(), transactionUpdate: vi.fn(), tokenResult: null as unknown }));
vi.mock('./firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
    const snapshot = (path: string) => ({ id: path.split('/').at(-1), exists: () => mocks.docs.has(path), data: () => mocks.docs.get(path) });
    return {
        doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
        collection: vi.fn(), limit: vi.fn(), orderBy: vi.fn(), query: vi.fn(), where: vi.fn(), onSnapshot: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
        getDoc: async (path: string) => snapshot(path),
        getDocs: async () => ({ empty: !mocks.tokenResult, docs: mocks.tokenResult ? [{ id: 'invite-1', data: () => mocks.tokenResult }] : [] }),
        writeBatch: () => ({ set: mocks.set, update: mocks.update, commit: mocks.commit }),
        runTransaction: async (_db: unknown, fn: (transaction: unknown) => Promise<void>) => fn({ get: async (path: string) => snapshot(path), update: mocks.transactionUpdate }),
    };
});

beforeEach(() => {
    vi.clearAllMocks(); mocks.docs.clear(); mocks.tokenResult = null; mocks.commit.mockResolvedValue(undefined);
});
const openCompetition = () => makeCompetition({ startDate: '2099-01-01', endDate: '2099-01-07' });

describe('competition persistence and invitations', () => {
    it('stores the new scoring mode and invitation in one committed batch', async () => {
        const competition = openCompetition();
        const result = await competitionService.createCompetition({ ...competition, createShareInvite: true });
        expect(result.competition.scoring).toBe('total');
        expect(result.invite?.competitionId).toBe(result.competition.id);
        expect(mocks.set).toHaveBeenCalledWith(`competitions/${result.competition.id}`, expect.objectContaining({ scoring: 'total', inviteTokenIds: [result.invite!.id] }));
        expect(mocks.set).toHaveBeenCalledTimes(2);
        expect(mocks.commit).toHaveBeenCalledOnce();
    });
    it('does not persist undefined scoring or create an invite for solo goals', async () => {
        const result = await competitionService.createCompetition({ ...openCompetition(), mode: 'solo', format: 'goal', scoring: undefined, createShareInvite: false });
        expect(result.competition).not.toHaveProperty('scoring');
        expect(result.invite).toBeNull();
        expect(mocks.set).toHaveBeenCalledOnce();
    });
    it('preserves new and legacy scoring when reading an invite', async () => {
        mocks.tokenResult = makeCompetitionInvite();
        mocks.docs.set('competitions/competition-1', openCompetition());
        expect((await competitionService.getCompetitionInvitePreview('test-token'))?.competition.scoring).toBe('total');
        mocks.docs.set('competitions/competition-1', { ...openCompetition(), scoring: undefined });
        expect((await competitionService.getCompetitionInvitePreview('test-token'))?.competition).not.toHaveProperty('scoring');
    });
    it('replaces expired links instead of handing the owner an unusable invitation', async () => {
        mocks.docs.set('competitions/competition-1', openCompetition());
        mocks.docs.set('competitionInvites/invite-1', makeCompetitionInvite({ expiresAt: '2000-01-01T00:00:00Z' }));
        const invite = await competitionService.ensureCompetitionInvite('competition-1', 'profile-1');
        expect(invite.id).not.toBe('invite-1');
        expect(invite.status).toBe('active');
        expect(mocks.commit).toHaveBeenCalledOnce();
    });
    it.each(['completed', 'cancelled'] as const)('rejects joins and sharing after a competition is %s', async (status) => {
        const competition = makeCompetition({ status, startDate: '2000-01-01', endDate: '2000-01-07' });
        mocks.docs.set('competitions/competition-1', competition);
        mocks.docs.set('competitionInvites/invite-1', makeCompetitionInvite());
        mocks.tokenResult = makeCompetitionInvite();
        await expect(competitionService.respondToCompetition('competition-1', 'profile-1', 'accepted')).rejects.toThrow('competition_closed');
        await expect(competitionService.acceptCompetitionInviteToken('test-token', { profileId: 'profile-3', displayName: 'New member' })).rejects.toThrow('competition_closed');
        await expect(competitionService.ensureCompetitionInvite('competition-1', 'profile-1')).rejects.toThrow('competition_closed');
        expect(mocks.transactionUpdate).not.toHaveBeenCalled();
        expect(mocks.commit).not.toHaveBeenCalled();
    });
    it('accepts an available invitation and adds the member to both records', async () => {
        mocks.docs.set('competitions/competition-1', openCompetition());
        mocks.docs.set('competitionInvites/invite-1', makeCompetitionInvite());
        mocks.tokenResult = makeCompetitionInvite();
        await competitionService.acceptCompetitionInviteToken('test-token', { profileId: 'profile-3', displayName: 'New member' });
        expect(mocks.transactionUpdate).toHaveBeenCalledWith('competitions/competition-1', expect.objectContaining({ participantProfileIds: ['profile-1', 'profile-2', 'profile-3'], participants: expect.arrayContaining([expect.objectContaining({ profileId: 'profile-3', status: 'accepted' })]) }));
        expect(mocks.transactionUpdate).toHaveBeenCalledWith('competitionInvites/invite-1', { acceptedProfileIds: ['profile-3'] });
    });
});
