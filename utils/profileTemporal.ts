import { DailyStats, UserProfile } from '../types';
import {
    getBufferedFetchEndISODate,
    getCurrentHourForOffset,
    getISODateInTimeZone,
    getMillisecondsUntilNextOffsetMidnight,
    getOffsetIsoDay,
    getRelativeOffsetISODate,
    parseUtcOffsetMinutesFromIso,
} from './temporal';
import type { ProfileOffsetSource } from './temporal';

export type ProfileTemporalMetadata = {
    lastKnownUtcOffsetMinutes: number;
    lastKnownOffsetObservedAt: string;
    lastKnownOffsetSource: ProfileOffsetSource;
};

type OffsetCandidate = ProfileTemporalMetadata & {
    observedAtMs: number;
    priority: number;
};

const PRIORITY_BY_SOURCE: Record<ProfileOffsetSource, number> = {
    session_bedtime_end: 0,
    session_bedtime_start: 1,
    heartrate: 2,
    workout_end: 3,
    workout_start: 4,
    sleep_time_window: 5,
};

const toCandidate = (observedAt: string | null | undefined, source: ProfileOffsetSource): OffsetCandidate | null => {
    if (!observedAt) return null;
    const offsetMinutes = parseUtcOffsetMinutesFromIso(observedAt);
    if (offsetMinutes == null) return null;
    const observedAtMs = new Date(observedAt).getTime();
    if (!Number.isFinite(observedAtMs)) return null;

    return {
        lastKnownUtcOffsetMinutes: offsetMinutes,
        lastKnownOffsetObservedAt: observedAt,
        lastKnownOffsetSource: source,
        observedAtMs,
        priority: PRIORITY_BY_SOURCE[source],
    };
};

const toSleepTimeCandidate = (item: any): OffsetCandidate | null => {
    if (item?.day_tz == null || item?.day == null) return null;
    const offsetMinutes = Math.round(Number(item.day_tz) / 60);
    if (!Number.isFinite(offsetMinutes)) return null;

    const observedAt = `${item.day}T12:00:00${offsetMinutes >= 0 ? '+' : '-'}${Math.abs(Math.trunc(offsetMinutes / 60)).toString().padStart(2, '0')}:${Math.abs(offsetMinutes % 60).toString().padStart(2, '0')}`;
    const observedAtMs = new Date(`${item.day}T12:00:00Z`).getTime();
    if (!Number.isFinite(observedAtMs)) return null;

    return {
        lastKnownUtcOffsetMinutes: offsetMinutes,
        lastKnownOffsetObservedAt: observedAt,
        lastKnownOffsetSource: 'sleep_time_window',
        observedAtMs,
        priority: PRIORITY_BY_SOURCE.sleep_time_window,
    };
};

const chooseNewestCandidate = (candidates: Array<OffsetCandidate | null>): OffsetCandidate | null => {
    return candidates
        .filter((candidate): candidate is OffsetCandidate => candidate !== null)
        .sort((left, right) => {
            if (right.observedAtMs !== left.observedAtMs) return right.observedAtMs - left.observedAtMs;
            return left.priority - right.priority;
        })[0] || null;
};

export const deriveProfileTemporalMetadata = (data: DailyStats): ProfileTemporalMetadata | null => {
    const sessionCandidates = chooseNewestCandidate([
        ...(data.session || []).map((session) => toCandidate(session.bedtime_end, 'session_bedtime_end')),
        ...(data.session || []).map((session) => toCandidate(session.bedtime_start, 'session_bedtime_start')),
    ]);

    const heartrateCandidate = chooseNewestCandidate(
        (data.heartrate || []).map((item) => toCandidate(item.timestamp, 'heartrate'))
    );

    const workoutCandidate = chooseNewestCandidate([
        ...(data.workout || []).map((item) => toCandidate(item.end_datetime, 'workout_end')),
        ...(data.workout || []).map((item) => toCandidate(item.start_datetime, 'workout_start')),
    ]);

    const sleepTimeCandidate = chooseNewestCandidate(
        (data.sleepTime || []).map((item) => toSleepTimeCandidate(item))
    );

    const merged = chooseNewestCandidate([
        sessionCandidates,
        workoutCandidate,
        sleepTimeCandidate,
    ]);

    if (!merged) return null;

    const {
        lastKnownUtcOffsetMinutes,
        lastKnownOffsetObservedAt,
        lastKnownOffsetSource,
    } = merged;

    return {
        lastKnownUtcOffsetMinutes,
        lastKnownOffsetObservedAt,
        lastKnownOffsetSource,
    };
};

export const getProfileOffsetMinutes = (profile?: Pick<UserProfile, 'lastKnownUtcOffsetMinutes'> | null): number | null => {
    const offsetMinutes = profile?.lastKnownUtcOffsetMinutes;
    return typeof offsetMinutes === 'number' && Number.isFinite(offsetMinutes)
        ? offsetMinutes
        : null;
};

export const getProfileLocalISODate = (profile?: Pick<UserProfile, 'lastKnownUtcOffsetMinutes'> | null, baseDate: Date = new Date()): string => {
    const offsetMinutes = getProfileOffsetMinutes(profile);
    if (offsetMinutes == null) {
        return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
    }
    return getOffsetIsoDay(offsetMinutes, baseDate);
};

export const getProfileRelativeISODate = (
    profile: Pick<UserProfile, 'lastKnownUtcOffsetMinutes'> | null | undefined,
    daysDelta: number,
    baseDate: Date = new Date()
): string => {
    const offsetMinutes = getProfileOffsetMinutes(profile);
    if (offsetMinutes == null) {
        const next = new Date(baseDate);
        next.setDate(next.getDate() + daysDelta);
        return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    }
    return getRelativeOffsetISODate(daysDelta, offsetMinutes, baseDate);
};

export const getProfileCurrentHour = (
    profile: Pick<UserProfile, 'lastKnownUtcOffsetMinutes'> | null | undefined,
    baseDate: Date = new Date()
): number => {
    const offsetMinutes = getProfileOffsetMinutes(profile);
    if (offsetMinutes == null) return baseDate.getHours();
    return getCurrentHourForOffset(offsetMinutes, baseDate);
};

export const getProfileFetchEndISODate = (
    profile: Pick<UserProfile, 'lastKnownUtcOffsetMinutes'> | null | undefined,
    baseDate: Date = new Date(),
    futureDays: number = 2
): string => getBufferedFetchEndISODate(getProfileOffsetMinutes(profile), baseDate, futureDays);

export const getMillisecondsUntilNextProfileMidnight = (
    profile: Pick<UserProfile, 'lastKnownUtcOffsetMinutes'> | null | undefined,
    baseDate: Date = new Date(),
    bufferMs: number = 5_000
): number => {
    const offsetMinutes = getProfileOffsetMinutes(profile);
    if (offsetMinutes == null) {
        const now = baseDate;
        const nextMidnight = new Date(now);
        nextMidnight.setHours(24, 0, 0, 0);
        return Math.max((nextMidnight.getTime() + bufferMs) - now.getTime(), 1_000);
    }
    return getMillisecondsUntilNextOffsetMidnight(offsetMinutes, baseDate, bufferMs);
};

export const getCompetitionTodayISODate = (
    competition: Pick<UserProfile, never> | { timeZone?: string | null },
    baseDate: Date = new Date()
): string => {
    const timeZone = 'timeZone' in competition && typeof competition.timeZone === 'string' && competition.timeZone.trim().length > 0
        ? competition.timeZone
        : null;
    if (!timeZone) {
        return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(baseDate.getDate()).padStart(2, '0')}`;
    }
    return getISODateInTimeZone(timeZone, baseDate);
};
