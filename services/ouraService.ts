import { API_BASE_URL } from '../constants';
import {
  DailyActivity,
  DailyReadiness,
  DailySleep,
  SleepSession,
  UserProfile,
  HeartRate,
  DailySpO2,
  Workout,
  DailyStress,
  DailyResilience
} from '../types';

class OuraService {
  private getHeaders(token: string) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private getDateRange(daysBack = 30) {
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - daysBack);
    return {
      start_date: pastDate.toISOString().split('T')[0],
      end_date: today.toISOString().split('T')[0],
    };
  }

  async getPersonalInfo(token: string): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/personal_info`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) throw new Error('Failed to fetch personal info');
    return response.json();
  }

  async getDailySleep(token: string): Promise<DailySleep[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/daily_sleep?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch daily sleep data');
    const data = await response.json();
    return data.data || [];
  }

  async getSleepSessions(token: string): Promise<SleepSession[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/sleep?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch sleep sessions');
    const data = await response.json();
    return data.data || [];
  }

  async getDailyReadiness(token: string): Promise<DailyReadiness[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/daily_readiness?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch readiness data');
    const data = await response.json();
    return data.data || [];
  }

  async getDailyActivity(token: string): Promise<DailyActivity[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/daily_activity?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch activity data');
    const data = await response.json();
    return data.data || [];
  }

  async getHeartRate(token: string): Promise<HeartRate[]> {
    // Heart rate endpoint returns large data, fetch only last 2 days
    const { start_date, end_date } = this.getDateRange(2);
    const response = await fetch(
      `${API_BASE_URL}/heartrate?start_datetime=${start_date}T00:00:00&end_datetime=${end_date}T23:59:59`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch heart rate data');
    const data = await response.json();
    return data.data || [];
  }

  async getDailySpO2(token: string): Promise<DailySpO2[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/daily_spo2?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch SpO2 data');
    const data = await response.json();
    return data.data || [];
  }

  async getDailyStress(token: string): Promise<DailyStress[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/daily_stress?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) {
      console.warn('Stress data not available');
      return [];
    }
    const data = await response.json();
    return data.data || [];
  }

  async getDailyResilience(token: string): Promise<DailyResilience[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/daily_resilience?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) {
      console.warn('Resilience data not available');
      return [];
    }
    const data = await response.json();
    return data.data || [];
  }

  async getWorkouts(token: string): Promise<Workout[]> {
    const { start_date, end_date } = this.getDateRange();
    const response = await fetch(
      `${API_BASE_URL}/workout?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch workout data');
    const data = await response.json();
    return data.data || [];
  }
}

export const ouraService = new OuraService();
