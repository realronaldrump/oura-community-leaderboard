export interface UserProfile {
  id: string;
  age?: number | null;
  weight?: number | null;
  height?: number | null;
  biological_sex?: string | null;
  email?: string | null;
  token: string; // Access Token
  lastUpdated?: string;
}

export interface SleepContributors {
  deep_sleep?: number | null;
  efficiency?: number | null;
  latency?: number | null;
  rem_sleep?: number | null;
  restfulness?: number | null;
  timing?: number | null;
  total_sleep?: number | null;
}

export interface DailySleep {
  id: string;
  day: string;
  score?: number | null;
  timestamp?: string; // ISO 8601
  contributors: SleepContributors;
}

export interface SampleModel {
  interval: number;
  items: number[];
  timestamp: string;
}

export interface SleepSession {
  id: string;
  day: string;
  average_breath?: number | null;
  average_heart_rate?: number | null;
  average_hrv?: number | null; // Actual HRV in ms
  awake_time?: number | null; // Duration in seconds
  bedtime_end?: string; // ISO 8601
  bedtime_start?: string; // ISO 8601
  deep_sleep_duration?: number | null; // Duration in seconds
  efficiency?: number | null; // 1-100
  latency?: number | null; // Sleep latency in seconds
  light_sleep_duration?: number | null; // Duration in seconds
  low_battery_alert?: boolean;
  lowest_heart_rate?: number | null; // Actual lowest HR in bpm
  movement_30_sec?: string | null;
  period?: number;
  readiness_score_delta?: number | null;
  rem_sleep_duration?: number | null; // Duration in seconds
  restless_periods?: number | null;
  sleep_phase_5_min?: string | null;
  sleep_score_delta?: number | null;
  time_in_bed?: number | null; // Duration in seconds
  total_sleep_duration?: number | null; // Duration in seconds
  type?: 'deleted' | 'sleep' | 'long_sleep' | 'rest';
  heart_rate?: SampleModel | null; // HR time series
  hrv?: SampleModel | null; // HRV time series
}

export interface ActivityContributors {
  meet_daily_targets?: number | null;
  move_every_hour?: number | null;
  recovery_time?: number | null;
  stay_active?: number | null;
  training_frequency?: number | null;
  training_volume?: number | null;
}

export interface DailyActivity {
  id: string;
  class_5_min?: string | null;
  score?: number | null;
  active_calories: number;
  average_met_minutes?: number;
  contributors: ActivityContributors;
  equivalent_walking_distance?: number; // meters
  high_activity_met_minutes?: number;
  high_activity_time?: number; // seconds
  inactivity_alerts?: number;
  low_activity_met_minutes?: number;
  low_activity_time?: number; // seconds
  medium_activity_met_minutes?: number;
  medium_activity_time?: number; // seconds
  meters_to_target?: number;
  non_wear_time?: number; // seconds
  resting_time?: number; // seconds
  sedentary_met_minutes?: number;
  sedentary_time?: number; // seconds
  steps: number;
  target_calories: number;
  target_meters?: number;
  total_calories: number;
  day: string;
  timestamp?: string;
}

export interface ReadinessContributors {
  activity_balance?: number | null; // 1-100 contribution score
  body_temperature?: number | null; // 1-100 contribution score
  hrv_balance?: number | null; // 1-100 contribution score (NOT ms!)
  previous_day_activity?: number | null; // 1-100 contribution score
  previous_night?: number | null; // 1-100 contribution score
  recovery_index?: number | null; // 1-100 contribution score
  resting_heart_rate?: number | null; // 1-100 contribution score (NOT bpm!)
  sleep_balance?: number | null; // 1-100 contribution score
}

export interface DailyReadiness {
  id: string;
  contributors: ReadinessContributors;
  day: string;
  score?: number | null;
  temperature_deviation?: number | null; // °C deviation
  temperature_trend_deviation?: number | null; // °C
  timestamp?: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  readiness: number;
  sleep: number;
  activity: number;
  average: number;
  isCurrentUser: boolean;
  avatar?: string;
  steps?: number;
  activeCalories?: number;
  sleepDuration?: number | null;
  averageHrv?: number | null;
  restingHeartRate?: number | null;
}

export interface HeartRate {
  bpm: number;
  source: 'awake' | 'rest' | 'sleep' | 'session' | 'live' | 'workout';
  timestamp: string;
}

export interface Spo2Percentage {
  average?: number;
}

export interface DailySpO2 {
  id: string;
  day: string;
  spo2_percentage?: Spo2Percentage | null;
  breathing_disturbance_index?: number | null;
}

export interface DailyStress {
  id: string;
  day: string;
  stress_high?: number | null; // Time in seconds in high stress
  recovery_high?: number | null; // Time in seconds in high recovery
  day_summary?: 'restored' | 'normal' | 'stressful' | null;
}

export interface ResilienceContributors {
  sleep_recovery?: number | null; // 0-100
  daytime_recovery?: number | null; // 0-100
  stress?: number | null; // 0-100
}

export interface DailyResilience {
  id: string;
  day: string;
  level?: 'limited' | 'adequate' | 'solid' | 'strong' | 'exceptional' | null;
  contributors?: ResilienceContributors;
}

export interface Workout {
  id: string;
  activity: string;
  calories?: number | null;
  day: string;
  distance?: number | null; // meters
  end_datetime: string;
  start_datetime: string;
  intensity?: 'easy' | 'moderate' | 'hard' | null;
  label?: string | null;
  source?: string | null;
}

export enum AuthStatus {
  LOADING = 'LOADING',
  AUTHENTICATED = 'AUTHENTICATED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
}

// Helper type for formatting durations
export type DurationSeconds = number;

// Utility functions
export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null) return '--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const formatTime = (isoString: string | undefined): string => {
  if (!isoString) return '--';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export interface DailyStats {
  sleep: DailySleep[];
  readiness: DailyReadiness[];
  activity: DailyActivity[];
  session: SleepSession[];
  spo2: DailySpO2[];
  stress: DailyStress[];
  resilience: DailyResilience[];
}
