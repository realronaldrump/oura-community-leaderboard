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

type QueryParams = Record<string, string | undefined>;

class OuraService {
  private unavailableEndpointsByToken = new Map<string, Set<string>>();

  private getHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private getDateRange(daysBackOrStart: number | string = 30, end?: string) {
    if (typeof daysBackOrStart === 'string') {
      const today = new Date().toISOString().split('T')[0];
      return {
        start_date: daysBackOrStart,
        end_date: end || today
      };
    }

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - (typeof daysBackOrStart === 'number' ? daysBackOrStart : 30));

    return {
      start_date: pastDate.toISOString().split('T')[0],
      end_date: tomorrow.toISOString().split('T')[0],
    };
  }

  private isEndpointUnavailable(token: string, endpoint: string): boolean {
    return this.unavailableEndpointsByToken.get(token)?.has(endpoint) ?? false;
  }

  private markEndpointUnavailable(token: string, endpoint: string): void {
    const unavailable = this.unavailableEndpointsByToken.get(token) ?? new Set<string>();
    unavailable.add(endpoint);
    this.unavailableEndpointsByToken.set(token, unavailable);
  }

  private buildUrl(endpoint: string, params: QueryParams = {}, nextToken?: string): string {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== '') search.set(key, value);
    });
    if (nextToken) search.set('next_token', nextToken);
    const query = search.toString();
    return `${API_BASE_URL}/${endpoint}${query ? `?${query}` : ''}`;
  }

  private async fetchPaginated<T>(
    token: string,
    endpoint: string,
    params: QueryParams = {},
    options?: { optional?: boolean }
  ): Promise<T[]> {
    const optional = options?.optional ?? false;

    if (optional && this.isEndpointUnavailable(token, endpoint)) {
      return [];
    }

    const results: T[] = [];
    let nextToken: string | undefined = undefined;

    while (true) {
      const response = await fetch(this.buildUrl(endpoint, params, nextToken), {
        headers: this.getHeaders(token),
      });

      if (!response.ok) {
        if (response.status === 401) {
          if (optional) {
            this.markEndpointUnavailable(token, endpoint);
            return [];
          }
          throw new Error('Unauthorized');
        }

        if (optional && (response.status === 403 || response.status === 404)) {
          this.markEndpointUnavailable(token, endpoint);
          return [];
        }

        throw new Error(`Failed to fetch ${endpoint} data`);
      }

      const payload = await response.json();
      const pageData = Array.isArray(payload?.data) ? payload.data : [];
      results.push(...pageData);

      nextToken = payload?.next_token;
      if (!nextToken) break;
    }

    return results;
  }

  async getPersonalInfo(token: string): Promise<UserProfile> {
    const response = await fetch(`${API_BASE_URL}/personal_info`, {
      headers: this.getHeaders(token),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('Unauthorized');
      throw new Error('Failed to fetch personal info');
    }
    return response.json();
  }

  async getDailySleep(token: string, start?: string, end?: string): Promise<DailySleep[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<DailySleep>(token, 'daily_sleep', { start_date, end_date });
  }

  async getSleepSessions(token: string, start?: string, end?: string): Promise<SleepSession[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<SleepSession>(token, 'sleep', { start_date, end_date });
  }

  async getDailyReadiness(token: string, start?: string, end?: string): Promise<DailyReadiness[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<DailyReadiness>(token, 'daily_readiness', { start_date, end_date });
  }

  async getDailyActivity(token: string, start?: string, end?: string): Promise<DailyActivity[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<DailyActivity>(token, 'daily_activity', { start_date, end_date });
  }

  async getHeartRate(token: string, start?: string, end?: string): Promise<HeartRate[]> {
    const { start_date, end_date } = this.getDateRange(start || 2, end);
    return this.fetchPaginated<HeartRate>(
      token,
      'heartrate',
      {
        start_datetime: `${start_date}T00:00:00`,
        end_datetime: `${end_date}T23:59:59`,
      },
      { optional: true }
    );
  }

  async getDailySpO2(token: string, start?: string, end?: string): Promise<DailySpO2[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<DailySpO2>(token, 'daily_spo2', { start_date, end_date }, { optional: true });
  }

  async getDailyStress(token: string, start?: string, end?: string): Promise<DailyStress[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<DailyStress>(token, 'daily_stress', { start_date, end_date }, { optional: true });
  }

  async getDailyResilience(token: string, start?: string, end?: string): Promise<DailyResilience[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<DailyResilience>(token, 'daily_resilience', { start_date, end_date }, { optional: true });
  }

  async getWorkouts(token: string, start?: string, end?: string): Promise<Workout[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<Workout>(token, 'workout', { start_date, end_date }, { optional: true });
  }

  async getSessions(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'session', { start_date, end_date }, { optional: true });
  }

  async getSleepTime(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'sleep_time', { start_date, end_date }, { optional: true });
  }

  async getTags(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'tag', { start_date, end_date }, { optional: true });
  }

  async getEnhancedTags(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'enhanced_tag', { start_date, end_date }, { optional: true });
  }

  async getRestModePeriods(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'rest_mode_period', { start_date, end_date }, { optional: true });
  }

  async getRingConfiguration(token: string): Promise<any[]> {
    return this.fetchPaginated<any>(token, 'ring_configuration', {}, { optional: true });
  }

  async getDailyCardiovascularAge(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'daily_cardiovascular_age', { start_date, end_date }, { optional: true });
  }

  async getVO2Max(token: string, start?: string, end?: string): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchPaginated<any>(token, 'vO2_max', { start_date, end_date }, { optional: true });
  }
}

export const ouraService = new OuraService();
