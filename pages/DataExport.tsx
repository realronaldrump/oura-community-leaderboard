import React, { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Field, Input } from '../components/ui';
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
            .catch(() => setError('Saved history didn’t load. Try again in a moment.'))
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

    if (!activeProfile) return null;

    type ExportButton = {
        label: string;
        description: string;
        count: number;
        onClick: () => void;
        filename: string;
    };

    const exportButtons: ExportButton[] = analysisData ? [
        { label: 'Sleep scores', description: 'Score and its contributors', count: sleepRows.length, onClick: generateSleepCSV, filename: 'sleep_scores.csv' },
        { label: 'Readiness scores', description: 'Score, contributors and temperature', count: readinessRows.length, onClick: generateReadinessCSV, filename: 'readiness_scores.csv' },
        { label: 'Activity scores', description: 'Score, contributors, steps and calories', count: activityRows.length, onClick: generateActivityCSV, filename: 'activity_scores.csv' },
        { label: 'Sleep sessions', description: 'Stages, heart rate and HRV for each sleep', count: sleepSessionRows.length, onClick: generateSleepSessionsCSV, filename: 'sleep_sessions.csv' },
        { label: 'Nightly lowest heart rate', description: 'One row per night', count: nightlyRestingHeartRateRows.length, onClick: generateNightlyRestingHeartRateCSV, filename: 'nightly_lowest_heart_rate.csv' },
        { label: 'Nightly vitals', description: 'Heart rate, HRV and breathing per night', count: nightlyVitalsRows.length, onClick: generateNightlyVitalsCSV, filename: 'nightly_vitals.csv' },
        { label: 'Heart rate samples', description: 'Every sample in the range', count: heartrateRows.length, onClick: generateHeartrateCSV, filename: 'heart_rate.csv' },
        { label: 'Blood oxygen', description: 'Nightly average and breathing disturbance', count: spo2Rows.length, onClick: generateSpO2CSV, filename: 'spo2.csv' },
        { label: 'Daily stress', description: 'Stressed and restored time per day', count: stressRows.length, onClick: generateStressCSV, filename: 'daily_stress.csv' },
        { label: 'Resilience', description: 'Level and contributors', count: resilienceRows.length, onClick: generateResilienceCSV, filename: 'resilience.csv' },
        { label: 'Cardiovascular age', description: 'Daily estimate', count: cardiovascularAgeRows.length, onClick: generateCardiovascularAgeCSV, filename: 'cardiovascular_age.csv' },
        { label: 'VO2 max', description: 'Fitness estimates', count: vo2MaxRows.length, onClick: generateVO2MaxCSV, filename: 'vo2_max.csv' },
        { label: 'Workouts', description: 'Type, time, intensity and distance', count: workoutRows.length, onClick: generateWorkoutsCSV, filename: 'workouts.csv' },
        { label: 'Tags', description: 'Tags and notes', count: enhancedTagRows.length + tagRows.length, onClick: generateTagsCSV, filename: 'tags.csv' },
    ] : [];
    const longDate = (day: string) => formatISODateForDisplay(day, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const rowCount = (count: number, noun: string) => `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;

    return (
        <div>
            <header className="page-heading">
                <h1>Export</h1>
                <p>Download what’s saved from Oura.</p>
            </header>

            {isLoading ? <p className="empty-note" role="status">Loading saved history…</p> : null}
            {error ? <p className="status-note status-note--error" role="alert">{error}</p> : null}
            {!isLoading && !error && !data ? (
                <div className="quiet-state">
                    <h2>Nothing saved yet</h2>
                    <p>Your history shows up here after the first sync.</p>
                </div>
            ) : null}

            {!isLoading && data ? (
                <>
                    {completeBundle ? (
                        <section className="settings-section" aria-labelledby="complete-heading">
                            <h2 id="complete-heading">Complete data</h2>
                            <div className="panel">
                                <button type="button" className="export-row" onClick={generateCompleteJSON}>
                                    <Download size={18} aria-hidden="true" />
                                    <span>
                                        <strong>Download complete JSON</strong>
                                        <small>Everything currently saved from Oura, including detailed samples. Ignored data is kept.</small>
                                    </span>
                                </button>
                                <details>
                                    <summary>Choose individual collections</summary>
                                    {rawCollectionButtons.map(({ name, count, onClick }) => (
                                        <button key={name} type="button" className="export-row" onClick={onClick} disabled={count === 0}>
                                            <span>
                                                <strong>{humanizeCollectionName(name)}</strong>
                                                <small className="font-mono">{name}</small>
                                            </span>
                                            <em>{rowCount(count, 'record')}</em>
                                        </button>
                                    ))}
                                </details>
                            </div>
                            <p>
                                {completeBundle.manifest.snapshot_status === 'full-sync' && completeBundle.manifest.last_full_sync_at
                                    ? `Complete history, prepared ${new Date(completeBundle.manifest.last_full_sync_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
                                    : 'Older history is still being added in the background.'}
                            </p>
                        </section>
                    ) : null}

                    <section className="settings-section" aria-labelledby="csv-heading">
                        <h2 id="csv-heading">Spreadsheets</h2>
                        <div className="panel">
                            {availableRange && selectedRange ? (
                                <div className="panel-body" style={{ borderBottom: '1px solid var(--color-line)' }}>
                                    <div className="form-grid">
                                        <Field label="From">
                                            <Input
                                                type="date"
                                                value={selectedRange.start}
                                                min={availableRange.start}
                                                max={selectedRange.end}
                                                onChange={(event) => handleRangeChange('start', event.target.value)}
                                            />
                                        </Field>
                                        <Field label="To">
                                            <Input
                                                type="date"
                                                value={selectedRange.end}
                                                min={selectedRange.start}
                                                max={availableRange.end}
                                                onChange={(event) => handleRangeChange('end', event.target.value)}
                                            />
                                        </Field>
                                    </div>
                                    {selectedRange.start !== availableRange.start || selectedRange.end !== availableRange.end ? (
                                        <button type="button" className="text-action" onClick={resetRange}>
                                            Use everything ({longDate(availableRange.start)} to {longDate(availableRange.end)})
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                            <button type="button" className="export-row" onClick={generateAllDailyCSV}>
                                <Download size={18} aria-hidden="true" />
                                <span>
                                    <strong>All daily data</strong>
                                    <small>One row per day with every score and nightly measurement</small>
                                </span>
                            </button>
                            <details>
                                <summary>Individual tables</summary>
                                {exportButtons.map((btn) => (
                                    <button key={btn.filename} type="button" className="export-row" onClick={btn.onClick} disabled={btn.count === 0}>
                                        <span>
                                            <strong>{btn.label}</strong>
                                            <small>{btn.description}</small>
                                        </span>
                                        <em>{rowCount(btn.count, 'row')}</em>
                                    </button>
                                ))}
                            </details>
                        </div>
                        <p>
                            Whole-day and selected data-type exclusions apply to spreadsheets
                            {excludedDayCount > 0 ? ` (${excludedDayCount} ${excludedDayCount === 1 ? 'day' : 'days'})` : ''}.
                        </p>
                    </section>
                </>
            ) : null}
        </div>
    );
};

export default DataExport;
