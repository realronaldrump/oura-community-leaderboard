import { API_BASE_URL } from '../constants';
import { DailyActivity, DailyReadiness, DailySleep, SleepSession, UserProfile } from '../types';

class OuraService {
  private getHeaders(token: string) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private getTodayAndYesterdayDateStr() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 30); // Fetch last 30 days
    return {
      start_date: yesterday.toISOString().split('T')[0],
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
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/daily_sleep?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch daily sleep data');
    const data = await response.json();
    return data.data;
  }

  async getSleepSessions(token: string): Promise<SleepSession[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/sleep?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch sleep sessions');
    const data = await response.json();
    return data.data;
  }

  async getDailyReadiness(token: string): Promise<DailyReadiness[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/daily_readiness?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch readiness data');
    const data = await response.json();
    return data.data;
  }

  async getDailyActivity(token: string): Promise<DailyActivity[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/daily_activity?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch activity data');
    const data = await response.json();
    return data.data;
  }

  async getHeartRate(token: string): Promise<any[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/heartrate?start_datetime=${start_date}&end_datetime=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch heart rate data');
    const data = await response.json();
    return data.data;
  }

  async getDailySpO2(token: string): Promise<any[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/daily_spo2?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch SpO2 data');
    const data = await response.json();
    return data.data;
  }

  async getWorkouts(token: string): Promise<any[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/workout?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    // Workouts endpoint might return 404 or empty if no data, handle gracefully
    if (!response.ok) {
      console.warn('Failed to fetch workouts or no workouts found');
      return [];
    }
    const data = await response.json();
    return data.data;
  }

  async getTags(token: string): Promise<any[]> {
    const { start_date, end_date } = this.getTodayAndYesterdayDateStr();
    const response = await fetch(
      `${API_BASE_URL}/tag?start_date=${start_date}&end_date=${end_date}`,
      { headers: this.getHeaders(token) }
    );
    if (!response.ok) throw new Error('Failed to fetch tags');
    const data = await response.json();
    return data.data;
  }
}

export const ouraService = new OuraService();
