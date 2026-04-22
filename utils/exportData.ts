import { DailyStats, HeartRate, SleepSession } from '../types';

export type ExportDateRange = {
    start: string;
    end: string;
};

const collectDefinedDays = (days: Array<string | null | undefined>): string[] => (
    Array.from(new Set(days.filter((day): day is string => Boolean(day)))).sort()
);

const getSessionRelatedDays = (session: SleepSession): string[] => (
    collectDefinedDays([
        session.day,
        session.bedtime_start?.slice(0, 10),
        session.bedtime_end?.slice(0, 10),
    ])
);

export const isDayWithinRange = (
    day: string | null | undefined,
    range?: ExportDateRange | null,
): boolean => {
    if (!day) return false;
    if (!range) return true;
    return day >= range.start && day <= range.end;
};

export const filterByDayRange = <T extends { day?: string | null }>(
    items: T[] | undefined,
    range?: ExportDateRange | null,
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => isDayWithinRange(item.day, range));
};

export const filterHeartRateByRange = (
    items: HeartRate[] | undefined,
    range?: ExportDateRange | null,
): HeartRate[] => {
    if (!items?.length) return [];
    return items.filter((item) => isDayWithinRange(item.timestamp?.slice(0, 10), range));
};

export const filterSleepSessionsByRange = (
    sessions: SleepSession[] | undefined,
    range?: ExportDateRange | null,
): SleepSession[] => {
    if (!sessions?.length) return [];
    return sessions.filter((session) => getSessionRelatedDays(session).some((day) => isDayWithinRange(day, range)));
};

export const filterTagItemsByRange = <T extends {
    day?: string | null;
    start_day?: string | null;
    start_time?: string | null;
}>(
    items: T[] | undefined,
    range?: ExportDateRange | null,
): T[] => {
    if (!items?.length) return [];
    return items.filter((item) => (
        isDayWithinRange(item.day, range)
        || isDayWithinRange(item.start_day, range)
        || isDayWithinRange(item.start_time?.slice(0, 10), range)
    ));
};

export const getSessionsForDay = (sessions: SleepSession[] | undefined, day: string): SleepSession[] => {
    if (!sessions?.length) return [];
    return sessions.filter((session) => {
        if (session.type === 'deleted') return false;
        return getSessionRelatedDays(session).includes(day);
    });
};

export const pickBestSession = (sessions: SleepSession[]): SleepSession | undefined => {
    if (!sessions.length) return undefined;
    return [...sessions].sort((left, right) => {
        const rightDuration = right.total_sleep_duration ?? right.time_in_bed ?? 0;
        const leftDuration = left.total_sleep_duration ?? left.time_in_bed ?? 0;
        if (rightDuration !== leftDuration) return rightDuration - leftDuration;
        return new Date(right.bedtime_end || 0).getTime() - new Date(left.bedtime_end || 0).getTime();
    })[0];
};

export const getBestSessionForDay = (data: DailyStats, day: string): SleepSession | undefined => (
    pickBestSession(getSessionsForDay(data.session, day))
);

export const getSessionDays = (sessions: SleepSession[] | undefined): string[] => {
    if (!sessions?.length) return [];
    return collectDefinedDays(
        sessions.flatMap((session) => (session.type === 'deleted' ? [] : getSessionRelatedDays(session))),
    );
};

export const getNightlyVitalsRows = (data: DailyStats, range?: ExportDateRange | null) => {
    return getSessionDays(data.session).reduce<Array<Record<string, string | number>>>(
        (rows, day) => {
            if (!isDayWithinRange(day, range)) return rows;

            const session = getBestSessionForDay(data, day);
            if (!session) return rows;

            rows.push({
                date: day,
                session_type: session.type ?? '',
                bedtime_start: session.bedtime_start ?? '',
                bedtime_end: session.bedtime_end ?? '',
                total_sleep_duration_s: session.total_sleep_duration ?? '',
                time_in_bed_s: session.time_in_bed ?? '',
                average_heart_rate_bpm: session.average_heart_rate ?? '',
                lowest_heart_rate_bpm: session.lowest_heart_rate ?? '',
                average_hrv_ms: session.average_hrv ?? '',
                average_breaths_per_min: session.average_breath ?? '',
            });

            return rows;
        },
        [],
    );
};

export const getNightlyRestingHeartRateRows = (data: DailyStats, range?: ExportDateRange | null) => (
    collectDefinedDays(
        data.session
            .filter((session) => session.type !== 'deleted')
            .map((session) => session.day),
    )
        .filter((day) => isDayWithinRange(day, range))
        .reduce<Array<{ date: string; nightly_resting_heart_rate_bpm: number }>>((rows, day) => {
            const session = pickBestSession(
                data.session.filter((candidate) => candidate.type !== 'deleted' && candidate.day === day),
            );

            if (session?.lowest_heart_rate == null) {
                return rows;
            }

            rows.push({
                date: day,
                nightly_resting_heart_rate_bpm: session.lowest_heart_rate,
            });

            return rows;
        }, [])
);

export const getAvailableExportRange = (data: DailyStats): ExportDateRange | null => {
    const allDays = collectDefinedDays([
        ...data.sleep.map((item) => item.day),
        ...data.readiness.map((item) => item.day),
        ...data.activity.map((item) => item.day),
        ...data.session.flatMap((session) => getSessionRelatedDays(session)),
        ...data.spo2.map((item) => item.day),
        ...data.stress.map((item) => item.day),
        ...data.resilience.map((item) => item.day),
        ...(data.cardiovascularAge as Array<{ day?: string | null }>).map((item) => item.day),
        ...(data.vo2Max as Array<{ day?: string | null }>).map((item) => item.day),
        ...(data.heartrate ?? []).map((item) => item.timestamp?.slice(0, 10)),
        ...(data.workout ?? []).map((item) => item.day),
        ...(data.tag ?? []).flatMap((item: { day?: string | null; start_day?: string | null; start_time?: string | null }) => [
            item.day,
            item.start_day,
            item.start_time?.slice(0, 10),
        ]),
        ...(data.enhancedTag ?? []).flatMap((item: { day?: string | null; start_day?: string | null; start_time?: string | null }) => [
            item.day,
            item.start_day,
            item.start_time?.slice(0, 10),
        ]),
    ]);

    if (!allDays.length) return null;

    return {
        start: allDays[0],
        end: allDays[allDays.length - 1],
    };
};
