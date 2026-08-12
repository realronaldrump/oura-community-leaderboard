import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Database, TrendingUp, AlertCircle, Heart, Activity, Moon, Zap, Wind, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { useUser } from '../contexts/UserContext';
import {
    getProfileStatsMetadata,
    getStoredDailyStats,
    type ProfileStatsMetadata,
} from '../services/firestoreStatsService';
import { DailyStats } from '../types';
import { formatISODateForDisplay } from '../utils/date';
import { filterDailyStatsForProfile, getTotalExcludedDayCount } from '../utils/dataExclusions';
import {
    ExportDateRange,
    filterByDayRange,
    filterHeartRateByRange,
    filterSleepSessionsByRange,
    filterTagItemsByRange,
    getAvailableExportRange,
    getBestSessionForDay,
    getNightlyRestingHeartRateRows,
    getNightlyVitalsRows,
    getSessionDays,
} from '../utils/exportData';
import {
    buildCompleteOuraExport,
    createComprehensiveCsv,
    OURA_COLLECTION_NAMES,
    type OuraCollectionName,
} from '../utils/ouraExport';

const METERS_TO_MILES = 0.000621371;
const CELSIUS_DELTA_TO_FAHRENHEIT_DELTA = 9 / 5;

const toMiles = (meters: number | null | undefined): number | '' =>
    meters == null ? '' : Number((meters * METERS_TO_MILES).toFixed(3));

const toFahrenheitDelta = (celsiusDelta: number | null | undefined): number | '' =>
    celsiusDelta == null ? '' : Number((celsiusDelta * CELSIUS_DELTA_TO_FAHRENHEIT_DELTA).toFixed(2));

const safeUnparse = (rows: unknown[]): string => Papa.unparse(rows, { escapeFormulae: true });

const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const downloadJSON = (value: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const humanizeCollectionName = (name: OuraCollectionName): string => (
    name
        .replace('vO2', 'VO2')
        .split('_')
        .map((part) => part === 'VO2' ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' ')
);

const DataExport: React.FC = () => {
    const { activeProfile } = useUser();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DailyStats | null>(null);
    const [metadata, setMetadata] = useState<ProfileStatsMetadata | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedRange, setSelectedRange] = useState<ExportDateRange | null>(null);

    useEffect(() => {
        if (!activeProfile) return;
        setIsLoading(true);
        setError(null);
        Promise.all([
            getStoredDailyStats(activeProfile.id),
            getProfileStatsMetadata(activeProfile.id),
        ])
            .then(([storedData, storedMetadata]) => {
                setData(storedData);
                setMetadata(storedMetadata);
            })
            .catch(() => setError('Saved history is temporarily unavailable. It will keep filling in automatically.'))
            .finally(() => setIsLoading(false));
    }, [activeProfile?.id]);

    const analysisData = useMemo(
        () => filterDailyStatsForProfile(data ?? undefined, activeProfile) ?? null,
        [activeProfile, data]
    );
    const excludedDayCount = useMemo(
        () => getTotalExcludedDayCount(activeProfile?.dataExclusionRanges),
        [activeProfile?.dataExclusionRanges]
    );
    const availableRange = useMemo(
        () => (analysisData ? getAvailableExportRange(analysisData, activeProfile?.lastKnownUtcOffsetMinutes) : null),
        [activeProfile?.lastKnownUtcOffsetMinutes, analysisData],
    );
    const completeBundle = useMemo(
        () => (data && activeProfile ? buildCompleteOuraExport({ data, profile: activeProfile, metadata }) : null),
        [activeProfile, data, metadata],
    );

    useEffect(() => {
        if (!availableRange) {
            setSelectedRange(null);
            return;
        }

        setSelectedRange((current) => {
            if (!current) return availableRange;

            const nextStart = current.start < availableRange.start
                ? availableRange.start
                : current.start > availableRange.end
                    ? availableRange.end
                    : current.start;
            const nextEnd = current.end > availableRange.end
                ? availableRange.end
                : current.end < availableRange.start
                    ? availableRange.start
                    : current.end;

            if (nextStart > nextEnd) {
                return availableRange;
            }

            if (current.start === nextStart && current.end === nextEnd) {
                return current;
            }

            return { start: nextStart, end: nextEnd };
        });
    }, [availableRange?.end, availableRange?.start]);

    const effectiveRange = selectedRange ?? availableRange;

    const sleepRows = useMemo(() => filterByDayRange(analysisData?.sleep, effectiveRange), [analysisData?.sleep, effectiveRange]);
    const readinessRows = useMemo(() => filterByDayRange(analysisData?.readiness, effectiveRange), [analysisData?.readiness, effectiveRange]);
    const activityRows = useMemo(() => filterByDayRange(analysisData?.activity, effectiveRange), [analysisData?.activity, effectiveRange]);
    const sleepSessionRows = useMemo(() => filterSleepSessionsByRange(analysisData?.session, effectiveRange), [analysisData?.session, effectiveRange]);
    const nightlyVitalsRows = useMemo(() => (analysisData ? getNightlyVitalsRows(analysisData, effectiveRange) : []), [analysisData, effectiveRange]);
    const nightlyRestingHeartRateRows = useMemo(
        () => (analysisData ? getNightlyRestingHeartRateRows(analysisData, effectiveRange) : []),
        [analysisData, effectiveRange],
    );
    const spo2Rows = useMemo(() => filterByDayRange(analysisData?.spo2 as any[] | undefined, effectiveRange), [analysisData?.spo2, effectiveRange]);
    const stressRows = useMemo(() => filterByDayRange(analysisData?.stress as any[] | undefined, effectiveRange), [analysisData?.stress, effectiveRange]);
    const resilienceRows = useMemo(() => filterByDayRange(analysisData?.resilience as any[] | undefined, effectiveRange), [analysisData?.resilience, effectiveRange]);
    const cardiovascularAgeRows = useMemo(
        () => filterByDayRange(analysisData?.cardiovascularAge as any[] | undefined, effectiveRange),
        [analysisData?.cardiovascularAge, effectiveRange],
    );
    const vo2MaxRows = useMemo(() => filterByDayRange(analysisData?.vo2Max as any[] | undefined, effectiveRange), [analysisData?.vo2Max, effectiveRange]);
    const heartrateRows = useMemo(
        () => filterHeartRateByRange(analysisData?.heartrate, effectiveRange, activeProfile?.lastKnownUtcOffsetMinutes),
        [activeProfile?.lastKnownUtcOffsetMinutes, analysisData?.heartrate, effectiveRange],
    );
    const workoutRows = useMemo(() => filterByDayRange(analysisData?.workout as any[] | undefined, effectiveRange), [analysisData?.workout, effectiveRange]);
    const tagRows = useMemo(() => filterTagItemsByRange(analysisData?.tag as any[] | undefined, effectiveRange), [analysisData?.tag, effectiveRange]);
    const enhancedTagRows = useMemo(
        () => filterTagItemsByRange(analysisData?.enhancedTag as any[] | undefined, effectiveRange),
        [analysisData?.enhancedTag, effectiveRange],
    );

    const handleRangeChange = (field: 'start' | 'end', value: string) => {
        if (!value || !availableRange) return;

        setSelectedRange((current) => {
            const baseRange = current ?? availableRange;
            if (field === 'start') {
                return value <= baseRange.end
                    ? { start: value, end: baseRange.end }
                    : { start: value, end: value };
            }

            return value >= baseRange.start
                ? { start: baseRange.start, end: value }
                : { start: value, end: value };
        });
    };

    const resetRange = () => {
        if (!availableRange) return;
        setSelectedRange(availableRange);
    };

    const generateSleepCSV = () => {
        if (!sleepRows.length) return;
        const csvData = sleepRows.map((item) => ({
            date: item.day,
            sleep_score: item.score ?? '',
            total_sleep_contributor_score: item.contributors?.total_sleep ?? '',
            efficiency: item.contributors?.efficiency ?? '',
            restfulness: item.contributors?.restfulness ?? '',
            rem_sleep: item.contributors?.rem_sleep ?? '',
            deep_sleep: item.contributors?.deep_sleep ?? '',
            latency: item.contributors?.latency ?? '',
            timing: item.contributors?.timing ?? '',
            timestamp: item.timestamp ?? '',
        }));
        const csv = safeUnparse(csvData);
        downloadCSV(csv, 'sleep_scores.csv');
    };

    const generateReadinessCSV = () => {
        if (!readinessRows.length) return;
        const csvData = readinessRows.map((item) => ({
            date: item.day,
            readiness_score: item.score ?? '',
            previous_night: item.contributors?.previous_night ?? '',
            sleep_balance: item.contributors?.sleep_balance ?? '',
            hrv_balance: item.contributors?.hrv_balance ?? '',
            resting_heart_rate_contributor_score: item.contributors?.resting_heart_rate ?? '',
            recovery_index: item.contributors?.recovery_index ?? '',
            body_temperature: item.contributors?.body_temperature ?? '',
            activity_balance: item.contributors?.activity_balance ?? '',
            previous_day_activity: item.contributors?.previous_day_activity ?? '',
            temperature_deviation_c: item.temperature_deviation ?? '',
            temperature_deviation_f: toFahrenheitDelta(item.temperature_deviation),
            temperature_trend_deviation_c: item.temperature_trend_deviation ?? '',
            temperature_trend_deviation_f: toFahrenheitDelta(item.temperature_trend_deviation),
            timestamp: item.timestamp ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'readiness_scores.csv');
    };

    const generateActivityCSV = () => {
        if (!activityRows.length) return;
        const csvData = activityRows.map((item) => ({
            date: item.day,
            activity_score: item.score ?? '',
            meet_daily_targets: item.contributors?.meet_daily_targets ?? '',
            move_every_hour: item.contributors?.move_every_hour ?? '',
            recovery_time: item.contributors?.recovery_time ?? '',
            stay_active: item.contributors?.stay_active ?? '',
            training_frequency: item.contributors?.training_frequency ?? '',
            training_volume: item.contributors?.training_volume ?? '',
            steps: item.steps ?? '',
            active_calories: item.active_calories ?? '',
            total_calories: item.total_calories ?? '',
            equivalent_walking_distance_m: item.equivalent_walking_distance ?? '',
            equivalent_walking_distance_miles: toMiles(item.equivalent_walking_distance),
            target_calories: item.target_calories ?? '',
            target_meters: item.target_meters ?? '',
            target_miles: toMiles(item.target_meters),
            meters_to_target: item.meters_to_target ?? '',
            miles_to_target: toMiles(item.meters_to_target),
            high_activity_met_minutes: item.high_activity_met_minutes ?? '',
            medium_activity_met_minutes: item.medium_activity_met_minutes ?? '',
            low_activity_met_minutes: item.low_activity_met_minutes ?? '',
            high_activity_time_s: item.high_activity_time ?? '',
            medium_activity_time_s: item.medium_activity_time ?? '',
            low_activity_time_s: item.low_activity_time ?? '',
            sedentary_time_s: item.sedentary_time ?? '',
            resting_time_s: item.resting_time ?? '',
            non_wear_time_s: item.non_wear_time ?? '',
            inactivity_alerts: item.inactivity_alerts ?? '',
            average_met_minutes: item.average_met_minutes ?? '',
            timestamp: item.timestamp ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'activity_scores.csv');
    };

    const generateSleepSessionsCSV = () => {
        if (!sleepSessionRows.length) return;
        const csvData = sleepSessionRows.map((item) => ({
            date: item.day,
            type: item.type ?? '',
            bedtime_start: item.bedtime_start ?? '',
            bedtime_end: item.bedtime_end ?? '',
            total_sleep_duration_s: item.total_sleep_duration ?? '',
            time_in_bed_s: item.time_in_bed ?? '',
            awake_time_s: item.awake_time ?? '',
            light_sleep_duration_s: item.light_sleep_duration ?? '',
            deep_sleep_duration_s: item.deep_sleep_duration ?? '',
            rem_sleep_duration_s: item.rem_sleep_duration ?? '',
            efficiency: item.efficiency ?? '',
            latency_s: item.latency ?? '',
            average_heart_rate: item.average_heart_rate ?? '',
            lowest_heart_rate: item.lowest_heart_rate ?? '',
            average_hrv_ms: item.average_hrv ?? '',
            average_breath: item.average_breath ?? '',
            restless_periods: item.restless_periods ?? '',
            sleep_score_delta: item.sleep_score_delta ?? '',
            readiness_score_delta: item.readiness_score_delta ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'sleep_sessions.csv');
    };

    const generateNightlyRestingHeartRateCSV = () => {
        if (!nightlyRestingHeartRateRows.length) return;
        downloadCSV(safeUnparse(nightlyRestingHeartRateRows), 'nightly_lowest_heart_rate.csv');
    };

    const generateNightlyVitalsCSV = () => {
        if (!nightlyVitalsRows.length) return;
        downloadCSV(safeUnparse(nightlyVitalsRows), 'nightly_vitals.csv');
    };

    const generateSpO2CSV = () => {
        if (!spo2Rows.length) return;
        const csvData = spo2Rows.map((item) => ({
            date: item.day,
            spo2_average: item.spo2_percentage?.average ?? '',
            breathing_disturbance_index: item.breathing_disturbance_index ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'spo2.csv');
    };

    const generateStressCSV = () => {
        if (!stressRows.length) return;
        const csvData = stressRows.map((item) => ({
            date: item.day,
            stress_high_s: item.stress_high ?? '',
            recovery_high_s: item.recovery_high ?? '',
            day_summary: item.day_summary ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'daily_stress.csv');
    };

    const generateResilienceCSV = () => {
        if (!resilienceRows.length) return;
        const csvData = resilienceRows.map((item) => ({
            date: item.day,
            level: item.level ?? '',
            sleep_recovery: item.contributors?.sleep_recovery ?? '',
            daytime_recovery: item.contributors?.daytime_recovery ?? '',
            stress: item.contributors?.stress ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'resilience.csv');
    };

    const generateCardiovascularAgeCSV = () => {
        if (!cardiovascularAgeRows.length) return;
        const csvData = cardiovascularAgeRows.map((item) => ({
            date: item.day,
            vascular_age: item.vascular_age ?? '',
            pulse_wave_velocity_m_per_s: item.pulse_wave_velocity ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'cardiovascular_age.csv');
    };

    const generateVO2MaxCSV = () => {
        if (!vo2MaxRows.length) return;
        const csvData = vo2MaxRows.map((item) => ({
            date: item.day,
            vo2_max: item.vo2_max ?? '',
            timestamp: item.timestamp ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'vo2_max.csv');
    };

    const generateHeartrateCSV = () => {
        if (!heartrateRows.length) return;
        const csvData = heartrateRows.map((item) => ({
            timestamp: item.timestamp,
            timestamp_unix_ms: item.timestamp_unix ?? '',
            bpm: item.bpm,
            source: item.source,
        }));
        downloadCSV(safeUnparse(csvData), 'heart_rate.csv');
    };

    const generateWorkoutsCSV = () => {
        if (!workoutRows.length) return;
        const csvData = workoutRows.map((item) => ({
            date: item.day,
            activity: item.activity ?? '',
            start_datetime: item.start_datetime ?? '',
            end_datetime: item.end_datetime ?? '',
            intensity: item.intensity ?? '',
            calories: item.calories ?? '',
            distance_m: item.distance ?? '',
            distance_miles: toMiles(item.distance),
            source: item.source ?? '',
            label: item.label ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'workouts.csv');
    };

    const generateTagsCSV = () => {
        const tags = [...enhancedTagRows, ...tagRows];
        if (!tags.length) return;
        const csvData = tags.map((item: any) => ({
            date: item.day ?? item.start_day ?? '',
            tag_type_code: item.tag_type_code ?? item.text ?? '',
            start_time: item.start_time ?? '',
            end_time: item.end_time ?? '',
            comment: item.comment ?? '',
        }));
        downloadCSV(safeUnparse(csvData), 'tags.csv');
    };

    const generateAllDailyCSV = () => {
        if (!analysisData || !effectiveRange) return;
        const allDates = new Set([
            ...sleepRows.map((s) => s.day),
            ...readinessRows.map((r) => r.day),
            ...activityRows.map((a) => a.day),
            ...getSessionDays(sleepSessionRows),
            ...spo2Rows.map((s: any) => s.day),
            ...stressRows.map((s: any) => s.day),
            ...resilienceRows.map((r: any) => r.day),
            ...cardiovascularAgeRows.map((c: any) => c.day),
            ...vo2MaxRows.map((v: any) => v.day),
        ]);
        const csvData = Array.from(allDates).sort().map((date) => {
            const sleep = sleepRows.find((s) => s.day === date);
            const readiness = readinessRows.find((r) => r.day === date);
            const activity = activityRows.find((a) => a.day === date);
            const session = getBestSessionForDay(analysisData, date);
            const spo2 = spo2Rows.find((s: any) => s.day === date);
            const stress = stressRows.find((s: any) => s.day === date);
            const resilience = resilienceRows.find((r: any) => r.day === date);
            const cardio = cardiovascularAgeRows.find((c: any) => c.day === date);
            const vo2 = vo2MaxRows.find((v: any) => v.day === date);
            return {
                date,
                sleep_score: sleep?.score ?? '',
                sleep_total_sleep_contributor_score: sleep?.contributors?.total_sleep ?? '',
                sleep_efficiency: sleep?.contributors?.efficiency ?? '',
                sleep_restfulness: sleep?.contributors?.restfulness ?? '',
                sleep_rem_sleep: sleep?.contributors?.rem_sleep ?? '',
                sleep_deep_sleep: sleep?.contributors?.deep_sleep ?? '',
                sleep_latency: sleep?.contributors?.latency ?? '',
                sleep_timing: sleep?.contributors?.timing ?? '',
                readiness_score: readiness?.score ?? '',
                readiness_previous_night: readiness?.contributors?.previous_night ?? '',
                readiness_sleep_balance: readiness?.contributors?.sleep_balance ?? '',
                readiness_hrv_balance: readiness?.contributors?.hrv_balance ?? '',
                readiness_resting_heart_rate_contributor_score: readiness?.contributors?.resting_heart_rate ?? '',
                readiness_recovery_index: readiness?.contributors?.recovery_index ?? '',
                readiness_body_temperature: readiness?.contributors?.body_temperature ?? '',
                readiness_activity_balance: readiness?.contributors?.activity_balance ?? '',
                readiness_previous_day_activity: readiness?.contributors?.previous_day_activity ?? '',
                readiness_temperature_deviation_c: readiness?.temperature_deviation ?? '',
                readiness_temperature_deviation_f: toFahrenheitDelta(readiness?.temperature_deviation),
                readiness_temperature_trend_deviation_c: readiness?.temperature_trend_deviation ?? '',
                readiness_temperature_trend_deviation_f: toFahrenheitDelta(readiness?.temperature_trend_deviation),
                sleep_lowest_heart_rate_bpm: session?.lowest_heart_rate ?? '',
                activity_score: activity?.score ?? '',
                activity_meet_daily_targets: activity?.contributors?.meet_daily_targets ?? '',
                activity_move_every_hour: activity?.contributors?.move_every_hour ?? '',
                activity_recovery_time: activity?.contributors?.recovery_time ?? '',
                activity_stay_active: activity?.contributors?.stay_active ?? '',
                activity_training_frequency: activity?.contributors?.training_frequency ?? '',
                activity_training_volume: activity?.contributors?.training_volume ?? '',
                activity_steps: activity?.steps ?? '',
                activity_active_calories: activity?.active_calories ?? '',
                activity_total_calories: activity?.total_calories ?? '',
                activity_equivalent_walking_distance_m: activity?.equivalent_walking_distance ?? '',
                activity_distance_miles: toMiles(activity?.equivalent_walking_distance),
                spo2_average: spo2?.spo2_percentage?.average ?? '',
                spo2_breathing_disturbance_index: spo2?.breathing_disturbance_index ?? '',
                stress_high_s: stress?.stress_high ?? '',
                stress_recovery_high_s: stress?.recovery_high ?? '',
                stress_day_summary: stress?.day_summary ?? '',
                resilience_level: resilience?.level ?? '',
                resilience_sleep_recovery: resilience?.contributors?.sleep_recovery ?? '',
                resilience_daytime_recovery: resilience?.contributors?.daytime_recovery ?? '',
                resilience_stress: resilience?.contributors?.stress ?? '',
                cardiovascular_age: cardio?.vascular_age ?? '',
                cardiovascular_pulse_wave_velocity_m_per_s: cardio?.pulse_wave_velocity ?? '',
                vo2_max: vo2?.vo2_max ?? '',
            };
        });
        downloadCSV(safeUnparse(csvData), 'all_daily_data.csv');
    };

    const generateCompleteJSON = () => {
        if (!completeBundle) return;
        downloadJSON(
            completeBundle,
            `oura_complete_export_${completeBundle.manifest.exported_at.slice(0, 10)}.json`,
        );
    };

    const rawCollectionButtons = completeBundle
        ? OURA_COLLECTION_NAMES.map((name) => ({
            name,
            count: completeBundle.manifest.collection_counts[name],
            onClick: () => {
                const source = completeBundle.collections[name];
                downloadCSV(createComprehensiveCsv(source), `oura_${name}_complete.csv`);
            },
        }))
        : [];

    if (!activeProfile) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-8">
                <div className="text-center">
                    <AlertCircle className="w-16 h-16 text-text-muted mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-text-primary mb-2">No Profile Selected</h2>
                    <p className="text-text-secondary">Please select a profile to export data.</p>
                </div>
            </div>
        );
    }

    type ExportButton = {
        label: string;
        description: string;
        icon: React.ReactNode;
        color: string;
        count: number;
        onClick: () => void;
        filename: string;
    };

    const exportButtons: ExportButton[] = analysisData ? [
        {
            label: 'Sleep Scores',
            description: 'Daily score + 7 contributing factors',
            icon: <Moon className="w-5 h-5 text-metric-sleep" />,
            color: 'bg-metric-sleep/20',
            count: sleepRows.length,
            onClick: generateSleepCSV,
            filename: 'sleep_scores.csv',
        },
        {
            label: 'Readiness Scores',
            description: 'Daily score + contributor scores + temperature',
            icon: <TrendingUp className="w-5 h-5 text-metric-readiness" />,
            color: 'bg-metric-readiness/20',
            count: readinessRows.length,
            onClick: generateReadinessCSV,
            filename: 'readiness_scores.csv',
        },
        {
            label: 'Activity Scores',
            description: 'Daily score + contributors + steps/calories',
            icon: <Activity className="w-5 h-5 text-metric-activity" />,
            color: 'bg-metric-activity/20',
            count: activityRows.length,
            onClick: generateActivityCSV,
            filename: 'activity_scores.csv',
        },
        {
            label: 'Sleep Session Summary',
            description: 'Analysis columns for sleep periods; use Complete Raw CSV for every source field',
            icon: <Moon className="w-5 h-5 text-metric-sleep" />,
            color: 'bg-metric-sleep/10',
            count: sleepSessionRows.length,
            onClick: generateSleepSessionsCSV,
            filename: 'sleep_sessions.csv',
        },
        {
            label: 'Nightly Lowest HR',
            description: 'One row per Oura day with the sleep session lowest heart rate',
            icon: <Heart className="w-5 h-5 text-error" />,
            color: 'bg-error/20',
            count: nightlyRestingHeartRateRows.length,
            onClick: generateNightlyRestingHeartRateCSV,
            filename: 'nightly_lowest_heart_rate.csv',
        },
        {
            label: 'Nightly Vitals',
            description: 'One row per Oura day with average/lowest HR, HRV, and breathing',
            icon: <Heart className="w-5 h-5 text-error" />,
            color: 'bg-error/10',
            count: nightlyVitalsRows.length,
            onClick: generateNightlyVitalsCSV,
            filename: 'nightly_vitals.csv',
        },
        {
            label: 'Heart Rate',
            description: 'Time-series HR samples using the profile local offset for range filtering',
            icon: <Heart className="w-5 h-5 text-error" />,
            color: 'bg-error/20',
            count: heartrateRows.length,
            onClick: generateHeartrateCSV,
            filename: 'heart_rate.csv',
        },
        {
            label: 'SpO2',
            description: 'Daily blood oxygen average',
            icon: <Wind className="w-5 h-5 text-metric-sleep" />,
            color: 'bg-metric-sleep/10',
            count: spo2Rows.length,
            onClick: generateSpO2CSV,
            filename: 'spo2.csv',
        },
        {
            label: 'Daily Stress',
            description: 'High stress and recovery seconds per day',
            icon: <Zap className="w-5 h-5 text-metric-activity" />,
            color: 'bg-metric-activity/10',
            count: stressRows.length,
            onClick: generateStressCSV,
            filename: 'daily_stress.csv',
        },
        {
            label: 'Resilience',
            description: 'Resilience level + sleep/daytime contributors',
            icon: <TrendingUp className="w-5 h-5 text-metric-readiness" />,
            color: 'bg-metric-readiness/20',
            count: resilienceRows.length,
            onClick: generateResilienceCSV,
            filename: 'resilience.csv',
        },
        {
            label: 'Cardiovascular Age',
            description: 'Estimated cardiovascular age per day',
            icon: <Heart className="w-5 h-5 text-metric-insight" />,
            color: 'bg-metric-insight/10',
            count: cardiovascularAgeRows.length,
            onClick: generateCardiovascularAgeCSV,
            filename: 'cardiovascular_age.csv',
        },
        {
            label: 'VO2 Max',
            description: 'Cardio capacity estimates',
            icon: <Activity className="w-5 h-5 text-metric-readiness" />,
            color: 'bg-metric-readiness/10',
            count: vo2MaxRows.length,
            onClick: generateVO2MaxCSV,
            filename: 'vo2_max.csv',
        },
        {
            label: 'Workouts',
            description: 'Logged workouts with type, duration, distance',
            icon: <Activity className="w-5 h-5 text-metric-activity" />,
            color: 'bg-metric-activity/20',
            count: workoutRows.length,
            onClick: generateWorkoutsCSV,
            filename: 'workouts.csv',
        },
        {
            label: 'Tags',
            description: "Enhanced tags and notes you've logged",
            icon: <FileText className="w-5 h-5 text-text-secondary" />,
            color: 'bg-surface-raised',
            count: enhancedTagRows.length + tagRows.length,
            onClick: generateTagsCSV,
            filename: 'tags.csv',
        },
    ] : [];

    return (
        <div className="py-2 sm:py-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="page-title mb-2 flex items-center gap-3 text-3xl text-text-primary">
                        <Database className="w-8 h-8 text-accent" />
                        Data Export
                    </h1>
                    <p className="text-text-secondary">
                        Download a lossless snapshot of every current Oura V2 collection, or create analysis-ready CSVs from your saved history.
                    </p>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="ui-card ui-card--default mb-5 flex items-center gap-3 p-4 sm:p-6">
                        <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                        <p className="text-text-secondary">Loading saved history...</p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="ui-card ui-card--default mb-5 p-4 sm:p-6">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
                            <p className="text-error">{error}</p>
                        </div>
                    </div>
                )}

                {/* No data yet */}
                {!isLoading && !error && !data && (
                    <div className="ui-card ui-card--default mb-5 p-6 text-center sm:p-8">
                        <RefreshCw className="w-12 h-12 text-text-muted mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-text-primary mb-2">History Is Still Arriving</h2>
                        <p className="text-text-secondary">
                            Oura history is prepared automatically in the background. Check back later.
                        </p>
                    </div>
                )}

                {!isLoading && data && (
                    <>
                        {completeBundle && (
                            <section className="ui-card ui-card--subtle mb-5 p-4 sm:p-6">
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-text-primary mb-1">Complete Raw Export</h2>
                                        <p className="text-text-secondary text-sm">
                                            All 19 collections in Oura OpenAPI 1.37, with original IDs, units, nulls, nested samples, and no profile exclusions. Access and refresh tokens are never included.
                                        </p>
                                        <p className="text-text-muted text-xs mt-2">
                                            Coverage: {completeBundle.manifest.snapshot_status === 'full-sync' ? 'complete history' : 'available history'}
                                            {completeBundle.manifest.snapshot_status === 'full-sync' && completeBundle.manifest.last_full_sync_at
                                                ? ` · Prepared ${new Date(completeBundle.manifest.last_full_sync_at).toLocaleString()}`
                                                : ' · Full-history coverage expands automatically in the background'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={generateCompleteJSON}
                                        className="ui-button ui-button--primary self-start"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download Complete JSON
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                                    {rawCollectionButtons.map(({ name, count, onClick }) => (
                                        <button
                                            key={name}
                                            type="button"
                                            onClick={onClick}
                                            disabled={count === 0}
                                            className="ui-card ui-card--default ui-card--interactive flex min-h-11 items-center gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <FileText className="w-5 h-5 text-accent" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-text-primary">{humanizeCollectionName(name)}</p>
                                                <p className="text-xs text-text-muted font-mono">{name}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                <Download className="w-4 h-4 text-text-muted" />
                                                <span className="text-xs text-text-muted">{count.toLocaleString()} {count === 1 ? 'record' : 'records'}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {availableRange && selectedRange && (
                            <div className="ui-card ui-card--default mb-5 p-4 sm:p-6">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-text-primary mb-1">Export Range</h2>
                                        <p className="text-text-secondary text-sm">
                                            Choose the start and end dates for the analysis CSVs below. Complete raw exports always include all currently saved history.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={resetRange}
                                        className="ui-button ui-button--secondary ui-button--sm self-start"
                                    >
                                        Use Available Range
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                    <label className="block">
                                        <span className="block text-sm font-medium text-text-primary mb-2">Start date</span>
                                        <input
                                            type="date"
                                            value={selectedRange.start}
                                            min={availableRange.start}
                                            max={selectedRange.end}
                                            onChange={(event) => handleRangeChange('start', event.target.value)}
                                            className="ui-input"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="block text-sm font-medium text-text-primary mb-2">End date</span>
                                        <input
                                            type="date"
                                            value={selectedRange.end}
                                            min={selectedRange.start}
                                            max={availableRange.end}
                                            onChange={(event) => handleRangeChange('end', event.target.value)}
                                            className="ui-input"
                                        />
                                    </label>
                                </div>

                                <p className="mt-4 text-sm text-text-secondary">
                                    Exporting data from{' '}
                                    <span className="text-text-primary font-medium">
                                        {formatISODateForDisplay(selectedRange.start, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    {' '}to{' '}
                                    <span className="text-text-primary font-medium">
                                        {formatISODateForDisplay(selectedRange.end, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    . Saved history is available from {availableRange.start} to {availableRange.end}.
                                    {excludedDayCount > 0 ? ` ${excludedDayCount} profile-excluded ${excludedDayCount === 1 ? 'day is' : 'days are'} omitted.` : ''}
                                </p>
                            </div>
                        )}

                        {/* Individual analysis exports */}
                        <section className="ui-card ui-card--subtle mb-5 p-4 sm:p-6">
                            <h2 className="text-xl font-bold text-text-primary mb-1">Analysis CSVs</h2>
                            <p className="text-text-secondary text-sm mb-6">Curated, selected-range tables. Profile ring-break exclusions apply only in this section.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {exportButtons.map((btn) => (
                                    <button
                                        key={btn.filename}
                                        onClick={btn.onClick}
                                        disabled={btn.count === 0}
                                        className="ui-card ui-card--default ui-card--interactive flex min-h-11 items-center gap-3 p-4 text-left disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <div className={`w-10 h-10 ${btn.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                                            {btn.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-text-primary">{btn.label}</p>
                                            <p className="text-sm text-text-secondary">{btn.description}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <Download className="w-4 h-4 text-text-muted" />
                                            <span className="text-xs text-text-muted">{btn.count.toLocaleString()} rows</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Combined export */}
                        <section className="ui-card ui-card--subtle p-4 sm:p-6">
                            <h2 className="text-xl font-bold text-text-primary mb-1">Combined Daily Export</h2>
                            <p className="text-text-secondary text-sm mb-6">
                                All daily metrics joined by date into a single wide CSV — ideal for spreadsheet or notebook analysis.
                            </p>
                            <button
                                onClick={generateAllDailyCSV}
                                className="ui-card ui-card--default ui-card--interactive flex min-h-11 w-full items-center gap-3 p-4"
                            >
                                <div className="w-10 h-10 bg-metric-readiness/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Database className="w-5 h-5 text-metric-readiness" />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="font-medium text-text-primary">All Daily Data Combined</p>
                                    <p className="text-sm text-text-secondary">
                                        Sleep + nightly resting HR + readiness + activity + SpO2 + stress + resilience + cardio age + VO2 max
                                    </p>
                                </div>
                                <Download className="w-4 h-4 text-text-muted flex-shrink-0" />
                            </button>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};

export default DataExport;
