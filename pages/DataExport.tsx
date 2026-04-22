import React, { useEffect, useState } from 'react';
import { Download, FileText, Database, TrendingUp, AlertCircle, Heart, Activity, Moon, Zap, Wind, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { useUser } from '../contexts/UserContext';
import { getStoredDailyStats } from '../services/firestoreStatsService';
import { DailyStats } from '../types';

const METERS_TO_MILES = 0.000621371;
const CELSIUS_DELTA_TO_FAHRENHEIT_DELTA = 9 / 5;

const toMiles = (meters: number | null | undefined): number | '' =>
    meters == null ? '' : Number((meters * METERS_TO_MILES).toFixed(3));

const toFahrenheitDelta = (celsiusDelta: number | null | undefined): number | '' =>
    celsiusDelta == null ? '' : Number((celsiusDelta * CELSIUS_DELTA_TO_FAHRENHEIT_DELTA).toFixed(2));

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

const DataExport: React.FC = () => {
    const { activeProfile } = useUser();
    const [isLoading, setIsLoading] = useState(true);
    const [data, setData] = useState<DailyStats | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!activeProfile) return;
        setIsLoading(true);
        setError(null);
        getStoredDailyStats(activeProfile.id)
            .then(setData)
            .catch(() => setError('Failed to load synced data. Try syncing again from the dashboard.'))
            .finally(() => setIsLoading(false));
    }, [activeProfile?.id]);

    const generateSleepCSV = () => {
        if (!data?.sleep.length) return;
        const csvData = data.sleep.map((item) => ({
            date: item.day,
            sleep_score: item.score ?? '',
            total_sleep_duration: item.contributors?.total_sleep ?? '',
            efficiency: item.contributors?.efficiency ?? '',
            restfulness: item.contributors?.restfulness ?? '',
            rem_sleep: item.contributors?.rem_sleep ?? '',
            deep_sleep: item.contributors?.deep_sleep ?? '',
            latency: item.contributors?.latency ?? '',
            timing: item.contributors?.timing ?? '',
            timestamp: item.timestamp ?? '',
        }));
        const csv = Papa.unparse(csvData);
        downloadCSV(csv, 'sleep_scores.csv');
    };

    const generateReadinessCSV = () => {
        if (!data?.readiness.length) return;
        const csvData = data.readiness.map((item) => ({
            date: item.day,
            readiness_score: item.score ?? '',
            previous_night: item.contributors?.previous_night ?? '',
            sleep_balance: item.contributors?.sleep_balance ?? '',
            hrv_balance: item.contributors?.hrv_balance ?? '',
            resting_heart_rate: item.contributors?.resting_heart_rate ?? '',
            recovery_index: item.contributors?.recovery_index ?? '',
            body_temperature: item.contributors?.body_temperature ?? '',
            activity_balance: item.contributors?.activity_balance ?? '',
            previous_day_activity: item.contributors?.previous_day_activity ?? '',
            temperature_deviation_f: toFahrenheitDelta(item.temperature_deviation),
            temperature_trend_deviation_f: toFahrenheitDelta(item.temperature_trend_deviation),
            timestamp: item.timestamp ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'readiness_scores.csv');
    };

    const generateActivityCSV = () => {
        if (!data?.activity.length) return;
        const csvData = data.activity.map((item) => ({
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
            equivalent_walking_distance_miles: toMiles(item.equivalent_walking_distance),
            target_calories: item.target_calories ?? '',
            target_miles: toMiles(item.target_meters),
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
        downloadCSV(Papa.unparse(csvData), 'activity_scores.csv');
    };

    const generateSleepSessionsCSV = () => {
        if (!data?.session?.length) return;
        const csvData = data.session.map((item) => ({
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
        downloadCSV(Papa.unparse(csvData), 'sleep_sessions.csv');
    };

    const generateSpO2CSV = () => {
        if (!(data?.spo2 as any[])?.length) return;
        const csvData = (data!.spo2 as any[]).map((item) => ({
            date: item.day,
            spo2_average: item.spo2_percentage?.average ?? '',
            breathing_disturbance_index: item.breathing_disturbance_index ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'spo2.csv');
    };

    const generateStressCSV = () => {
        if (!(data?.stress as any[])?.length) return;
        const csvData = (data!.stress as any[]).map((item) => ({
            date: item.day,
            stress_high_s: item.stress_high ?? '',
            recovery_high_s: item.recovery_high ?? '',
            day_summary: item.day_summary ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'daily_stress.csv');
    };

    const generateResilienceCSV = () => {
        if (!(data?.resilience as any[])?.length) return;
        const csvData = (data!.resilience as any[]).map((item) => ({
            date: item.day,
            level: item.level ?? '',
            sleep_recovery: item.contributors?.sleep_recovery ?? '',
            daytime_recovery: item.contributors?.daytime_recovery ?? '',
            stress: item.contributors?.stress ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'resilience.csv');
    };

    const generateCardiovascularAgeCSV = () => {
        if (!(data?.cardiovascularAge as any[])?.length) return;
        const csvData = (data!.cardiovascularAge as any[]).map((item) => ({
            date: item.day,
            vascular_age: item.vascular_age ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'cardiovascular_age.csv');
    };

    const generateVO2MaxCSV = () => {
        if (!(data?.vo2Max as any[])?.length) return;
        const csvData = (data!.vo2Max as any[]).map((item) => ({
            date: item.day,
            vo2_max: item.vo2_max ?? '',
            timestamp: item.timestamp ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'vo2_max.csv');
    };

    const generateHeartrateCSV = () => {
        if (!data?.heartrate?.length) return;
        const csvData = data.heartrate.map((item) => ({
            timestamp: item.timestamp,
            bpm: item.bpm,
            source: item.source,
        }));
        downloadCSV(Papa.unparse(csvData), 'heart_rate.csv');
    };

    const generateWorkoutsCSV = () => {
        if (!(data?.workout as any[])?.length) return;
        const csvData = (data!.workout as any[]).map((item) => ({
            date: item.day,
            activity: item.activity ?? '',
            start_datetime: item.start_datetime ?? '',
            end_datetime: item.end_datetime ?? '',
            intensity: item.intensity ?? '',
            calories: item.calories ?? '',
            distance_miles: toMiles(item.distance),
            source: item.source ?? '',
            label: item.label ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'workouts.csv');
    };

    const generateTagsCSV = () => {
        const tags = [...(data?.enhancedTag || []), ...(data?.tag || [])];
        if (!tags.length) return;
        const csvData = tags.map((item: any) => ({
            date: item.day ?? item.start_day ?? '',
            tag_type_code: item.tag_type_code ?? item.text ?? '',
            start_time: item.start_time ?? '',
            end_time: item.end_time ?? '',
            comment: item.comment ?? '',
        }));
        downloadCSV(Papa.unparse(csvData), 'tags.csv');
    };

    const generateAllDailyCSV = () => {
        if (!data) return;
        const allDates = new Set([
            ...(data.sleep || []).map((s) => s.day),
            ...(data.readiness || []).map((r) => r.day),
            ...(data.activity || []).map((a) => a.day),
            ...(data.spo2 as any[] || []).map((s: any) => s.day),
            ...(data.stress as any[] || []).map((s: any) => s.day),
            ...(data.resilience as any[] || []).map((r: any) => r.day),
            ...(data.cardiovascularAge as any[] || []).map((c: any) => c.day),
            ...(data.vo2Max as any[] || []).map((v: any) => v.day),
        ]);
        const csvData = Array.from(allDates).sort().map((date) => {
            const sleep = data.sleep?.find((s) => s.day === date);
            const readiness = data.readiness?.find((r) => r.day === date);
            const activity = data.activity?.find((a) => a.day === date);
            const spo2 = (data.spo2 as any[])?.find((s) => s.day === date);
            const stress = (data.stress as any[])?.find((s) => s.day === date);
            const resilience = (data.resilience as any[])?.find((r) => r.day === date);
            const cardio = (data.cardiovascularAge as any[])?.find((c) => c.day === date);
            const vo2 = (data.vo2Max as any[])?.find((v) => v.day === date);
            return {
                date,
                sleep_score: sleep?.score ?? '',
                sleep_total_sleep: sleep?.contributors?.total_sleep ?? '',
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
                readiness_resting_heart_rate: readiness?.contributors?.resting_heart_rate ?? '',
                readiness_recovery_index: readiness?.contributors?.recovery_index ?? '',
                readiness_body_temperature: readiness?.contributors?.body_temperature ?? '',
                readiness_activity_balance: readiness?.contributors?.activity_balance ?? '',
                readiness_previous_day_activity: readiness?.contributors?.previous_day_activity ?? '',
                readiness_temperature_deviation_f: toFahrenheitDelta(readiness?.temperature_deviation),
                readiness_temperature_trend_deviation_f: toFahrenheitDelta(readiness?.temperature_trend_deviation),
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
                vo2_max: vo2?.vo2_max ?? '',
            };
        });
        downloadCSV(Papa.unparse(csvData), 'all_daily_data.csv');
    };

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

    const dateRange = data ? (() => {
        const allDays = [
            ...(data.sleep || []).map((s) => s.day),
            ...(data.readiness || []).map((r) => r.day),
            ...(data.activity || []).map((a) => a.day),
        ].filter(Boolean).sort();
        return allDays.length ? { start: allDays[0], end: allDays[allDays.length - 1] } : null;
    })() : null;

    type ExportButton = {
        label: string;
        description: string;
        icon: React.ReactNode;
        color: string;
        count: number;
        onClick: () => void;
        filename: string;
    };

    const exportButtons: ExportButton[] = data ? [
        {
            label: 'Sleep Scores',
            description: 'Daily score + 7 contributing factors',
            icon: <Moon className="w-5 h-5 text-accent-cyan" />,
            color: 'bg-accent-cyan/20',
            count: data.sleep?.length ?? 0,
            onClick: generateSleepCSV,
            filename: 'sleep_scores.csv',
        },
        {
            label: 'Readiness Scores',
            description: 'Daily score + contributors + temperature',
            icon: <TrendingUp className="w-5 h-5 text-accent-purple" />,
            color: 'bg-accent-purple/20',
            count: data.readiness?.length ?? 0,
            onClick: generateReadinessCSV,
            filename: 'readiness_scores.csv',
        },
        {
            label: 'Activity Scores',
            description: 'Daily score + contributors + steps/calories',
            icon: <Activity className="w-5 h-5 text-accent-orange" />,
            color: 'bg-accent-orange/20',
            count: data.activity?.length ?? 0,
            onClick: generateActivityCSV,
            filename: 'activity_scores.csv',
        },
        {
            label: 'Sleep Sessions',
            description: 'Raw sleep periods with HR, HRV, stages',
            icon: <Moon className="w-5 h-5 text-accent-cyan" />,
            color: 'bg-accent-cyan/10',
            count: data.session?.length ?? 0,
            onClick: generateSleepSessionsCSV,
            filename: 'sleep_sessions.csv',
        },
        {
            label: 'Heart Rate',
            description: 'Time-series HR readings (5-min intervals)',
            icon: <Heart className="w-5 h-5 text-accent-rose" />,
            color: 'bg-accent-rose/20',
            count: data.heartrate?.length ?? 0,
            onClick: generateHeartrateCSV,
            filename: 'heart_rate.csv',
        },
        {
            label: 'SpO2',
            description: 'Daily blood oxygen average',
            icon: <Wind className="w-5 h-5 text-accent-cyan" />,
            color: 'bg-accent-cyan/10',
            count: (data.spo2 as any[])?.length ?? 0,
            onClick: generateSpO2CSV,
            filename: 'spo2.csv',
        },
        {
            label: 'Daily Stress',
            description: 'High stress and recovery minutes per day',
            icon: <Zap className="w-5 h-5 text-accent-orange" />,
            color: 'bg-accent-orange/10',
            count: (data.stress as any[])?.length ?? 0,
            onClick: generateStressCSV,
            filename: 'daily_stress.csv',
        },
        {
            label: 'Resilience',
            description: 'Resilience level + sleep/daytime contributors',
            icon: <TrendingUp className="w-5 h-5 text-accent-green" />,
            color: 'bg-accent-green/20',
            count: (data.resilience as any[])?.length ?? 0,
            onClick: generateResilienceCSV,
            filename: 'resilience.csv',
        },
        {
            label: 'Cardiovascular Age',
            description: 'Estimated cardiovascular age per day',
            icon: <Heart className="w-5 h-5 text-accent-purple" />,
            color: 'bg-accent-purple/10',
            count: (data.cardiovascularAge as any[])?.length ?? 0,
            onClick: generateCardiovascularAgeCSV,
            filename: 'cardiovascular_age.csv',
        },
        {
            label: 'VO2 Max',
            description: 'Cardio capacity estimates',
            icon: <Activity className="w-5 h-5 text-accent-green" />,
            color: 'bg-accent-green/10',
            count: (data.vo2Max as any[])?.length ?? 0,
            onClick: generateVO2MaxCSV,
            filename: 'vo2_max.csv',
        },
        {
            label: 'Workouts',
            description: 'Logged workouts with type, duration, distance',
            icon: <Activity className="w-5 h-5 text-accent-orange" />,
            color: 'bg-accent-orange/20',
            count: (data.workout as any[])?.length ?? 0,
            onClick: generateWorkoutsCSV,
            filename: 'workouts.csv',
        },
        {
            label: 'Tags',
            description: "Enhanced tags and notes you've logged",
            icon: <FileText className="w-5 h-5 text-text-secondary" />,
            color: 'bg-[var(--bg-card)]',
            count: ((data.enhancedTag as any[])?.length ?? 0) + ((data.tag as any[])?.length ?? 0),
            onClick: generateTagsCSV,
            filename: 'tags.csv',
        },
    ] : [];

    return (
        <div className="min-h-screen bg-void p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center gap-3">
                        <Database className="w-8 h-8 text-accent-cyan" />
                        Data Export
                    </h1>
                    <p className="text-text-secondary">
                        Download your synced Oura data as CSV files. Data comes directly from your local cache — no additional API calls needed.
                    </p>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="glass-card p-6 mb-8 flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full animate-spin" />
                        <p className="text-text-secondary">Loading synced data...</p>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="glass-card p-6 mb-8">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-accent-rose flex-shrink-0" />
                            <p className="text-accent-rose">{error}</p>
                        </div>
                    </div>
                )}

                {/* No data yet */}
                {!isLoading && !error && !data && (
                    <div className="glass-card p-8 mb-8 text-center">
                        <RefreshCw className="w-12 h-12 text-text-muted mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-text-primary mb-2">No Synced Data Yet</h2>
                        <p className="text-text-secondary">
                            Sync your data from the dashboard first. Once synced, all your Oura data is stored locally and available here for export.
                        </p>
                    </div>
                )}

                {!isLoading && data && (
                    <>
                        {/* Date range banner */}
                        {dateRange && (
                            <div className="glass-card p-4 mb-8 flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-accent-green flex-shrink-0" />
                                <p className="text-text-secondary text-sm">
                                    Showing data from{' '}
                                    <span className="text-text-primary font-medium">{dateRange.start}</span>
                                    {' '}to{' '}
                                    <span className="text-text-primary font-medium">{dateRange.end}</span>
                                </p>
                            </div>
                        )}

                        {/* Individual exports */}
                        <div className="glass-card p-6 mb-6">
                            <h2 className="text-xl font-bold text-text-primary mb-1">Individual Data Types</h2>
                            <p className="text-text-secondary text-sm mb-6">One CSV per data type.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {exportButtons.map((btn) => (
                                    <button
                                        key={btn.filename}
                                        onClick={btn.onClick}
                                        disabled={btn.count === 0}
                                        className="flex items-center gap-3 p-4 glass-card hover:border-accent-cyan/50 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed text-left"
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
                        </div>

                        {/* Combined export */}
                        <div className="glass-card p-6">
                            <h2 className="text-xl font-bold text-text-primary mb-1">Combined Daily Export</h2>
                            <p className="text-text-secondary text-sm mb-6">
                                All daily metrics joined by date into a single wide CSV — ideal for spreadsheet or notebook analysis.
                            </p>
                            <button
                                onClick={generateAllDailyCSV}
                                className="w-full flex items-center gap-3 p-4 glass-card hover:border-accent-green/50 transition-all duration-300"
                            >
                                <div className="w-10 h-10 bg-accent-green/20 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <Database className="w-5 h-5 text-accent-green" />
                                </div>
                                <div className="flex-1 text-left">
                                    <p className="font-medium text-text-primary">All Daily Data Combined</p>
                                    <p className="text-sm text-text-secondary">
                                        Sleep + readiness + activity + SpO2 + stress + resilience + cardio age + VO2 max
                                    </p>
                                </div>
                                <Download className="w-4 h-4 text-text-muted flex-shrink-0" />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default DataExport;
