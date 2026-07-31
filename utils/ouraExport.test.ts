import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../test/helpers';
import type { UserProfile } from '../types';
import {
    buildCompleteOuraExport,
    createComprehensiveCsv,
    OURA_COLLECTION_NAMES,
} from './ouraExport';

const profile: UserProfile = {
    id: 'internal-profile-id',
    ouraUserId: 'oura-user-id',
    email: 'member@example.com',
    age: 39,
    height: 1.78,
    weight: 76.5,
    biological_sex: 'male',
    firstName: 'Not an Oura API field',
    token: 'access-token-must-never-export',
    refreshToken: 'refresh-token-must-never-export',
    grantedScopes: ['daily', 'personal'],
    dataExclusionRanges: [{
        id: 'ring-break',
        startDay: '2026-04-18',
        endDay: '2026-04-18',
    }],
};

describe('complete Oura export', () => {
    it('exports all current Oura V2 collections losslessly without credentials or analysis exclusions', () => {
        const data = createEmptyDailyStats({
            personalInfo: {
                id: 'fresh-oura-user-id',
                age: 40,
                weight: 75,
                height: 1.78,
                biological_sex: 'male',
                email: 'fresh@example.com',
            },
            session: [{
                id: 'sleep-session-1',
                day: '2026-04-18',
                sleep_phase_30_sec: '1234',
                heart_rate: {
                    interval: 300,
                    items: [51, 49, 50],
                    timestamp: '2026-04-18T01:00:00Z',
                },
                updatedAt: 'firestore-only-field',
            } as any],
            ringBatteryLevel: [{
                timestamp: '2026-04-18T12:00:00Z',
                timestamp_unix: 1_776_513_600_000,
                level: 71,
                charging: false,
            }],
        } as any);

        const bundle = buildCompleteOuraExport({
            data,
            profile,
            metadata: {
                profileId: profile.id,
                schemaVersion: 2,
                oldestDay: '2026-04-18',
                newestDay: '2026-04-18',
                lastFullSyncAt: '2026-04-19T12:00:00Z',
                lastFullSyncSchemaVersion: 2,
                updatedAt: '2026-04-19T12:00:00Z',
            },
            exportedAt: '2026-04-20T12:00:00Z',
        });

        expect(Object.keys(bundle.collections)).toEqual(OURA_COLLECTION_NAMES);
        expect(bundle.collections.personal_info).toEqual({
            id: 'fresh-oura-user-id',
            age: 40,
            weight: 75,
            height: 1.78,
            biological_sex: 'male',
            email: 'fresh@example.com',
        });
        expect(bundle.collections.sleep[0]).toMatchObject({
            id: 'sleep-session-1',
            sleep_phase_30_sec: '1234',
            heart_rate: { items: [51, 49, 50] },
        });
        expect(bundle.collections.sleep[0]).not.toHaveProperty('updatedAt');
        expect(bundle.collections.ring_battery_level).toHaveLength(1);
        expect(bundle.manifest.collection_counts.sleep).toBe(1);
        expect(bundle.manifest.collection_counts.ring_battery_level).toBe(1);
        expect(bundle.manifest.profile_exclusions_applied).toBe(false);
        expect(bundle.manifest.snapshot_status).toBe('full-sync');
        expect(JSON.stringify(bundle)).not.toContain(profile.token);
        expect(JSON.stringify(bundle)).not.toContain(profile.refreshToken);
        expect(JSON.stringify(bundle)).not.toContain(profile.firstName);
    });

    it('creates a union-field CSV with nested source fields, arrays, nulls, and formula escaping', () => {
        const csv = createComprehensiveCsv([
            { id: 'one', note: '=2+2', nested: { first: 1 }, samples: [1, 2] },
            { id: 'two', nested: { second: null } },
        ]);

        expect(csv.split('\n')[0]).toContain('nested.first');
        expect(csv.split('\n')[0]).toContain('nested.second');
        expect(csv).toContain('[1,2]');
        expect(csv).toContain('null');
        expect(csv).toContain("'=2+2");
    });
});
