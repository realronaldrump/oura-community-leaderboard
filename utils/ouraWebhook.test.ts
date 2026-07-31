import { describe, expect, it } from 'vitest';
import { createEmptyDailyStats } from '../test/helpers';
import { removeDeletedOuraRecord } from './ouraWebhook';

describe('webhook delete reconciliation', () => {
    it('removes the deleted object from the matching cached collection only', () => {
        const data = createEmptyDailyStats({
            sleep: [
                { id: 'keep', day: '2026-04-17', contributors: {} },
                { id: 'delete-me', day: '2026-04-18', contributors: {} },
            ],
            session: [
                { id: 'sleep-delete', day: '2026-04-18' },
                { id: 'sleep-keep', day: '2026-04-17' },
            ],
        });

        const withoutDailySleep = removeDeletedOuraRecord(data, 'daily_sleep', 'delete-me');
        const withoutSleepSession = removeDeletedOuraRecord(withoutDailySleep, 'sleep', 'sleep-delete');

        expect(withoutSleepSession.sleep.map((item) => item.id)).toEqual(['keep']);
        expect(withoutSleepSession.session.map((item) => item.id)).toEqual(['sleep-keep']);
        expect(data.sleep).toHaveLength(2);
        expect(data.session).toHaveLength(2);
    });

    it('returns the same snapshot for unknown webhook data types', () => {
        const data = createEmptyDailyStats();
        expect(removeDeletedOuraRecord(data, 'unknown', 'id')).toBe(data);
    });
});
