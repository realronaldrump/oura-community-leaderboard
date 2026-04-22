import { describe, expect, it } from 'vitest';
import { PROFILE_STATS_SCHEMA_VERSION } from '../services/firestoreStatsService';
import { shouldAutoPromoteIncrementalToFull } from './useOuraData';

describe('shouldAutoPromoteIncrementalToFull', () => {
    const nowMs = Date.parse('2026-04-21T12:00:00.000Z');

    it('keeps incremental sync for profiles without cached data', () => {
        expect(shouldAutoPromoteIncrementalToFull({
            baseDataPresent: false,
            hydratedFromStoredStats: false,
            metadata: null,
            nowMs,
        })).toBe(false);
    });

    it('promotes to full when stored data exists but metadata is missing', () => {
        expect(shouldAutoPromoteIncrementalToFull({
            baseDataPresent: true,
            hydratedFromStoredStats: true,
            metadata: null,
            nowMs,
        })).toBe(true);
    });

    it('keeps incremental sync when the last full reconciliation is recent', () => {
        expect(shouldAutoPromoteIncrementalToFull({
            baseDataPresent: true,
            hydratedFromStoredStats: false,
            metadata: {
                schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
                lastFullSyncAt: '2026-04-18T12:00:00.000Z',
            },
            nowMs,
        })).toBe(false);
    });

    it('promotes to full when the last reconciliation is stale', () => {
        expect(shouldAutoPromoteIncrementalToFull({
            baseDataPresent: true,
            hydratedFromStoredStats: false,
            metadata: {
                schemaVersion: PROFILE_STATS_SCHEMA_VERSION,
                lastFullSyncAt: '2026-04-10T12:00:00.000Z',
            },
            nowMs,
        })).toBe(true);
    });

    it('promotes to full when the stored schema is outdated', () => {
        expect(shouldAutoPromoteIncrementalToFull({
            baseDataPresent: true,
            hydratedFromStoredStats: false,
            metadata: {
                schemaVersion: PROFILE_STATS_SCHEMA_VERSION - 1,
                lastFullSyncAt: '2026-04-20T12:00:00.000Z',
            },
            nowMs,
        })).toBe(true);
    });
});