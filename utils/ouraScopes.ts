const normalizeOuraScope = (scope: string): string =>
  scope.toLowerCase().replace(/[^a-z0-9]/g, '');

export const normalizeGrantedOuraScopes = (grantedScopes?: string[]): Set<string> => {
  if (!grantedScopes?.length) return new Set<string>();
  return new Set(
    grantedScopes
      .filter((scope): scope is string => typeof scope === 'string' && scope.trim().length > 0)
      .map((scope) => normalizeOuraScope(scope))
  );
};

export const hasAnyOuraScope = (scopeSet: Set<string>, candidates: string[]): boolean => {
  if (scopeSet.size === 0) return true;
  return candidates.some((candidate) => scopeSet.has(normalizeOuraScope(candidate)));
};

const REQUIRED_CONSENT_SCOPES: Array<{ key: string; label: string }> = [
  { key: 'ring_configuration', label: 'Ring Configuration' },
  { key: 'heart_health', label: 'Heart Health' },
];

export const getMissingRequiredOuraConsentScopes = (grantedScopes?: string[]): string[] => {
  const scopeSet = normalizeGrantedOuraScopes(grantedScopes);
  if (scopeSet.size === 0) return [];

  return REQUIRED_CONSENT_SCOPES
    .filter(({ key }) => !scopeSet.has(normalizeOuraScope(key)))
    .map(({ label }) => label);
};
