import { PROFILE_STATS_SCHEMA_VERSION } from './profileStatsConstants';

const AUTO_FULL_RECONCILIATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

type FullReconciliationDecisionInput = {
    baseDataPresent: boolean;
    hydratedFromStoredStats: boolean;
    metadata: {
        lastFullSyncAt?: string | null;
        schemaVersion?: number | null;
    } | null;
    nowMs?: number;
};

export const shouldAutoPromoteIncrementalToFull = ({
    baseDataPresent,
    hydratedFromStoredStats,
    metadata,
    nowMs = Date.now(),
}: FullReconciliationDecisionInput): boolean => {
    if (!baseDataPresent) return false;

    if (!metadata) {
        return hydratedFromStoredStats;
    }

    if (metadata.schemaVersion !== PROFILE_STATS_SCHEMA_VERSION) {
        return true;
    }

    const lastFullSyncMs = Date.parse(metadata.lastFullSyncAt || '');
    if (!Number.isFinite(lastFullSyncMs)) {
        return true;
    }

    return nowMs - lastFullSyncMs >= AUTO_FULL_RECONCILIATION_INTERVAL_MS;
};