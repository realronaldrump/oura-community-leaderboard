const normalizeOuraScope = (scope: string): string =>
  scope.toLowerCase().replace(/^extapi:/, '').replace(/[^a-z0-9]/g, '');

export const OURA_SCOPE_CANDIDATES = {
  daily: ['daily', 'daily_sleep', 'daily_readiness', 'daily_activity'],
  spo2: ['spo2Daily', 'daily_spo2', 'spo2'],
  personal: ['personal'],
  heartrate: ['heartrate', 'heart_rate'],
  workout: ['workout'],
  session: ['session'],
  tag: ['tag', 'tag user', 'enhanced_tag'],
} as const;

export type OuraEndpointCapabilities = {
  daily: boolean;
  personal: boolean;
  spo2: boolean;
  stress: boolean;
  resilience: boolean;
  heartrate: boolean;
  workout: boolean;
  session: boolean;
  sleepTime: boolean;
  tag: boolean;
  restModePeriod: boolean;
  ringConfiguration: boolean;
  ringBatteryLevel: boolean;
  cardiovascularAge: boolean;
  vo2Max: boolean;
};

export const sanitizeGrantedOuraScopes = (grantedScopes?: string[]): string[] => {
  if (!grantedScopes?.length) return [];

  const seen = new Set<string>();
  const sanitized: string[] = [];

  grantedScopes.forEach((scope) => {
    if (typeof scope !== 'string') return;
    const trimmed = scope.trim();
    if (!trimmed) return;

    const normalized = normalizeOuraScope(trimmed);
    if (!normalized || seen.has(normalized)) return;

    seen.add(normalized);
    sanitized.push(trimmed);
  });

  return sanitized;
};

export const normalizeGrantedOuraScopes = (grantedScopes?: string[]): Set<string> => {
  const sanitizedScopes = sanitizeGrantedOuraScopes(grantedScopes);
  if (sanitizedScopes.length === 0) return new Set<string>();
  return new Set(
    sanitizedScopes
      .map((scope) => normalizeOuraScope(scope))
  );
};

export const hasAnyOuraScope = (scopeSet: Set<string>, candidates: string[]): boolean => {
  return candidates.some((candidate) => scopeSet.has(normalizeOuraScope(candidate)));
};

/**
 * Oura exposes eight OAuth scopes, not one scope per collection. Newer daily
 * summary collections inherit `daily`; ring/device collections inherit
 * `personal`. Tokens saved before scopes were persisted are attempted
 * optimistically and endpoint-level 401/403 diagnostics remain authoritative.
 */
export const getOuraEndpointCapabilities = (grantedScopes?: string[]): OuraEndpointCapabilities => {
  const scopeSet = normalizeGrantedOuraScopes(grantedScopes);
  const attemptAll = scopeSet.size === 0;
  const daily = attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.daily]);
  const personal = attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.personal]);

  return {
    daily,
    personal,
    spo2: attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.spo2]),
    stress: daily,
    resilience: daily,
    heartrate: attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.heartrate]),
    workout: attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.workout]),
    session: attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.session]),
    sleepTime: daily,
    tag: attemptAll || hasAnyOuraScope(scopeSet, [...OURA_SCOPE_CANDIDATES.tag]),
    restModePeriod: daily,
    ringConfiguration: personal,
    ringBatteryLevel: personal,
    cardiovascularAge: daily,
    vo2Max: daily,
  };
};

const REQUIRED_CONSENT_SCOPES: Array<{ keys: readonly string[]; label: string }> = [];

export const getMissingRequiredOuraConsentScopes = (grantedScopes?: string[]): string[] => {
  const scopeSet = normalizeGrantedOuraScopes(grantedScopes);
  if (scopeSet.size === 0) return [];

  return REQUIRED_CONSENT_SCOPES
    .filter(({ keys }) => !hasAnyOuraScope(scopeSet, [...keys]))
    .map(({ label }) => label);
};
