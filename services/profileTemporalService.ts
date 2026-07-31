import type { DailyStats } from '../types';
import { deriveProfileTemporalMetadata } from '../utils/profileTemporal';
import { firebaseService } from './firebaseService';

/**
 * Publish profile-clock evidence only after the corresponding stats snapshot
 * has been saved successfully. Timezone persistence is auxiliary: a temporary
 * profile-metadata write failure must not discard otherwise valid Oura data.
 */
export const persistDerivedProfileTemporalMetadata = async (
    profileId: string,
    data: DailyStats
): Promise<void> => {
    const metadata = deriveProfileTemporalMetadata(data);
    if (!metadata) return;

    try {
        await firebaseService.persistProfileTemporalMetadata(profileId, metadata);
    } catch (error) {
        console.warn('Failed to persist profile temporal metadata:', error);
    }
};
