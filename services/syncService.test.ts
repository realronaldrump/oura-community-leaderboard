import { fullSync } from './syncService';

const mocks = vi.hoisted(() => ({
    fetchDailyStats: vi.fn(),
    mergeDailyStats: vi.fn(),
    syncDailyStats: vi.fn(),
    saveProfileStats: vi.fn(),
    persistDerivedProfileTemporalMetadata: vi.fn(),
}));

vi.mock('../hooks/useOuraData', () => ({
    FULL_HISTORY_START_DATE: '2026-01-01',
    fetchDailyStats: mocks.fetchDailyStats,
    mergeDailyStats: mocks.mergeDailyStats,
    syncDailyStats: mocks.syncDailyStats,
}));

vi.mock('./firestoreStatsService', () => ({
    saveProfileStats: mocks.saveProfileStats,
}));

vi.mock('./profileTemporalService', () => ({
    persistDerivedProfileTemporalMetadata: mocks.persistDerivedProfileTemporalMetadata,
}));

describe('fullSync stale-data safety', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not erase previously valid history before the replacement fetch succeeds', async () => {
        mocks.fetchDailyStats.mockRejectedValueOnce(new Error('temporary Oura outage'));

        await expect(fullSync(
            'access-token',
            () => {},
            { profileId: 'profile-1' }
        )).rejects.toThrow('temporary Oura outage');

        expect(mocks.saveProfileStats).not.toHaveBeenCalled();
    });

    it('persists and replaces the staged snapshot only after every history fetch succeeds', async () => {
        const completeStats = {
            sleep: [], readiness: [], activity: [], session: [], spo2: [], stress: [],
            resilience: [], heartrate: [], workout: [], guidedSession: [], sleepTime: [],
            tag: [], enhancedTag: [], restModePeriod: [], ringConfiguration: [],
            cardiovascularAge: [], vo2Max: [],
        };
        mocks.fetchDailyStats.mockResolvedValueOnce(completeStats);
        mocks.saveProfileStats.mockResolvedValueOnce(undefined);
        mocks.persistDerivedProfileTemporalMetadata.mockResolvedValueOnce(undefined);

        await expect(fullSync(
            'access-token',
            () => {},
            { profileId: 'profile-1' }
        )).resolves.toBe(completeStats);

        expect(mocks.fetchDailyStats).toHaveBeenCalledWith(
            'access-token',
            expect.any(Object),
            expect.objectContaining({ requireCompleteData: true })
        );
        expect(mocks.saveProfileStats).toHaveBeenCalledTimes(1);
        expect(mocks.saveProfileStats).toHaveBeenCalledWith('profile-1', completeStats, 'full');
        expect(mocks.persistDerivedProfileTemporalMetadata).toHaveBeenCalledWith('profile-1', completeStats);
        expect(mocks.saveProfileStats.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.persistDerivedProfileTemporalMetadata.mock.invocationCallOrder[0]
        );
    });
});
