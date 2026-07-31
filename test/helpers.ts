import { DailyStats } from '../types';

export const createEmptyDailyStats = (overrides: Partial<DailyStats> = {}): DailyStats => ({
    personalInfo: null,
    sleep: [],
    readiness: [],
    activity: [],
    session: [],
    spo2: [],
    stress: [],
    resilience: [],
    heartrate: [],
    workout: [],
    guidedSession: [],
    sleepTime: [],
    tag: [],
    enhancedTag: [],
    restModePeriod: [],
    ringConfiguration: [],
    ringBatteryLevel: [],
    cardiovascularAge: [],
    vo2Max: [],
    ...overrides,
});
