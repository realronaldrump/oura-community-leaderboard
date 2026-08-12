import { describe, expect, it } from 'vitest';
import {
    buildBackgroundDashboardSnapshot,
    getHistoryReconciliationRange,
    mergeBackgroundStats,
} from '../api/_lib/ouraBackgroundSync';

const empty = () => ({
    sleep: [], readiness: [], activity: [], session: [], spo2: [], stress: [], resilience: [],
});

describe('server-owned Oura snapshot model', () => {
    it('merges overlapping daily data and keeps the newest server value', () => {
        const merged = mergeBackgroundStats(
            {
                ...empty(),
                sleep: [{ id: 'old', day: '2026-08-10', score: 80 }],
                activity: [{ id: 'activity', day: '2026-08-09', steps: 4_000 }],
            },
            {
                ...empty(),
                sleep: [{ id: 'new', day: '2026-08-10', score: 91 }],
            }
        );

        expect(merged.sleep).toEqual([{ id: 'new', day: '2026-08-10', score: 91 }]);
        expect(merged.activity).toEqual([{ id: 'activity', day: '2026-08-09', steps: 4_000 }]);
    });

    it('publishes a bounded launch snapshot without high-volume samples or diagnostics', () => {
        const days = Array.from({ length: 35 }, (_, index) => `2026-07-${String(index + 1).padStart(2, '0')}`);
        const snapshot = buildBackgroundDashboardSnapshot('profile-1', {
            ...empty(),
            sleep: days.map((day) => ({ id: `sleep-${day}`, day, score: 80 })),
            activity: days.map((day) => ({ id: `activity-${day}`, day, class_5_min: 'large', steps: 10_000 })),
            session: days.map((day) => ({
                id: `session-${day}`,
                day,
                type: 'long_sleep',
                hrv: { items: [1, 2] },
            })),
        }, '2026-08-12T12:00:00.000Z');

        expect(snapshot.data.sleep).toHaveLength(30);
        expect(snapshot.data.activity[0]).not.toHaveProperty('class_5_min');
        expect(snapshot.data.session[0]).not.toHaveProperty('hrv');
        expect(snapshot.data).not.toHaveProperty('endpointDiagnostics');
        expect(snapshot.data).not.toHaveProperty('resilienceDiagnostic');
    });

    it('backfills one bounded history chunk per daily safety pass', () => {
        expect(getHistoryReconciliationRange('2026-01-01', '2016-01-01', 180)).toEqual({
            startDay: '2025-07-05',
            endDay: '2025-12-31',
        });
        expect(getHistoryReconciliationRange('2016-01-01')).toBeNull();
    });
});
