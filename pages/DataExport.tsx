import React, { useState } from 'react';
import { Download, FileText, Database, TrendingUp, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';
import { useUser } from '../contexts/UserContext';
import { ouraService } from '../services/ouraService';
import { DailyStats } from '../types';

const DataExport: React.FC = () => {
    const { activeProfile } = useUser();
    const [isLoading, setIsLoading] = useState(false);
    const [exportData, setExportData] = useState<{
        sleep: any[];
        readiness: any[];
        activity: any[];
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchAllData = async () => {
        if (!activeProfile) return;

        setIsLoading(true);
        setError(null);

        try {
            // Fetch all historical data from 2016 to present
            const startDate = '2016-01-01';
            const endDate = new Date().toISOString().split('T')[0];

            const [sleepData, readinessData, activityData] = await Promise.all([
                ouraService.getDailySleep(activeProfile.token, startDate, endDate),
                ouraService.getDailyReadiness(activeProfile.token, startDate, endDate),
                ouraService.getDailyActivity(activeProfile.token, startDate, endDate),
            ]);

            setExportData({
                sleep: sleepData || [],
                readiness: readinessData || [],
                activity: activityData || [],
            });
        } catch (err) {
            console.error('Error fetching data:', err);
            setError('Failed to fetch data. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const generateSleepCSV = () => {
        if (!exportData?.sleep.length) return;

        const csvData = exportData.sleep.map((item: any) => ({
            date: item.day,
            sleep_score: item.score || '',
            total_sleep_duration: item.contributors?.total_sleep || '',
            efficiency: item.contributors?.efficiency || '',
            restfulness: item.contributors?.restfulness || '',
            rem_sleep: item.contributors?.rem_sleep || '',
            deep_sleep: item.contributors?.deep_sleep || '',
            latency: item.contributors?.latency || '',
            timing: item.contributors?.timing || '',
            timestamp: item.timestamp || '',
        }));

        const csv = Papa.unparse(csvData);
        downloadCSV(csv, 'sleep_scores.csv');
    };

    const generateReadinessCSV = () => {
        if (!exportData?.readiness.length) return;

        const csvData = exportData.readiness.map((item: any) => ({
            date: item.day,
            readiness_score: item.score || '',
            previous_night: item.contributors?.previous_night || '',
            sleep_balance: item.contributors?.sleep_balance || '',
            hrv_balance: item.contributors?.hrv_balance || '',
            resting_heart_rate: item.contributors?.resting_heart_rate || '',
            recovery_index: item.contributors?.recovery_index || '',
            body_temperature: item.contributors?.body_temperature || '',
            activity_balance: item.contributors?.activity_balance || '',
            previous_day_activity: item.contributors?.previous_day_activity || '',
            temperature_deviation: item.temperature_deviation || '',
            temperature_trend_deviation: item.temperature_trend_deviation || '',
            timestamp: item.timestamp || '',
        }));

        const csv = Papa.unparse(csvData);
        downloadCSV(csv, 'readiness_scores.csv');
    };

    const generateActivityCSV = () => {
        if (!exportData?.activity.length) return;

        const csvData = exportData.activity.map((item: any) => ({
            date: item.day,
            activity_score: item.score || '',
            meet_daily_targets: item.contributors?.meet_daily_targets || '',
            move_every_hour: item.contributors?.move_every_hour || '',
            recovery_time: item.contributors?.recovery_time || '',
            stay_active: item.contributors?.stay_active || '',
            training_frequency: item.contributors?.training_frequency || '',
            training_volume: item.contributors?.training_volume || '',
            steps: item.steps || '',
            active_calories: item.active_calories || '',
            total_calories: item.total_calories || '',
            equivalent_walking_distance: item.equivalent_walking_distance || '',
            target_calories: item.target_calories || '',
            target_meters: item.target_meters || '',
            meters_to_target: item.meters_to_target || '',
            timestamp: item.timestamp || '',
        }));

        const csv = Papa.unparse(csvData);
        downloadCSV(csv, 'activity_scores.csv');
    };

    const generateAllCSV = () => {
        if (!exportData) return;

        // Create a combined dataset by date
        const allDates = new Set([
            ...exportData.sleep.map(s => s.day),
            ...exportData.readiness.map(r => r.day),
            ...exportData.activity.map(a => a.day),
        ]);

        const csvData = Array.from(allDates).sort().map(date => {
            const sleep = exportData.sleep.find(s => s.day === date);
            const readiness = exportData.readiness.find(r => r.day === date);
            const activity = exportData.activity.find(a => a.day === date);

            return {
                date,
                // Sleep data
                sleep_score: sleep?.score || '',
                sleep_total_sleep_duration: sleep?.contributors?.total_sleep || '',
                sleep_efficiency: sleep?.contributors?.efficiency || '',
                sleep_restfulness: sleep?.contributors?.restfulness || '',
                sleep_rem_sleep: sleep?.contributors?.rem_sleep || '',
                sleep_deep_sleep: sleep?.contributors?.deep_sleep || '',
                sleep_latency: sleep?.contributors?.latency || '',
                sleep_timing: sleep?.contributors?.timing || '',

                // Readiness data
                readiness_score: readiness?.score || '',
                readiness_previous_night: readiness?.contributors?.previous_night || '',
                readiness_sleep_balance: readiness?.contributors?.sleep_balance || '',
                readiness_hrv_balance: readiness?.contributors?.hrv_balance || '',
                readiness_resting_heart_rate: readiness?.contributors?.resting_heart_rate || '',
                readiness_recovery_index: readiness?.contributors?.recovery_index || '',
                readiness_body_temperature: readiness?.contributors?.body_temperature || '',
                readiness_activity_balance: readiness?.contributors?.activity_balance || '',
                readiness_previous_day_activity: readiness?.contributors?.previous_day_activity || '',
                readiness_temperature_deviation: readiness?.temperature_deviation || '',
                readiness_temperature_trend_deviation: readiness?.temperature_trend_deviation || '',

                // Activity data
                activity_score: activity?.score || '',
                activity_meet_daily_targets: activity?.contributors?.meet_daily_targets || '',
                activity_move_every_hour: activity?.contributors?.move_every_hour || '',
                activity_recovery_time: activity?.contributors?.recovery_time || '',
                activity_stay_active: activity?.contributors?.stay_active || '',
                activity_training_frequency: activity?.contributors?.training_frequency || '',
                activity_training_volume: activity?.contributors?.training_volume || '',
                activity_steps: activity?.steps || '',
                activity_active_calories: activity?.active_calories || '',
                activity_total_calories: activity?.total_calories || '',
                activity_equivalent_walking_distance: activity?.equivalent_walking_distance || '',
                activity_target_calories: activity?.target_calories || '',
                activity_target_meters: activity?.target_meters || '',
                activity_meters_to_target: activity?.meters_to_target || '',
            };
        });

        const csv = Papa.unparse(csvData);
        downloadCSV(csv, 'all_scores_combined.csv');
    };

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

    return (
        <div className="min-h-screen bg-void p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-text-primary mb-2 flex items-center gap-3">
                        <Database className="w-8 h-8 text-accent-cyan" />
                        Data Export for Analysis
                    </h1>
                    <p className="text-text-secondary">
                        Download your Oura scores and contributing factors as CSV files for data analysis.
                        This will help you understand Oura's scoring algorithms.
                    </p>
                </div>

                {/* Fetch Data Section */}
                <div className="glass-card p-6 mb-8">
                    <h2 className="text-xl font-bold text-text-primary mb-4">1. Fetch Your Data</h2>
                    <p className="text-text-secondary mb-4">
                        Click below to fetch all your historical Oura data. This may take a few moments depending on how much data you have.
                    </p>

                    {!exportData && (
                        <button
                            onClick={fetchAllData}
                            disabled={isLoading}
                            className="btn-primary disabled:opacity-50"
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    Fetching Data...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <Download className="w-4 h-4" />
                                    Fetch All Historical Data
                                </span>
                            )}
                        </button>
                    )}

                    {error && (
                        <div className="mt-4 p-4 bg-accent-rose/10 border border-accent-rose/30 rounded-lg">
                            <p className="text-accent-rose">{error}</p>
                        </div>
                    )}

                    {exportData && (
                        <div className="mt-4 p-4 bg-accent-green/10 border border-accent-green/30 rounded-lg">
                            <p className="text-accent-green font-medium">Data fetched successfully!</p>
                            <div className="mt-2 text-sm text-text-secondary">
                                <p>Sleep records: {exportData.sleep.length}</p>
                                <p>Readiness records: {exportData.readiness.length}</p>
                                <p>Activity records: {exportData.activity.length}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Export Options */}
                {exportData && (
                    <div className="glass-card p-6">
                        <h2 className="text-xl font-bold text-text-primary mb-4">2. Download CSV Files</h2>
                        <p className="text-text-secondary mb-6">
                            Choose which data you want to export. Each file contains the score and all contributing factors.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Individual Downloads */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider">Individual Scores</h3>

                                <button
                                    onClick={generateSleepCSV}
                                    className="w-full flex items-center gap-3 p-4 glass-card hover:border-accent-cyan/50 transition-all duration-300"
                                >
                                    <div className="w-10 h-10 bg-accent-cyan/20 rounded-lg flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-accent-cyan" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-text-primary">Sleep Scores</p>
                                        <p className="text-sm text-text-secondary">Score + 7 contributing factors</p>
                                    </div>
                                    <Download className="w-4 h-4 text-text-muted ml-auto" />
                                </button>

                                <button
                                    onClick={generateReadinessCSV}
                                    className="w-full flex items-center gap-3 p-4 glass-card hover:border-accent-cyan/50 transition-all duration-300"
                                >
                                    <div className="w-10 h-10 bg-accent-purple/20 rounded-lg flex items-center justify-center">
                                        <TrendingUp className="w-5 h-5 text-accent-purple" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-text-primary">Readiness Scores</p>
                                        <p className="text-sm text-text-secondary">Score + 8 contributing factors</p>
                                    </div>
                                    <Download className="w-4 h-4 text-text-muted ml-auto" />
                                </button>

                                <button
                                    onClick={generateActivityCSV}
                                    className="w-full flex items-center gap-3 p-4 glass-card hover:border-accent-cyan/50 transition-all duration-300"
                                >
                                    <div className="w-10 h-10 bg-accent-orange/20 rounded-lg flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-accent-orange" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-text-primary">Activity Scores</p>
                                        <p className="text-sm text-text-secondary">Score + 6 contributing factors + metrics</p>
                                    </div>
                                    <Download className="w-4 h-4 text-text-muted ml-auto" />
                                </button>
                            </div>

                            {/* Combined Download */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider">Combined Data</h3>

                                <button
                                    onClick={generateAllCSV}
                                    className="w-full flex items-center gap-3 p-4 glass-card hover:border-accent-green/50 transition-all duration-300"
                                >
                                    <div className="w-10 h-10 bg-accent-green/20 rounded-lg flex items-center justify-center">
                                        <Database className="w-5 h-5 text-accent-green" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-text-primary">All Scores Combined</p>
                                        <p className="text-sm text-text-secondary">Complete dataset for analysis</p>
                                    </div>
                                    <Download className="w-4 h-4 text-text-muted ml-auto" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-6 p-4 bg-[var(--bg-base)] rounded-lg border border-[var(--border-subtle)]">
                            <h4 className="text-sm font-medium text-text-primary mb-2">CSV Structure Info</h4>
                            <ul className="text-sm text-text-secondary space-y-1">
                                <li>• Date column for chronological analysis</li>
                                <li>• Score column (1-100) for the final calculated score</li>
                                <li>• Individual factor columns for algorithm reverse-engineering</li>
                                <li>• Additional metrics included where available</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DataExport;