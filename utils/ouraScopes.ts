const normalizeOuraScope = (scope: string): string =>
  scope.toLowerCase().replace(/[^a-z0-9]/g, '');

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

const REQUIRED_CONSENT_SCOPES: Array<{ key: string; label: string }> = [
  { key: 'daily', label: 'daily data' },
  { key: 'heart_health', label: 'heart health' },
];

export const getMissingRequiredOuraConsentScopes = (grantedScopes?: string[]): string[] => {
  const scopeSet = normalizeGrantedOuraScopes(grantedScopes);

  return REQUIRED_CONSENT_SCOPES
    .filter(({ key }) => !scopeSet.has(normalizeOuraScope(key)))
    .map(({ label }) => label);
};
