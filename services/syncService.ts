import { FULL_HISTORY_START_DATE, fetchDailyStats, mergeDailyStats, syncDailyStats } from '../hooks/useOuraData';
import { saveProfileStats } from './firestoreStatsService';
import { DailyStats } from '../types';
import { getOuraFetchEndISODate } from '../utils/date';
import { getOffsetIsoDay } from '../utils/temporal';

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
    profileOffsetMinutes?: number | null;
};

const generateYearChunks = (
    startIso: string,
    endIso: string
): Array<{ start: string; end: string; label: string }> => {
    const chunks: Array<{ start: string; end: string; label: string }> = [];
    let currentStart = startIso;
    const endYear = parseInt(endIso.slice(0, 4), 10);

    while (currentStart <= endIso) {
        const year = parseInt(currentStart.slice(0, 4), 10);
        const yearEnd = `${year}-12-31`;
        const chunkEnd = yearEnd <= endIso ? yearEnd : endIso;

        chunks.push({ start: currentStart, end: chunkEnd, label: String(year) });

        currentStart = `${year + 1}-01-01`;
        if (year >= endYear) break;
    }

    return chunks;
};

const getToday = (offsetMinutes?: number | null) => (
    typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)
        ? getOffsetIsoDay(offsetMinutes)
        : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
);
const getFetchEndDate = (offsetMinutes?: number | null) => getOuraFetchEndISODate(new Date(), offsetMinutes);

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
 * Default sync path: fetch only the recent delta and merge it into cached history.
 */
export const smartSync = async (
    token: string,
    existingData: DailyStats | undefined,
    onProgress: SyncProgressCallback,
    authContext: SyncAuthContext = {}
): Promise<DailyStats> => {
    const today = getToday(authContext.profileOffsetMinutes);
    const fetchEndDate = getFetchEndDate(authContext.profileOffsetMinutes);

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
        profileOffsetMinutes: authContext.profileOffsetMinutes,
    });

    const coverage = describeCoverage(data);
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
 * Full sync processes history one year at a time to avoid request timeouts
 * and to save incremental progress after each chunk.
 */
export const fullSync = async (
    token: string,
    onProgress: SyncProgressCallback,
    authContext: SyncAuthContext = {}
): Promise<DailyStats> => {
    const today = getToday(authContext.profileOffsetMinutes);
    const fetchEndDate = getFetchEndDate(authContext.profileOffsetMinutes);
    const chunks = generateYearChunks(FULL_HISTORY_START_DATE, fetchEndDate);
    const totalSteps = chunks.length;

    let accumulated: DailyStats | undefined;

    for (let i = 0; i < chunks.length; i++) {
        const { start, end, label } = chunks[i];
        const isLast = i === chunks.length - 1;

        onProgress({
            status: 'syncing',
            currentStep: `Syncing ${label}...`,
            stepsCompleted: i,
            totalSteps,
            details: `${start} → ${end}`,
        });

        const chunkData = await fetchDailyStats(token, { start, end }, {
            includeStaticCollections: isLast,
            fullHeartrate: true,
            requireCompleteData: true,
            grantedScopes: authContext.grantedScopes,
            availabilityKey: authContext.availabilityKey,
            profileId: authContext.profileId,
            profileOffsetMinutes: authContext.profileOffsetMinutes,
        });

        accumulated = accumulated ? mergeDailyStats(accumulated, chunkData) : chunkData;
    }

    const result = accumulated!;
    if (authContext.profileId) {
        await saveProfileStats(authContext.profileId, result, 'full');
    }
    const coverage = describeCoverage(result);
    const details = coverage
        ? `${coverage.start} → ${coverage.end} (${coverage.days} days loaded)`
        : `${FULL_HISTORY_START_DATE} → ${today}`;

    onProgress({
        status: 'complete',
        currentStep: 'Full sync complete!',
        stepsCompleted: totalSteps,
        totalSteps,
        details,
    });

    return result;
};
