import { ouraService } from './ouraService';
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

const hasScope = (grantedScopes: string[] | undefined, requiredScope: string): boolean => {
    if (!grantedScopes || grantedScopes.length === 0) return true;
    return grantedScopes.includes(requiredScope);
};

const DATA_TYPES = [
    { key: 'sleep', label: 'Sleep', fetch: 'getDailySleep', requiredScope: 'daily' },
    { key: 'readiness', label: 'Readiness', fetch: 'getDailyReadiness', requiredScope: 'daily' },
    { key: 'activity', label: 'Activity', fetch: 'getDailyActivity', requiredScope: 'daily' },
    { key: 'session', label: 'Sleep Sessions', fetch: 'getSleepSessions', requiredScope: 'daily' },
    { key: 'spo2', label: 'SpO2', fetch: 'getDailySpO2', requiredScope: 'spo2' },
    { key: 'stress', label: 'Stress', fetch: 'getDailyStress', requiredScope: 'daily' },
    { key: 'resilience', label: 'Resilience', fetch: 'getDailyResilience', requiredScope: 'daily' },
] as const;

/**
 * Get the most recent date from existing data
 */
const getMostRecentDate = (existingData: DailyStats | undefined): string | null => {
    if (!existingData) return null;

    // Find the most recent date across all data types
    const allDates: string[] = [];

    if (existingData.sleep?.length) allDates.push(existingData.sleep[0].day);
    if (existingData.readiness?.length) allDates.push(existingData.readiness[0].day);
    if (existingData.activity?.length) allDates.push(existingData.activity[0].day);
    if (existingData.session?.length) allDates.push(existingData.session[0].day);
    if (existingData.spo2?.length) allDates.push(existingData.spo2[0].day);
    if (existingData.stress?.length) allDates.push(existingData.stress[0].day);
    if (existingData.resilience?.length) allDates.push(existingData.resilience[0].day);

    if (allDates.length === 0) return null;

    // Return the most recent date
    return allDates.sort().reverse()[0];
};

/**
 * Format a date for display
 */
const formatDateRange = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

    if (start === end) {
        return startDate.toLocaleDateString('en-US', options);
    }
    return `${startDate.toLocaleDateString('en-US', options)} → ${endDate.toLocaleDateString('en-US', options)}`;
};

/**
 * Smart sync - only fetches data from the last known date to today
 */
export const smartSync = async (
    token: string,
    existingData: DailyStats | undefined,
    onProgress: SyncProgressCallback,
    grantedScopes?: string[]
): Promise<Partial<DailyStats>> => {
    const today = new Date().toISOString().split('T')[0];
    const lastDate = getMostRecentDate(existingData);

    // If no existing data, fetch last 30 days
    // If we have data, fetch from last date to today
    const startDate = lastDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    })();

    const dateRange = formatDateRange(startDate, today);

    const enabledDataTypes = DATA_TYPES.filter(type => hasScope(grantedScopes, type.requiredScope));

    if (enabledDataTypes.length === 0) {
        onProgress({
            status: 'complete',
            currentStep: 'Sync complete!',
            stepsCompleted: 0,
            totalSteps: 0,
            details: 'No authorized scopes available for sync',
        });
        return {};
    }

    onProgress({
        status: 'syncing',
        currentStep: 'Starting sync...',
        stepsCompleted: 0,
        totalSteps: enabledDataTypes.length,
        details: `Fetching data: ${dateRange}`,
    });

    const result: Partial<DailyStats> = {};

    for (let i = 0; i < enabledDataTypes.length; i++) {
        const dataType = enabledDataTypes[i];

        onProgress({
            status: 'syncing',
            currentStep: `Syncing ${dataType.label}...`,
            stepsCompleted: i,
            totalSteps: enabledDataTypes.length,
            details: dateRange,
        });

        try {
            const fetchMethod = ouraService[dataType.fetch as keyof typeof ouraService] as (
                token: string,
                start?: string,
                end?: string
            ) => Promise<any[]>;

            const data = await fetchMethod.call(ouraService, token, startDate, today);
            (result as any)[dataType.key] = data;
        } catch (err) {
            console.warn(`Failed to sync ${dataType.label}:`, err);
            // Continue with other data types
        }
    }

    onProgress({
        status: 'complete',
        currentStep: 'Sync complete!',
        stepsCompleted: enabledDataTypes.length,
        totalSteps: enabledDataTypes.length,
        details: `Updated: ${dateRange}`,
    });

    return result;
};

/**
 * Full sync - fetches ALL historical data (for settings page)
 */
export const fullSync = async (
    token: string,
    onProgress: SyncProgressCallback,
    grantedScopes?: string[]
): Promise<DailyStats> => {
    const today = new Date().toISOString().split('T')[0];
    const startDate = '2016-01-01'; // Oura Gen 1 era

    const enabledDataTypes = DATA_TYPES.filter(type => hasScope(grantedScopes, type.requiredScope));

    if (enabledDataTypes.length === 0) {
        onProgress({
            status: 'complete',
            currentStep: 'Full sync complete!',
            stepsCompleted: 0,
            totalSteps: 0,
            details: 'No authorized scopes available for sync',
        });
        return {
            sleep: [],
            readiness: [],
            activity: [],
            session: [],
            spo2: [],
            stress: [],
            resilience: [],
        };
    }

    onProgress({
        status: 'syncing',
        currentStep: 'Starting full sync...',
        stepsCompleted: 0,
        totalSteps: enabledDataTypes.length,
        details: 'Fetching all historical data (this may take a moment)',
    });

    const result: Partial<DailyStats> = {};

    for (let i = 0; i < enabledDataTypes.length; i++) {
        const dataType = enabledDataTypes[i];

        onProgress({
            status: 'syncing',
            currentStep: `Syncing all ${dataType.label} data...`,
            stepsCompleted: i,
            totalSteps: enabledDataTypes.length,
            details: 'Fetching complete history',
        });

        try {
            const fetchMethod = ouraService[dataType.fetch as keyof typeof ouraService] as (
                token: string,
                start?: string,
                end?: string
            ) => Promise<any[]>;

            const data = await fetchMethod.call(ouraService, token, startDate, today);
            (result as any)[dataType.key] = data;
        } catch (err) {
            console.warn(`Failed to sync ${dataType.label}:`, err);
        }
    }

    onProgress({
        status: 'complete',
        currentStep: 'Full sync complete!',
        stepsCompleted: enabledDataTypes.length,
        totalSteps: enabledDataTypes.length,
        details: 'All historical data synced',
    });

    return result as DailyStats;
};
