import type { Competition, CompetitionInvite, CompetitionRule } from '../types/competitionTypes';
import type { UserProfile } from '../types';

export const competitionProfile: UserProfile = { id: 'profile-1', firstName: 'Alex' };
export const competitionFriend: UserProfile = { id: 'profile-2', firstName: 'Sam' };
export const stepRule: CompetitionRule = {
    id: 'steps', metricId: 'steps', label: 'Steps', operator: 'gte', target: 10000,
    weight: 1, aggregation: 'total', capAtTarget: false,
};
export const makeCompetition = (overrides: Partial<Competition> = {}): Competition => ({
    id: 'competition-1', title: 'Step Week', description: 'Most steps wins.', mode: 'friends', format: 'race', scoring: 'total',
    status: 'scheduled', createdByProfileId: competitionProfile.id, createdAt: '2026-09-09T12:00:00Z', updatedAt: '2026-09-09T12:00:00Z',
    startDate: '2026-09-10', endDate: '2026-09-16', timeZone: 'UTC', rules: [stepRule],
    participants: [
        { profileId: competitionProfile.id, displayName: 'Alex', status: 'accepted', source: 'creator' },
        { profileId: competitionFriend.id, displayName: 'Sam', status: 'accepted', source: 'selected' },
    ],
    participantProfileIds: [competitionProfile.id, competitionFriend.id], inviteTokenIds: ['invite-1'],
    ...overrides,
});
export const makeCompetitionInvite = (overrides: Partial<CompetitionInvite> = {}): CompetitionInvite => ({
    id: 'invite-1', competitionId: 'competition-1', token: 'test-token', createdByProfileId: competitionProfile.id,
    createdAt: '2026-09-09T12:00:00Z', acceptedProfileIds: [], status: 'active', ...overrides,
});
