const normalizeOuraScope = (scope: string): string =>
  scope.toLowerCase().replace(/^extapi:/, '').replace(/[^a-z0-9]/g, '');

export const OURA_SCOPE_CANDIDATES = {
  daily: ['daily', 'daily_sleep', 'daily_readiness', 'daily_activity'],
  spo2: ['spo2Daily', 'daily_spo2', 'spo2'],
  // Oura returns 401s for stress/resilience on some tokens that have
  // generic `daily` access. Treat them as their own optional capabilities.
  stress: ['stress', 'daily_stress'],
  resilience: ['resilience', 'daily_resilience'],
  heartrate: ['heartrate', 'heart_rate'],
  workout: ['workout'],
  session: ['session'],
  tag: ['tag', 'tag user', 'enhanced_tag'],
  ringConfiguration: ['ring_configuration'],
  heartHealth: ['heart_health', 'daily_cardiovascular_age', 'vO2_max', 'vo2_max'],
} as const;

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

const REQUIRED_CONSENT_SCOPES: Array<{ keys: readonly string[]; label: string }> = [];

export const getMissingRequiredOuraConsentScopes = (grantedScopes?: string[]): string[] => {
  const scopeSet = normalizeGrantedOuraScopes(grantedScopes);
  if (scopeSet.size === 0) return [];

  return REQUIRED_CONSENT_SCOPES
    .filter(({ keys }) => !hasAnyOuraScope(scopeSet, [...keys]))
    .map(({ label }) => label);
};
