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

export interface SleepSession {
  id: string;
  day: string;
  average_breath?: number | null;
  average_heart_rate?: number | null;
  average_hrv?: number | null;
  awake_time?: number | null;
  bedtime_end?: string; // ISO 8601
  bedtime_start?: string; // ISO 8601
  deep_sleep_duration?: number | null;
  efficiency?: number | null;
  latency?: number | null;
  light_sleep_duration?: number | null;
  low_battery_alert?: boolean;
  lowest_heart_rate?: number | null;
  movement_30_sec?: string | null;
  period?: number;
  readiness_score_delta?: number | null;
  rem_sleep_duration?: number | null;
  restless_periods?: number | null;
  sleep_phase_5_min?: string | null;
  sleep_score_delta?: number | null;
  time_in_bed?: number | null;
  total_sleep_duration?: number | null;
  type?: 'deleted' | 'sleep' | 'long_sleep' | 'rest';
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
  equivalent_walking_distance?: number;
  high_activity_met_minutes?: number;
  high_activity_time?: number;
  inactivity_alerts?: number;
  low_activity_met_minutes?: number;
  low_activity_time?: number;
  medium_activity_met_minutes?: number;
  medium_activity_time?: number;
  meters_to_target?: number;
  non_wear_time?: number;
  resting_time?: number;
  sedentary_met_minutes?: number;
  sedentary_time?: number;
  steps: number;
  target_calories: number;
  target_meters?: number;
  total_calories: number;
  day: string;
  timestamp?: string;
}

export interface ReadinessContributors {
  activity_balance?: number | null;
  body_temperature?: number | null;
  hrv_balance?: number | null;
  previous_day_activity?: number | null;
  previous_night?: number | null;
  recovery_index?: number | null;
  resting_heart_rate?: number | null;
  sleep_balance?: number | null;
}

export interface DailyReadiness {
  id: string;
  contributors: ReadinessContributors;
  day: string;
  score?: number | null;
  temperature_deviation?: number | null;
  temperature_trend_deviation?: number | null;
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
}

export interface HeartRate {
  bpm: number;
  source: string;
  timestamp: string;
}

export interface Spo2Percentage {
  average?: number;
}

export interface DailySpO2 {
  id: string;
  day: string;
  spo2_percentage?: Spo2Percentage;
}

export interface Workout {
  id: string;
  activity: string;
  calories: number;
  day: string;
  distance: number;
  end_datetime: string;
  start_datetime: string;
  label?: string;
}

export enum AuthStatus {
  LOADING = 'LOADING',
  AUTHENTICATED = 'AUTHENTICATED',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
}
