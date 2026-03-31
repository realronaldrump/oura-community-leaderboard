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
import { formatLocalISODate, getOuraFetchEndISODate } from '../utils/date';

type QueryParams = Record<string, string | undefined>;
type DateWindow = { start: string; end: string };
type FetchOptions = { optional?: boolean; availabilityKey?: string };
type DateWindowOptions = FetchOptions & { windowDays?: number };
type UnavailableReason = 'missing_scope' | 'not_found';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [1_000, 3_000];
const UNAVAILABLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface UnavailableEndpointState {
  reason: UnavailableReason;
  timestamp: number;
}

interface UnavailableEntry {
  endpoints: Record<string, UnavailableEndpointState>;
}

class OuraService {
  private unavailableEndpointsByAvailability = new Map<string, Map<string, UnavailableEndpointState>>();
  private readonly unavailableCacheKey = 'oura_unavailable_endpoints_v5';
  private readonly maxWindowDays = 90;
  private readonly maxConcurrentWindowRequests = 2;

  constructor() {
    this.loadUnavailableCache();
    try {
      window.localStorage?.removeItem('oura_unavailable_endpoints_v1');
      window.localStorage?.removeItem('oura_unavailable_endpoints_v2');
      window.localStorage?.removeItem('oura_unavailable_endpoints_v3');
      window.localStorage?.removeItem('oura_unavailable_endpoints_v4');
    } catch {
      /* noop */
    }
  }

  private getHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private getDateRange(daysBackOrStart: number | string = 30, end?: string) {
    if (typeof daysBackOrStart === 'string') {
      const today = getOuraFetchEndISODate();
      return {
        start_date: daysBackOrStart,
        end_date: end || today
      };
    }

    const today = new Date();
    const bufferedEnd = end || getOuraFetchEndISODate();

    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - (typeof daysBackOrStart === 'number' ? daysBackOrStart : 30));

    return {
      start_date: formatLocalISODate(pastDate),
      end_date: bufferedEnd,
    };
  }

  private getAvailabilityKey(token: string, explicitKey?: string): string {
    const scopedKey = explicitKey?.trim();
    if (scopedKey) {
      return `profile:${scopedKey}`;
    }
    return `token:${token.slice(0, 20)}`;
  }

  private loadUnavailableCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(this.unavailableCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, UnavailableEntry>;
      const now = Date.now();
      Object.entries(parsed).forEach(([availabilityKey, entry]) => {
        const endpoints = new Map<string, UnavailableEndpointState>();
        Object.entries(entry.endpoints || {}).forEach(([endpoint, state]) => {
          if (!state || typeof state !== 'object') return;
          if (state.reason === 'missing_scope' || now - state.timestamp < UNAVAILABLE_CACHE_TTL_MS) {
            endpoints.set(endpoint, state);
          }
        });

        if (endpoints.size > 0) {
          this.unavailableEndpointsByAvailability.set(availabilityKey, endpoints);
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
      this.unavailableEndpointsByAvailability.forEach((endpoints, availabilityKey) => {
        payload[availabilityKey] = {
          endpoints: Object.fromEntries(endpoints.entries()),
        };
      });
      window.localStorage.setItem(this.unavailableCacheKey, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }

  private isEndpointUnavailable(availabilityKey: string, endpoint: string): boolean {
    const endpointStates = this.unavailableEndpointsByAvailability.get(availabilityKey);
    if (!endpointStates) return false;

    const state = endpointStates.get(endpoint);
    if (!state) return false;
    if (state.reason === 'missing_scope') return true;

    if (Date.now() - state.timestamp >= UNAVAILABLE_CACHE_TTL_MS) {
      endpointStates.delete(endpoint);
      if (endpointStates.size === 0) {
        this.unavailableEndpointsByAvailability.delete(availabilityKey);
      }
      this.persistUnavailableCache();
      return false;
    }

    return true;
  }

  private markEndpointUnavailable(availabilityKey: string, endpoint: string, reason: UnavailableReason): void {
    const unavailable = this.unavailableEndpointsByAvailability.get(availabilityKey) ?? new Map<string, UnavailableEndpointState>();
    unavailable.set(endpoint, { reason, timestamp: Date.now() });
    this.unavailableEndpointsByAvailability.set(availabilityKey, unavailable);
    this.persistUnavailableCache();
  }

  clearUnavailableEndpoints(token: string, availabilityKey?: string): void {
    const key = this.getAvailabilityKey(token, availabilityKey);
    this.unavailableEndpointsByAvailability.delete(key);
    this.persistUnavailableCache();
  }

  private clampDateWindow(startDate: string, endDate: string, maxDays: number): string {
    const start = this.parseDay(startDate);
    const end = this.parseDay(endDate);
    if (!start || !end) return startDate;

    const maxRangeMs = maxDays * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() <= maxRangeMs) return startDate;

    const clamped = new Date(end.getTime() - maxRangeMs);
    return this.formatDay(clamped);
  }

  private parseDay(day: string): Date | null {
    const parsed = new Date(`${day}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDay(day: Date): string {
    return day.toISOString().split('T')[0];
  }

  private splitDateRange(startDate: string, endDate: string, maxWindowDays: number): DateWindow[] {
    const start = this.parseDay(startDate);
    const end = this.parseDay(endDate);

    if (!start || !end) {
      return [{ start: startDate, end: endDate }];
    }

    if (start.getTime() >= end.getTime()) {
      const from = start.getTime() <= end.getTime() ? start : end;
      const to = start.getTime() <= end.getTime() ? end : start;
      return [{ start: this.formatDay(from), end: this.formatDay(to) }];
    }

    const windows: DateWindow[] = [];
    let cursor = new Date(start);

    while (cursor.getTime() <= end.getTime()) {
      const windowEnd = new Date(cursor);
      windowEnd.setUTCDate(windowEnd.getUTCDate() + maxWindowDays - 1);
      if (windowEnd.getTime() > end.getTime()) {
        windowEnd.setTime(end.getTime());
      }

      windows.push({
        start: this.formatDay(cursor),
        end: this.formatDay(windowEnd),
      });

      cursor = new Date(windowEnd);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return windows;
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

  private async readErrorDetail(response: Response): Promise<string> {
    try {
      const raw = await response.text();
      if (!raw) return '';

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const detail = [parsed.detail, parsed.error, parsed.message]
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (detail) return detail;
      } catch {
        // Fall back to the raw body below.
      }

      return raw;
    } catch {
      return '';
    }
  }

  private logOptionalEndpointFailure(
    availabilityKey: string,
    endpoint: string,
    status: number,
    detail: string
  ): void {
    const suffix = detail ? `: ${detail}` : '';
    console.warn(`Optional Oura endpoint ${endpoint} returned ${status}${suffix}`, {
      availabilityKey,
      endpoint,
      status,
    });
  }

  private isMissingScopeError(status: number, detail: string): boolean {
    if (status !== 401 && status !== 403) return false;
    const normalizedDetail = detail.toLowerCase();
    return (
      (normalizedDetail.includes('not authorized access') && normalizedDetail.includes('scope')) ||
      normalizedDetail.includes('missing scope')
    );
  }

  private async fetchPaginated<T>(
    token: string,
    endpoint: string,
    params: QueryParams = {},
    options?: FetchOptions
  ): Promise<T[]> {
    const optional = options?.optional ?? false;
    const availabilityKey = this.getAvailabilityKey(token, options?.availabilityKey);

    if (optional && this.isEndpointUnavailable(availabilityKey, endpoint)) {
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
        const detail = await this.readErrorDetail(response);

        if (optional && this.isMissingScopeError(response.status, detail)) {
          this.logOptionalEndpointFailure(availabilityKey, endpoint, response.status, detail);
          this.markEndpointUnavailable(availabilityKey, endpoint, 'missing_scope');
          return results;
        }

        if (response.status === 401) {
          const suffix = detail ? `: ${detail}` : '';
          throw new Error(`Unauthorized while fetching ${endpoint}${suffix}`);
        }

        if (optional && response.status === 404) {
          this.logOptionalEndpointFailure(availabilityKey, endpoint, response.status, detail);
          this.markEndpointUnavailable(availabilityKey, endpoint, 'not_found');
          return results;
        }

        if (optional && response.status === 403) {
          this.logOptionalEndpointFailure(availabilityKey, endpoint, response.status, detail);
          // Don't blacklist 403s — they may be transient (subscription lapses, server-side
          // permission propagation delays). Retrying on the next sync is cheap.
          return results;
        }

        if (optional && (response.status === 400 || response.status === 429)) {
          this.logOptionalEndpointFailure(availabilityKey, endpoint, response.status, detail);
          return results;
        }

        const suffix = detail ? `: ${detail}` : '';
        throw new Error(`Failed to fetch ${endpoint} data${suffix}`);
      }

      const payload = await response.json();
      const pageData = Array.isArray(payload?.data) ? payload.data : [];
      results.push(...pageData);

      nextToken = payload?.next_token;
      if (!nextToken) break;
    }

    return results;
  }

  private async fetchDateWindowed<T>(
    token: string,
    endpoint: string,
    startDate: string,
    endDate: string,
    options?: DateWindowOptions
  ): Promise<T[]> {
    const windows = this.splitDateRange(startDate, endDate, options?.windowDays ?? this.maxWindowDays);
    const chunksByWindow: T[][] = new Array(windows.length);
    let nextWindowIndex = 0;

    const worker = async () => {
      while (true) {
        const index = nextWindowIndex;
        nextWindowIndex += 1;
        if (index >= windows.length) return;

        const window = windows[index];
        chunksByWindow[index] = await this.fetchPaginated<T>(
          token,
          endpoint,
          { start_date: window.start, end_date: window.end },
          { optional: options?.optional, availabilityKey: options?.availabilityKey }
        );
      }
    };

    const maxWorkersForRequest = options?.optional ? 1 : this.maxConcurrentWindowRequests;
    const workerCount = Math.min(maxWorkersForRequest, windows.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return chunksByWindow.flat();
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

  async getDailySleep(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<DailySleep[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<DailySleep>(token, 'daily_sleep', start_date, end_date, {
      availabilityKey: options?.availabilityKey,
    });
  }

  async getSleepSessions(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<SleepSession[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<SleepSession>(token, 'sleep', start_date, end_date, {
      availabilityKey: options?.availabilityKey,
    });
  }

  async getDailyReadiness(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<DailyReadiness[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<DailyReadiness>(token, 'daily_readiness', start_date, end_date, {
      availabilityKey: options?.availabilityKey,
    });
  }

  async getDailyActivity(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<DailyActivity[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<DailyActivity>(token, 'daily_activity', start_date, end_date, {
      availabilityKey: options?.availabilityKey,
    });
  }

  async getHeartRate(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<HeartRate[]> {
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
      { optional: true, availabilityKey: options?.availabilityKey }
    );
  }

  async getDailySpO2(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<DailySpO2[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<DailySpO2>(token, 'daily_spo2', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getDailyStress(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<DailyStress[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<DailyStress>(token, 'daily_stress', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getDailyResilience(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<DailyResilience[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<DailyResilience>(token, 'daily_resilience', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getWorkouts(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<Workout[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<Workout>(token, 'workout', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getSessions(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'session', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getSleepTime(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'sleep_time', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getTags(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'tag', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getEnhancedTags(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'enhanced_tag', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getRestModePeriods(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'rest_mode_period', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getRingConfiguration(token: string, options?: { availabilityKey?: string }): Promise<any[]> {
    return this.fetchPaginated<any>(token, 'ring_configuration', {}, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getDailyCardiovascularAge(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'daily_cardiovascular_age', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }

  async getVO2Max(token: string, start?: string, end?: string, options?: { availabilityKey?: string }): Promise<any[]> {
    const { start_date, end_date } = this.getDateRange(start || 30, end);
    return this.fetchDateWindowed<any>(token, 'vO2_max', start_date, end_date, {
      optional: true,
      availabilityKey: options?.availabilityKey,
    });
  }
}

export const ouraService = new OuraService();
