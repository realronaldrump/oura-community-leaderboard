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

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_000, 3_000];
const UNAVAILABLE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface UnavailableEntry {
  endpoints: string[];
  timestamp: number;
}

class OuraService {
  private unavailableEndpointsByToken = new Map<string, Set<string>>();
  private unavailableTimestamps = new Map<string, number>();
  private readonly unavailableCacheKey = 'oura_unavailable_endpoints_v2';

  constructor() {
    this.loadUnavailableCache();
    // Remove stale v1 cache key
    try { window.localStorage?.removeItem('oura_unavailable_endpoints_v1'); } catch { /* noop */ }
  }

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

  private getTokenKey(token: string): string {
    return token.slice(0, 20);
  }

  private loadUnavailableCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(this.unavailableCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, UnavailableEntry>;
      const now = Date.now();
      Object.entries(parsed).forEach(([tokenKey, entry]) => {
        if (now - entry.timestamp < UNAVAILABLE_CACHE_TTL_MS) {
          this.unavailableEndpointsByToken.set(tokenKey, new Set(entry.endpoints));
          this.unavailableTimestamps.set(tokenKey, entry.timestamp);
        }
      });
    } catch {
      // Ignore malformed cache.
    }
  }

  private persistUnavailableCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload: Record<string, UnavailableEntry> = {};
      this.unavailableEndpointsByToken.forEach((endpoints, tokenKey) => {
        payload[tokenKey] = {
          endpoints: Array.from(endpoints),
          timestamp: this.unavailableTimestamps.get(tokenKey) ?? Date.now(),
        };
      });
      window.localStorage.setItem(this.unavailableCacheKey, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }

  private isEndpointUnavailable(token: string, endpoint: string): boolean {
    const tokenKey = this.getTokenKey(token);
    const ts = this.unavailableTimestamps.get(tokenKey);
    if (ts && Date.now() - ts >= UNAVAILABLE_CACHE_TTL_MS) {
      this.unavailableEndpointsByToken.delete(tokenKey);
      this.unavailableTimestamps.delete(tokenKey);
      this.persistUnavailableCache();
      return false;
    }
    return this.unavailableEndpointsByToken.get(tokenKey)?.has(endpoint) ?? false;
  }

  private markEndpointUnavailable(token: string, endpoint: string): void {
    const tokenKey = this.getTokenKey(token);
    const unavailable = this.unavailableEndpointsByToken.get(tokenKey) ?? new Set<string>();
    unavailable.add(endpoint);
    this.unavailableEndpointsByToken.set(tokenKey, unavailable);
    this.unavailableTimestamps.set(tokenKey, Date.now());
    this.persistUnavailableCache();
  }

  clearUnavailableEndpoints(token: string): void {
    const tokenKey = this.getTokenKey(token);
    this.unavailableEndpointsByToken.delete(tokenKey);
    this.unavailableTimestamps.delete(tokenKey);
    this.persistUnavailableCache();
  }

  private clampDateWindow(startDate: string, endDate: string, maxDays: number): string {
    const start = new Date(`${startDate}T00:00:00`);
    const endTs = new Date(`${endDate}T00:00:00`).getTime();
    if (Number.isNaN(start.getTime()) || Number.isNaN(endTs)) return startDate;

    const maxRangeMs = maxDays * 24 * 60 * 60 * 1000;
    if (endTs - start.getTime() <= maxRangeMs) return startDate;

    const clamped = new Date(endTs - maxRangeMs);
    return clamped.toISOString().split('T')[0];
  }

  private getClampedDailyRange(start?: string, end?: string, maxDays: number = 29) {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return {
      start_date: this.clampDateWindow(start_date, end_date, maxDays),
      end_date,
    };
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

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
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
      let response: Response | undefined;
      let lastError: unknown;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          response = await this.fetchWithTimeout(
            this.buildUrl(endpoint, params, nextToken),
            { headers: this.getHeaders(token) },
          );

          if (response.status === 429 && attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
            response = undefined;
            continue;
          }

          if (response.status >= 500 && attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
            response = undefined;
            continue;
          }

          break;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
            continue;
          }
        }
      }

      if (!response) {
        if (optional) return results;
        throw lastError ?? new Error(`Failed to fetch ${endpoint} data`);
      }

      if (!response.ok) {
        if (response.status === 401) {
          if (optional) {
            this.markEndpointUnavailable(token, endpoint);
            return results;
          }
          throw new Error('Unauthorized');
        }

        if (optional && (response.status === 403 || response.status === 404)) {
          this.markEndpointUnavailable(token, endpoint);
          return results;
        }

        if (optional && (response.status === 400 || response.status === 429)) {
          return results;
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
    const { start_date, end_date } = this.getClampedDailyRange(start, end);
    return this.fetchPaginated<DailySleep>(token, 'daily_sleep', { start_date, end_date });
  }

  async getSleepSessions(token: string, start?: string, end?: string): Promise<SleepSession[]> {
    const { start_date, end_date } = this.getClampedDailyRange(start, end);
    return this.fetchPaginated<SleepSession>(token, 'sleep', { start_date, end_date });
  }

  async getDailyReadiness(token: string, start?: string, end?: string): Promise<DailyReadiness[]> {
    const { start_date, end_date } = this.getClampedDailyRange(start, end);
    return this.fetchPaginated<DailyReadiness>(token, 'daily_readiness', { start_date, end_date });
  }

  async getDailyActivity(token: string, start?: string, end?: string): Promise<DailyActivity[]> {
    const { start_date, end_date } = this.getClampedDailyRange(start, end);
    return this.fetchPaginated<DailyActivity>(token, 'daily_activity', { start_date, end_date });
  }

  async getHeartRate(token: string, start?: string, end?: string): Promise<HeartRate[]> {
    const { start_date, end_date } = this.getDateRange(start || 2, end);
    // Oura heartrate timeseries can reject very large windows; keep this to recent history.
    const clampedStartDate = this.clampDateWindow(start_date, end_date, 30);
    return this.fetchPaginated<HeartRate>(
      token,
      'heartrate',
      {
        start_datetime: `${clampedStartDate}T00:00:00`,
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
