import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    QuerySnapshot,
    DocumentData,
    runTransaction,
    setDoc,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import {
    Competition,
    CompetitionInvite,
    CompetitionInvitePreview,
    CompetitionParticipant,
    CompetitionParticipantStatus,
    CompetitionRule,
} from '../types/competitionTypes';

const COMPETITIONS_COLLECTION = 'competitions';
const COMPETITION_INVITES_COLLECTION = 'competitionInvites';

export interface CreateCompetitionInput {
    title: string;
    description?: string;
    mode: Competition['mode'];
    format: Competition['format'];
    createdByProfileId: string;
    startDate: string;
    endDate: string;
    timeZone: string;
    rules: CompetitionRule[];
    participants: CompetitionParticipant[];
    templateId?: string | null;
    createShareInvite?: boolean;
}

type InviteParticipant = {
    profileId: string;
    displayName: string;
};

const uniqueProfileIds = (participants: CompetitionParticipant[]): string[] => (
    Array.from(new Set(participants.map((participant) => participant.profileId)))
);

const createCompetitionInviteRecord = (
    competitionId: string,
    createdByProfileId: string
): CompetitionInvite => ({
    id: crypto.randomUUID(),
    competitionId,
    token: crypto.randomUUID().replace(/-/g, ''),
    createdByProfileId,
    createdAt: new Date().toISOString(),
    expiresAt: null,
    maxUses: null,
    acceptedProfileIds: [],
    status: 'active',
});

const normalizeCompetition = (id: string, raw: DocumentData): Competition => {
    const participants = Array.isArray(raw.participants) ? raw.participants : [];

    return {
        id,
        title: typeof raw.title === 'string' ? raw.title : 'Untitled competition',
        description: typeof raw.description === 'string' ? raw.description : '',
        mode: raw.mode === 'solo' ? 'solo' : 'friends',
        format: raw.format === 'goal' || raw.format === 'combo' ? raw.format : 'race',
        status: raw.status === 'draft' || raw.status === 'cancelled' || raw.status === 'completed' || raw.status === 'active'
            ? raw.status
            : 'scheduled',
        createdByProfileId: typeof raw.createdByProfileId === 'string' ? raw.createdByProfileId : '',
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
        startDate: typeof raw.startDate === 'string' ? raw.startDate : '',
        endDate: typeof raw.endDate === 'string' ? raw.endDate : '',
        timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone,
        rules: Array.isArray(raw.rules) ? raw.rules : [],
        participants,
        participantProfileIds: Array.isArray(raw.participantProfileIds) && raw.participantProfileIds.length
            ? raw.participantProfileIds
            : uniqueProfileIds(participants),
        inviteTokenIds: Array.isArray(raw.inviteTokenIds) ? raw.inviteTokenIds : [],
        templateId: typeof raw.templateId === 'string' ? raw.templateId : null,
    };
};

const normalizeInvite = (id: string, raw: DocumentData): CompetitionInvite => ({
    id,
    competitionId: typeof raw.competitionId === 'string' ? raw.competitionId : '',
    token: typeof raw.token === 'string' ? raw.token : '',
    createdByProfileId: typeof raw.createdByProfileId === 'string' ? raw.createdByProfileId : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    expiresAt: typeof raw.expiresAt === 'string' ? raw.expiresAt : null,
    maxUses: typeof raw.maxUses === 'number' ? raw.maxUses : null,
    acceptedProfileIds: Array.isArray(raw.acceptedProfileIds) ? raw.acceptedProfileIds : [],
    status: raw.status === 'revoked' || raw.status === 'expired' ? raw.status : 'active',
});

const resolveInvitePreview = async (invite: CompetitionInvite): Promise<CompetitionInvitePreview | null> => {
    const competitionRef = doc(db, COMPETITIONS_COLLECTION, invite.competitionId);
    const competitionSnapshot = await getDoc(competitionRef);
    if (!competitionSnapshot.exists()) return null;

    return {
        invite,
        competition: normalizeCompetition(competitionSnapshot.id, competitionSnapshot.data()),
    };
};

export const competitionService = {
    subscribeToCompetitions: (
        callback: (competitions: Competition[]) => void,
        onError?: (error: unknown) => void
    ) => {
        const competitionsQuery = query(
            collection(db, COMPETITIONS_COLLECTION),
            orderBy('updatedAt', 'desc')
        );

        return onSnapshot(
            competitionsQuery,
            (snapshot: QuerySnapshot<DocumentData>) => {
                const competitions = snapshot.docs.map((document) => normalizeCompetition(document.id, document.data()));
                callback(competitions);
            },
            (error) => {
                if (onError) {
                    onError(error);
                    return;
                }
                console.error('Competition subscription error:', error);
            }
        );
    },

    createCompetition: async (input: CreateCompetitionInput): Promise<{ competition: Competition; invite: CompetitionInvite | null }> => {
        const now = new Date().toISOString();
        const competitionId = crypto.randomUUID();
        const invite = input.createShareInvite ? createCompetitionInviteRecord(competitionId, input.createdByProfileId) : null;

        const competition: Competition = {
            id: competitionId,
            title: input.title,
            description: input.description || '',
            mode: input.mode,
            format: input.format,
            status: 'scheduled',
            createdByProfileId: input.createdByProfileId,
            createdAt: now,
            updatedAt: now,
            startDate: input.startDate,
            endDate: input.endDate,
            timeZone: input.timeZone,
            rules: input.rules,
            participants: input.participants,
            participantProfileIds: uniqueProfileIds(input.participants),
            inviteTokenIds: invite ? [invite.id] : [],
            templateId: input.templateId || null,
        };

        const batch = writeBatch(db);
        batch.set(doc(db, COMPETITIONS_COLLECTION, competitionId), competition);
        if (invite) {
            batch.set(doc(db, COMPETITION_INVITES_COLLECTION, invite.id), invite);
        }
        await batch.commit();

        return { competition, invite };
    },

    updateCompetition: async (competition: Competition): Promise<void> => {
        await setDoc(doc(db, COMPETITIONS_COLLECTION, competition.id), {
            ...competition,
            participantProfileIds: uniqueProfileIds(competition.participants),
            updatedAt: new Date().toISOString(),
        });
    },

    updateCompetitionStatus: async (competitionId: string, status: Competition['status']): Promise<void> => {
        await updateDoc(doc(db, COMPETITIONS_COLLECTION, competitionId), {
            status,
            updatedAt: new Date().toISOString(),
        });
    },

    respondToCompetition: async (
        competitionId: string,
        profileId: string,
        status: Extract<CompetitionParticipantStatus, 'accepted' | 'declined'>
    ): Promise<void> => {
        const competitionRef = doc(db, COMPETITIONS_COLLECTION, competitionId);
        await runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(competitionRef);
            if (!snapshot.exists()) {
                throw new Error('competition_not_found');
            }

            const competition = normalizeCompetition(snapshot.id, snapshot.data());
            const now = new Date().toISOString();
            const participants = competition.participants.map((participant) => {
                if (participant.profileId !== profileId) return participant;
                return {
                    ...participant,
                    status,
                    respondedAt: now,
                    joinedAt: status === 'accepted' ? (participant.joinedAt || now) : participant.joinedAt ?? null,
                };
            });

            transaction.update(competitionRef, {
                participants,
                participantProfileIds: uniqueProfileIds(participants),
                updatedAt: now,
            });
        });
    },

    getCompetitionInvitePreview: async (token: string): Promise<CompetitionInvitePreview | null> => {
        const invitesQuery = query(
            collection(db, COMPETITION_INVITES_COLLECTION),
            where('token', '==', token),
            limit(1)
        );
        const inviteSnapshot = await getDocs(invitesQuery);
        if (inviteSnapshot.empty) return null;

        const inviteDocument = inviteSnapshot.docs[0];
        const invite = normalizeInvite(inviteDocument.id, inviteDocument.data());
        if (invite.status !== 'active') return null;
        if (invite.expiresAt && invite.expiresAt < new Date().toISOString()) return null;

        return resolveInvitePreview(invite);
    },

    ensureCompetitionInvite: async (competitionId: string, createdByProfileId: string): Promise<CompetitionInvite> => {
        const competitionRef = doc(db, COMPETITIONS_COLLECTION, competitionId);
        const competitionSnapshot = await getDoc(competitionRef);
        if (!competitionSnapshot.exists()) {
            throw new Error('competition_not_found');
        }

        const competition = normalizeCompetition(competitionSnapshot.id, competitionSnapshot.data());
        if (competition.inviteTokenIds?.length) {
            const inviteSnapshot = await getDoc(doc(db, COMPETITION_INVITES_COLLECTION, competition.inviteTokenIds[0]));
            if (inviteSnapshot.exists()) {
                return normalizeInvite(inviteSnapshot.id, inviteSnapshot.data());
            }
        }

        const invite = createCompetitionInviteRecord(competitionId, createdByProfileId);
        const batch = writeBatch(db);
        batch.set(doc(db, COMPETITION_INVITES_COLLECTION, invite.id), invite);
        batch.update(competitionRef, {
            inviteTokenIds: [...(competition.inviteTokenIds || []), invite.id],
            updatedAt: new Date().toISOString(),
        });
        await batch.commit();
        return invite;
    },

    acceptCompetitionInviteToken: async (
        token: string,
        participant: InviteParticipant
    ): Promise<CompetitionInvitePreview> => {
        const preview = await competitionService.getCompetitionInvitePreview(token);
        if (!preview) {
            throw new Error('invite_not_found');
        }

        const inviteRef = doc(db, COMPETITION_INVITES_COLLECTION, preview.invite.id);
        const competitionRef = doc(db, COMPETITIONS_COLLECTION, preview.competition.id);

        await runTransaction(db, async (transaction) => {
            const inviteSnapshot = await transaction.get(inviteRef);
            const competitionSnapshot = await transaction.get(competitionRef);

            if (!inviteSnapshot.exists()) {
                throw new Error('invite_not_found');
            }
            if (!competitionSnapshot.exists()) {
                throw new Error('competition_not_found');
            }

            const invite = normalizeInvite(inviteSnapshot.id, inviteSnapshot.data());
            const competition = normalizeCompetition(competitionSnapshot.id, competitionSnapshot.data());

            if (invite.status !== 'active') {
                throw new Error('invite_inactive');
            }
            if (invite.expiresAt && invite.expiresAt < new Date().toISOString()) {
                throw new Error('invite_expired');
            }

            const alreadyAccepted = invite.acceptedProfileIds.includes(participant.profileId);
            if (!alreadyAccepted && invite.maxUses != null && invite.acceptedProfileIds.length >= invite.maxUses) {
                throw new Error('invite_full');
            }

            const now = new Date().toISOString();
            const existingParticipant = competition.participants.find((entry) => entry.profileId === participant.profileId);
            const participants: CompetitionParticipant[] = existingParticipant
                ? competition.participants.map((entry) => entry.profileId === participant.profileId
                    ? {
                        ...entry,
                        displayName: participant.displayName || entry.displayName,
                        status: 'accepted' as const,
                        respondedAt: now,
                        joinedAt: entry.joinedAt || now,
                        source: entry.source || 'link',
                    }
                    : entry)
                : [
                    ...competition.participants,
                    {
                        profileId: participant.profileId,
                        displayName: participant.displayName,
                        status: 'accepted' as const,
                        invitedAt: now,
                        respondedAt: now,
                        joinedAt: now,
                        source: 'link' as const,
                    },
                ];

            const acceptedProfileIds = alreadyAccepted
                ? invite.acceptedProfileIds
                : [...invite.acceptedProfileIds, participant.profileId];

            transaction.update(competitionRef, {
                participants,
                participantProfileIds: uniqueProfileIds(participants),
                updatedAt: now,
            });
            transaction.update(inviteRef, {
                acceptedProfileIds,
            });
        });

        const updatedPreview = await competitionService.getCompetitionInvitePreview(token);
        if (!updatedPreview) {
            throw new Error('invite_not_found');
        }
        return updatedPreview;
    },
};
