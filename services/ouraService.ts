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
  DailyResilience,
  OuraEndpointDiagnostic
} from '../types';
import { formatLocalISODate, getOuraFetchEndISODate } from '../utils/date';

type QueryParams = Record<string, string | undefined>;
type DateWindow = { start: string; end: string };
type FetchOptions = { optional?: boolean; availabilityKey?: string };
type DateWindowOptions = FetchOptions & { windowDays?: number };
type UnavailableReason = 'missing_scope' | 'not_found';

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_BASE_MS = 750;
const MAX_RETRY_DELAY_MS = 30_000;
const UNAVAILABLE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const getOuraRetryDelayMs = (
  attempt: number,
  retryAfter: string | null,
  now: number = Date.now(),
  random: () => number = Math.random
): number => {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const retryAt = Date.parse(retryAfter);
    const retryAfterMs = Number.isFinite(seconds) && seconds >= 0
      ? seconds * 1000
      : Number.isNaN(retryAt)
        ? null
        : Math.max(0, retryAt - now);
    if (retryAfterMs != null) {
      return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS) + Math.floor(random() * 250);
    }
  }

  const exponentialDelay = Math.min(
    RETRY_BACKOFF_BASE_MS * (2 ** attempt),
    MAX_RETRY_DELAY_MS
  );
  return exponentialDelay + Math.floor(random() * exponentialDelay);
};

export const sanitizeOuraErrorDetail = (detail: string): string => detail
  .replace(/bearer\s+[^\s,}"']+/gi, 'Bearer [redacted]')
  .replace(/((?:access|refresh)[_-]?token)["'=:\s]+[^\s,}"']+/gi, '$1=[redacted]')
  .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
  .trim()
  .slice(0, 240);

interface UnavailableEndpointState {
  reason: UnavailableReason;
  timestamp: number;
}

interface UnavailableEntry {
  endpoints: Record<string, UnavailableEndpointState>;
}

class OuraService {
  private unavailableEndpointsByAvailability = new Map<string, Map<string, UnavailableEndpointState>>();
  private endpointDiagnosticsByAvailability = new Map<string, Map<string, OuraEndpointDiagnostic>>();
  private anonymousAvailabilityKeysByToken = new Map<string, string>();
  private nextAnonymousAvailabilityKey = 1;
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

    const existingKey = this.anonymousAvailabilityKeysByToken.get(token);
    if (existingKey) return existingKey;

    // Keep token-derived lookup state in memory only. Persisted and logged
    // availability keys must never contain access-token material.
    const anonymousKey = `anonymous:${this.nextAnonymousAvailabilityKey++}`;
    this.anonymousAvailabilityKeysByToken.set(token, anonymousKey);
    return anonymousKey;
  }

  private getEndpointLabel(endpoint: string): string {
    switch (endpoint) {
      case 'daily_resilience':
        return 'Resilience';
      case 'daily_stress':
        return 'Stress';
      case 'daily_spo2':
        return 'SpO2';
      default:
        return endpoint.replace(/_/g, ' ');
    }
  }

  private buildEndpointDiagnostic(
    endpoint: string,
    code: OuraEndpointDiagnostic['code'],
    status?: number | null,
    detail?: string | null
  ): OuraEndpointDiagnostic {
    const label = this.getEndpointLabel(endpoint);
    const normalizedDetail = detail?.trim() || null;

    let message: string;
    switch (code) {
      case 'missing_scope':
        message = normalizedDetail
          ? `Oura denied ${label}: ${normalizedDetail}`
          : `Oura denied ${label} because this account is missing permission for that endpoint.`;
        break;
      case 'not_found':
        message = normalizedDetail
          ? `Oura reported ${label} unavailable: ${normalizedDetail}`
          : `Oura reported ${label} is unavailable for this account.`;
        break;
      case 'forbidden':
        message = normalizedDetail
          ? `Oura returned 403 for ${label}: ${normalizedDetail}`
          : `Oura returned 403 while loading ${label}.`;
        break;
      case 'bad_request':
        message = normalizedDetail
          ? `Oura rejected the ${label} request: ${normalizedDetail}`
          : `Oura rejected the ${label} request.`;
        break;
      case 'rate_limited':
        message = normalizedDetail
          ? `Oura rate-limited ${label}: ${normalizedDetail}`
          : `Oura rate-limited ${label}. Try again shortly.`;
        break;
      case 'unauthorized':
        message = normalizedDetail
          ? `Oura returned 401 for ${label}: ${normalizedDetail}`
          : `Oura returned 401 while loading ${label}.`;
        break;
      case 'network':
        message = normalizedDetail
          ? `The ${label} request failed before Oura responded: ${normalizedDetail}`
          : `The ${label} request failed before Oura responded.`;
        break;
      case 'request_failed':
        message = normalizedDetail
          ? `The ${label} request failed: ${normalizedDetail}`
          : `The ${label} request failed.`;
        break;
      case 'skipped_missing_scope':
        message = `This profile does not have the Oura permissions needed for ${label}. Reconnect the account and grant daily access.`;
        break;
      case 'no_data':
        message = `Oura returned no ${label} records for this account or date range.`;
        break;
      default:
        message = normalizedDetail || `Failed to load ${label}.`;
        break;
    }

    return {
      code,
      endpoint,
      message,
      status: status ?? null,
      detail: normalizedDetail,
      recordedAt: new Date().toISOString(),
    };
  }

  private setEndpointDiagnostic(availabilityKey: string, endpoint: string, diagnostic: OuraEndpointDiagnostic): void {
    const diagnostics = this.endpointDiagnosticsByAvailability.get(availabilityKey) ?? new Map<string, OuraEndpointDiagnostic>();
    diagnostics.set(endpoint, diagnostic);
    this.endpointDiagnosticsByAvailability.set(availabilityKey, diagnostics);
  }

  private clearEndpointDiagnostic(availabilityKey: string, endpoint: string): void {
    const diagnostics = this.endpointDiagnosticsByAvailability.get(availabilityKey);
    if (!diagnostics) return;
    diagnostics.delete(endpoint);
    if (diagnostics.size === 0) {
      this.endpointDiagnosticsByAvailability.delete(availabilityKey);
    }
  }

  getEndpointDiagnostic(token: string, endpoint: string, explicitKey?: string): OuraEndpointDiagnostic | null {
    const availabilityKey = this.getAvailabilityKey(token, explicitKey);
    return this.endpointDiagnosticsByAvailability.get(availabilityKey)?.get(endpoint) ?? null;
  }

  private loadUnavailableCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(this.unavailableCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, UnavailableEntry>;
      const now = Date.now();
      let removedLegacyKey = false;
      Object.entries(parsed).forEach(([availabilityKey, entry]) => {
        if (!availabilityKey.startsWith('profile:')) {
          removedLegacyKey = true;
          return;
        }
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
      if (removedLegacyKey) this.persistUnavailableCache();
    } catch {
      // Ignore malformed cache.
    }
  }

  private persistUnavailableCache(): void {
    if (typeof window === 'undefined') return;
    try {
      const payload: Record<string, UnavailableEntry> = {};
      this.unavailableEndpointsByAvailability.forEach((endpoints, availabilityKey) => {
        if (!availabilityKey.startsWith('profile:')) return;
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
    this.endpointDiagnosticsByAvailability.delete(key);
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
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        const retryable =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;
        if (!retryable || attempt >= MAX_RETRIES) return response;

        await new Promise((resolve) => setTimeout(
          resolve,
          getOuraRetryDelayMs(attempt, response.headers.get('Retry-After'))
        ));
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_RETRIES) break;
        await new Promise((resolve) => setTimeout(resolve, getOuraRetryDelayMs(attempt, null)));
      }
    }

    throw lastError ?? new Error('Oura request failed');
  }

  private async readErrorDetail(response: Response): Promise<string> {
    try {
      const raw = await response.text();
      if (!raw) return '';

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const detail = [parsed.detail, parsed.error, parsed.message]
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
        if (detail) return sanitizeOuraErrorDetail(detail);
      } catch {
        // Unstructured bodies are intentionally discarded: proxies can echo
        // credentials, and this detail is later used in logs and errors.
      }

      return '';
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
      (normalizedDetail.includes('not authorized') && normalizedDetail.includes('scope')) ||
      (normalizedDetail.includes('unauthorized') && normalizedDetail.includes('scope')) ||
      normalizedDetail.includes('missing scope')
    );
  }

  private optionalEndpointFailureCode(
    status: number,
    detail: string
  ): OuraEndpointDiagnostic['code'] {
    if (this.isMissingScopeError(status, detail)) return 'missing_scope';
    switch (status) {
      case 400:
        return 'bad_request';
      case 401:
        return 'unauthorized';
      case 403:
        return 'forbidden';
      case 404:
        return 'not_found';
      case 429:
        return 'rate_limited';
      default:
        return 'request_failed';
    }
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
      const cachedState = this.unavailableEndpointsByAvailability.get(availabilityKey)?.get(endpoint);
      if (cachedState) {
        this.setEndpointDiagnostic(
          availabilityKey,
          endpoint,
          this.buildEndpointDiagnostic(
            endpoint,
            cachedState.reason === 'missing_scope' ? 'missing_scope' : 'not_found',
            cachedState.reason === 'missing_scope' ? 403 : 404
          )
        );
      }
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

          const shouldRetryResponse =
            response.status === 408 ||
            response.status === 425 ||
            response.status === 429 ||
            response.status >= 500;
          if (shouldRetryResponse && attempt < MAX_RETRIES) {
            const retryDelay = getOuraRetryDelayMs(
              attempt,
              response.headers.get('Retry-After')
            );
            await new Promise(r => setTimeout(r, retryDelay));
            response = undefined;
            continue;
          }

          break;
        } catch (err) {
          lastError = err;
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, getOuraRetryDelayMs(attempt, null)));
            continue;
          }
        }
      }

      if (!response) {
        const safeMessage = lastError instanceof Error
          ? sanitizeOuraErrorDetail(lastError.message)
          : 'Request timed out';
        if (optional) {
          this.setEndpointDiagnostic(
            availabilityKey,
            endpoint,
            this.buildEndpointDiagnostic(endpoint, 'network', null, safeMessage)
          );
        }
        throw new Error(`Failed to fetch ${endpoint} data: ${safeMessage || 'temporary network failure'}`);
      }

      if (!response.ok) {
        const detail = await this.readErrorDetail(response);

        if (optional && [403, 404].includes(response.status)) {
          const code = this.optionalEndpointFailureCode(response.status, detail);
          this.logOptionalEndpointFailure(availabilityKey, endpoint, response.status, detail);
          if (code === 'missing_scope') {
            this.markEndpointUnavailable(availabilityKey, endpoint, 'missing_scope');
          } else if (code === 'not_found') {
            this.markEndpointUnavailable(availabilityKey, endpoint, 'not_found');
          }
          this.setEndpointDiagnostic(
            availabilityKey,
            endpoint,
            this.buildEndpointDiagnostic(endpoint, code, response.status, detail)
          );
          return results;
        }

        if (response.status === 401) {
          if (optional) {
            this.setEndpointDiagnostic(
              availabilityKey,
              endpoint,
              this.buildEndpointDiagnostic(endpoint, 'unauthorized', response.status, detail)
            );
          }
          const suffix = detail ? `: ${detail}` : '';
          throw new Error(`Unauthorized while fetching ${endpoint}${suffix}`);
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
    const availabilityKey = this.getAvailabilityKey(token, options?.availabilityKey);
    this.clearEndpointDiagnostic(availabilityKey, endpoint);
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
    let response: Response;
    try {
      response = await this.fetchWithRetry(`${API_BASE_URL}/personal_info`, {
        headers: this.getHeaders(token),
      });
    } catch {
      throw new Error('Failed to fetch personal info: temporary Oura network failure');
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error('Unauthorized');
      const detail = await this.readErrorDetail(response);
      throw new Error(`Failed to fetch personal info${detail ? `: ${detail}` : ''}`);
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
