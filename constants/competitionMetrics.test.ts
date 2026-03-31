import { describe, expect, it } from 'vitest';
import { COMPETITION_METRICS_BY_ID } from './competitionMetrics';
import { createEmptyDailyStats } from '../test/helpers';

describe('competition bedtime extraction', () => {
    it('extracts bedtime using the record-local timestamp instead of viewer timezone', () => {
        const data = createEmptyDailyStats({
            session: [
                {
                    id: 'session-1',
                    day: '2026-03-31',
                    bedtime_start: '2026-03-30T01:15:00-05:00',
                },
            ],
        });

        expect(COMPETITION_METRICS_BY_ID.bedtime_start.extractDailyValue(data, '2026-03-31')).toBe(1515);
    });
});
