import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkChallengeProgress, generateTimelineData } from './analyticsService';
import { createEmptyDailyStats } from '../test/helpers';

describe('analytics timezone handling', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('generates timeline points and insights from record-local sleep times', () => {
        const result = generateTimelineData('2026-03-31', [
            {
                userId: 'alice',
                userName: 'Alice',
                data: createEmptyDailyStats({
                    session: [
                        {
                            id: 'a',
                            day: '2026-03-31',
                            bedtime_start: '2026-03-30T21:30:00-05:00',
                            bedtime_end: '2026-03-31T07:00:00-05:00',
                        },
                    ],
                }),
            },
            {
                userId: 'bob',
                userName: 'Bob',
                data: createEmptyDailyStats({
                    session: [
                        {
                            id: 'b',
                            day: '2026-03-31',
                            bedtime_start: '2026-03-30T23:00:00-07:00',
                            bedtime_end: '2026-03-31T08:00:00-07:00',
                        },
                    ],
                }),
            },
        ]);

        expect(result.dataPoints.find((point) => point.userId === 'alice' && point.type === 'sleep_start')).toMatchObject({
            hour: 21,
            minute: 30,
        });
        expect(result.dataPoints.find((point) => point.userId === 'bob' && point.type === 'sleep_start')).toMatchObject({
            hour: 23,
            minute: 0,
        });
        expect(result.insights[0]).toMatchObject({
            difference: 90,
            description: 'Alice fell asleep 90 minutes earlier than Bob',
        });
    });

    it('uses derived profile-local today for challenge progress', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T03:00:00Z'));

        const updated = checkChallengeProgress({
            id: 'challenge-1',
            challengeId: 'sleep_week',
            userId: 'user-1',
            startDate: '2026-03-31',
            endDate: '2026-04-06',
            status: 'active',
            progress: 0,
            history: {},
        }, createEmptyDailyStats({
            sleep: [
                {
                    id: 'sleep-1',
                    day: '2026-03-31',
                    score: 90,
                    contributors: {},
                },
            ],
            heartrate: [
                {
                    bpm: 55,
                    source: 'rest',
                    timestamp: '2026-03-31T20:00:00-07:00',
                },
            ],
        }));

        expect(Object.keys(updated.history)).toEqual(['2026-03-31']);
        expect(updated.history['2026-03-31']).toBe(true);
    });
});
