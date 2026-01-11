import { MetricType } from '../components/MetricCard';

export const getMetricTypeFromTitle = (title: string): MetricType | undefined => {
    const titleMap: Record<string, MetricType> = {
        'Total Sleep': 'sleep_duration',
        'Time in Bed': 'time_in_bed',
        'Deep Sleep': 'deep_sleep',
        'REM Sleep': 'rem_sleep',
        'Light Sleep': 'light_sleep',
        'Efficiency': 'efficiency',
        'Lowest HR': 'lowest_hr',
        'Avg HR': 'avg_hr',
        'Heart Rate': 'heart_rate',
        'HRV': 'hrv',
        'SpO2': 'spo2',
        'Steps': 'steps',
        'Active Calories': 'active_calories',
        'Total Calories': 'total_calories',
        'Walking Distance': 'walking_distance',
        'High Activity': 'high_activity',
        'Medium Activity': 'medium_activity',
        'Low Activity': 'low_activity',
        'Sedentary Time': 'sedentary_time',
    };
    return titleMap[title];
};

export const getMetricUnit = (metricType: MetricType): string => {
    const unitMap: Record<MetricType, string> = {
        sleep_duration: 'hours',
        time_in_bed: 'hours',
        deep_sleep: 'hours',
        rem_sleep: 'hours',
        light_sleep: 'hours',
        efficiency: '%',
        lowest_hr: 'bpm',
        avg_hr: 'bpm',
        heart_rate: 'bpm',
        hrv: 'ms',
        spo2: '%',
        steps: 'steps',
        active_calories: 'kcal',
        total_calories: 'kcal',
        walking_distance: 'km',
        high_activity: 'hours',
        medium_activity: 'hours',
        low_activity: 'hours',
        sedentary_time: 'hours',
    };
    return unitMap[metricType];
};
