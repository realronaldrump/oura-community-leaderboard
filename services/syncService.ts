import { FULL_HISTORY_START_DATE, syncDailyStats } from '../hooks/useOuraData';
import { DailyStats } from '../types';

export interface SyncProgress {
    status: 'idle' | 'syncing' | 'complete' | 'error';
    currentStep: string;
    stepsCompleted: number;
    totalSteps: number;
    details: string;
    error?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

const getToday = () => new Date().toISOString().split('T')[0];

/**
 * Canonical sync path: always fetch complete Oura history.
 * This keeps regular flow, full sync, and export consistent.
 */
export const smartSync = async (
    token: string,
    existingData: DailyStats | undefined,
    onProgress: SyncProgressCallback
): Promise<Partial<DailyStats>> => {
    const today = getToday();

    onProgress({
        status: 'syncing',
        currentStep: 'Syncing new data...',
        stepsCompleted: 0,
        totalSteps: 1,
        details: `Recent changes up to ${today}`,
    });

    const data = await syncDailyStats(token, existingData, {
        mode: 'incremental',
        endDate: today,
    });

    onProgress({
        status: 'complete',
        currentStep: 'Sync complete!',
        stepsCompleted: 1,
        totalSteps: 1,
        details: `Updated through ${today}`,
    });

    return data;
};

/**
 * Full sync uses the same canonical history fetch path.
 */
export const fullSync = async (
    token: string,
    onProgress: SyncProgressCallback
): Promise<DailyStats> => {
    const today = getToday();

    onProgress({
        status: 'syncing',
        currentStep: 'Syncing complete history...',
        stepsCompleted: 0,
        totalSteps: 1,
        details: `${FULL_HISTORY_START_DATE} → ${today}`,
    });

    const data = await syncDailyStats(token, undefined, {
        mode: 'full',
        endDate: today,
    });

    onProgress({
        status: 'complete',
        currentStep: 'Full sync complete!',
        stepsCompleted: 1,
        totalSteps: 1,
        details: `${FULL_HISTORY_START_DATE} → ${today}`,
    });

    return data;
};
