import { afterEach, describe, expect, it, vi } from 'vitest';
import { ouraService } from '../services/ouraService';
import { fetchDailyStats } from './useOuraData';

const ARRAY_METHODS = [
    'getDailySleep',
    'getDailyReadiness',
    'getDailyActivity',
    'getSleepSessions',
    'getDailySpO2',
    'getDailyStress',
    'getDailyResilience',
    'getHeartRate',
    'getWorkouts',
    'getSessions',
    'getSleepTime',
    'getTags',
    'getEnhancedTags',
    'getRestModePeriods',
    'getRingConfiguration',
    'getRingBatteryLevel',
    'getDailyCardiovascularAge',
    'getVO2Max',
] as const;

describe('fetchDailyStats endpoint coverage', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses Oura parent scopes to fetch all authorized current collections', async () => {
        const spies = Object.fromEntries(ARRAY_METHODS.map((method) => [
            method,
            vi.spyOn(ouraService, method as any).mockResolvedValue([]),
        ])) as Record<(typeof ARRAY_METHODS)[number], ReturnType<typeof vi.spyOn>>;
        const personalInfoSpy = vi.spyOn(ouraService, 'getPersonalInfo').mockResolvedValue({
            id: 'oura-user-1',
            age: 40,
        });
        spies.getVO2Max.mockResolvedValue([
            { id: 'vo2-1', day: '2026-03-02', timestamp: '2026-03-02T10:00:00Z', vo2_max: 44.1 },
            { id: 'vo2-2', day: '2026-03-02', timestamp: '2026-03-02T18:00:00Z', vo2_max: 44.8 },
        ]);

        const result = await fetchDailyStats(
            'access-token',
            { start: '2026-03-01', end: '2026-03-02' },
            {
                grantedScopes: ['daily', 'personal'],
                includeStaticCollections: true,
                fullHeartrate: true,
            },
        );

        expect(spies.getDailyStress).toHaveBeenCalledOnce();
        expect(spies.getDailyResilience).toHaveBeenCalledOnce();
        expect(spies.getSleepTime).toHaveBeenCalledOnce();
        expect(spies.getRestModePeriods).toHaveBeenCalledOnce();
        expect(spies.getDailyCardiovascularAge).toHaveBeenCalledOnce();
        expect(spies.getVO2Max).toHaveBeenCalledOnce();
        expect(spies.getRingConfiguration).toHaveBeenCalledOnce();
        expect(spies.getRingBatteryLevel).toHaveBeenCalledOnce();
        expect(personalInfoSpy).toHaveBeenCalledOnce();
        expect(spies.getDailySpO2).not.toHaveBeenCalled();
        expect(spies.getHeartRate).not.toHaveBeenCalled();
        expect(result.ringBatteryLevel).toEqual([]);
        expect(result.personalInfo).toEqual({ id: 'oura-user-1', age: 40 });
        expect(result.vo2Max).toHaveLength(2);
    });
});
