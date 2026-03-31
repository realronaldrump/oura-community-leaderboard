import { afterEach, describe, expect, it, vi } from 'vitest';
import { deriveCompetitionStatus } from './competitionEngine';
import { Competition } from '../types/competitionTypes';

const competition: Competition = {
    id: 'competition-1',
    title: 'Timezone Test',
    description: '',
    mode: 'solo',
    format: 'goal',
    status: 'scheduled',
    createdByProfileId: 'user-1',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
    startDate: '2026-04-01',
    endDate: '2026-04-03',
    timeZone: 'America/New_York',
    rules: [],
    participants: [],
    participantProfileIds: [],
};

describe('competition timezone anchoring', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('evaluates status against the stored competition timezone', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-01T02:30:00Z'));
        expect(deriveCompetitionStatus(competition)).toBe('scheduled');

        vi.setSystemTime(new Date('2026-04-01T05:30:00Z'));
        expect(deriveCompetitionStatus(competition)).toBe('active');
    });
});
