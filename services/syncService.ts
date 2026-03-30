import { FULL_HISTORY_START_DATE, syncDailyStats } from '../hooks/useOuraData';
import { DailyStats } from '../types';
import { formatLocalISODate, getOuraFetchEndISODate } from '../utils/date';

export interface SyncProgress {
    status: 'idle' | 'syncing' | 'complete' | 'error';
    currentStep: string;
    stepsCompleted: number;
    totalSteps: number;
    details: string;
    error?: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

type SyncAuthContext = {
    grantedScopes?: string[];
    availabilityKey?: string;
    profileId?: string;
};

const getToday = () => formatLocalISODate();
const getFetchEndDate = () => getOuraFetchEndISODate();

const describeCoverage = (data: DailyStats): { start: string; end: string; days: number } | null => {
    const days = [
        ...(data.sleep || []).map((item: any) => item?.day),
        ...(data.readiness || []).map((item: any) => item?.day),
        ...(data.activity || []).map((item: any) => item?.day),
        ...(data.session || []).map((item: any) => item?.day),
        ...(data.spo2 || []).map((item: any) => item?.day),
        ...(data.stress || []).map((item: any) => item?.day),
        ...(data.resilience || []).map((item: any) => item?.day),
    ].filter((day): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day));

    if (days.length === 0) return null;

    const uniqueDays = Array.from(new Set(days)).sort();
    return {
        start: uniqueDays[0],
        end: uniqueDays[uniqueDays.length - 1],
        days: uniqueDays.length,
    };
};

/**
 * Canonical sync path: always fetch complete Oura history.
 * This keeps regular flow, full sync, and export consistent.
 */
export const smartSync = async (
    token: string,
    existingData: DailyStats | undefined,
    onProgress: SyncProgressCallback,
    authContext: SyncAuthContext = {}
): Promise<Partial<DailyStats>> => {
    const today = getToday();
    const fetchEndDate = getFetchEndDate();

    onProgress({
        status: 'syncing',
        currentStep: 'Syncing new data...',
        stepsCompleted: 0,
        totalSteps: 1,
        details: `Recent changes up to ${today}`,
    });

    const data = await syncDailyStats(token, existingData, {
        mode: 'incremental',
        endDate: fetchEndDate,
        grantedScopes: authContext.grantedScopes,
        availabilityKey: authContext.availabilityKey,
        profileId: authContext.profileId,
    });

    const coverage = describeCoverage(data as DailyStats);
    const details = coverage
        ? `${coverage.start} → ${coverage.end} (${coverage.days} days loaded)`
        : `Updated through ${today}`;

    onProgress({
        status: 'complete',
        currentStep: 'Sync complete!',
        stepsCompleted: 1,
        totalSteps: 1,
        details,
    });

    return data;
};

/**
 * Full sync uses the same canonical history fetch path.
 */
export const fullSync = async (
    token: string,
    onProgress: SyncProgressCallback,
    authContext: SyncAuthContext = {}
): Promise<DailyStats> => {
    const today = getToday();
    const fetchEndDate = getFetchEndDate();

    onProgress({
        status: 'syncing',
        currentStep: 'Syncing complete history...',
        stepsCompleted: 0,
        totalSteps: 1,
        details: `${FULL_HISTORY_START_DATE} → ${today}`,
    });

    const data = await syncDailyStats(token, undefined, {
        mode: 'full',
        endDate: fetchEndDate,
        grantedScopes: authContext.grantedScopes,
        availabilityKey: authContext.availabilityKey,
        profileId: authContext.profileId,
    });

    const coverage = describeCoverage(data);
    const details = coverage
        ? `${coverage.start} → ${coverage.end} (${coverage.days} days loaded)`
        : `${FULL_HISTORY_START_DATE} → ${today}`;

    onProgress({
        status: 'complete',
        currentStep: 'Full sync complete!',
        stepsCompleted: 1,
        totalSteps: 1,
        details,
    });

    return data;
};
