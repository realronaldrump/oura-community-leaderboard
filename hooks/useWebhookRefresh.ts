import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DailyStats, UserProfile, WebhookSignal } from '../types';
import { firebaseService } from '../services/firebaseService';
import { deleteStoredOuraRecord } from '../services/firestoreStatsService';
import { webhookService } from '../services/webhookService';
import { removeDeletedOuraRecord } from '../utils/ouraWebhook';

const WEBHOOK_SETUP_CHECK_KEY = 'oura_webhook_setup_checked_at';
const WEBHOOK_SETUP_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const WEBHOOK_INVALIDATE_DEBOUNCE_MS = 1200;
const WEBHOOK_SIGNAL_POLL_INTERVAL_MS = 30 * 1000;
const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);
const PERMISSION_DENIED_ERROR_CODES = new Set(['permission-denied', 'permission_denied']);

const signalKey = (signal: WebhookSignal): string => {
    return [
        signal.lastReceivedAt || '',
        signal.lastEventAt || '',
        signal.lastDataType || '',
        signal.lastEventType || '',
        signal.lastObjectId || '',
        signal.updateCount != null ? String(signal.updateCount) : '',
    ].join('|');
};

const toTimestampMs = (value?: string | null): number => {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getSignalTimestampMs = (signal: WebhookSignal): number => Math.max(
    toTimestampMs(signal.lastReceivedAt),
    toTimestampMs(signal.lastEventAt)
);

const isPermissionDeniedError = (error: unknown): boolean => {
    const code = String((error as any)?.code || '').toLowerCase();
    if (PERMISSION_DENIED_ERROR_CODES.has(code)) return true;
    const message = String((error as any)?.message || '').toLowerCase();
    return message.includes('insufficient permissions') || message.includes('permission denied');
};

export const useWebhookRefresh = (profile: UserProfile | null, enabled: boolean = true) => {
    const queryClient = useQueryClient();
    const lastSignalKeyRef = useRef<string>('');
    const lastSuccessfulSyncAtRef = useRef<string | null>(profile?.lastSuccessfulSyncAt ?? null);
    const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        lastSuccessfulSyncAtRef.current = profile?.lastSuccessfulSyncAt ?? null;
    }, [profile?.id, profile?.lastSuccessfulSyncAt]);

    useEffect(() => {
        if (!enabled) return;
        if (!profile?.id || !profile?.ouraUserId) return;

        lastSignalKeyRef.current = '';

        const handleSignal = (signal: WebhookSignal | null) => {
            if (!signal) return;
            const nextKey = signalKey(signal);
            if (!nextKey || nextKey === lastSignalKeyRef.current) return;
            lastSignalKeyRef.current = nextKey;

            const signalTimestampMs = getSignalTimestampMs(signal);
            const lastSuccessfulSyncMs = toTimestampMs(lastSuccessfulSyncAtRef.current);
            if (
                signalTimestampMs > 0 &&
                lastSuccessfulSyncMs > 0 &&
                signalTimestampMs <= lastSuccessfulSyncMs
            ) {
                return;
            }

            if (invalidateTimerRef.current) {
                clearTimeout(invalidateTimerRef.current);
            }

            invalidateTimerRef.current = setTimeout(() => {
                const invalidate = () => {
                    queryClient.invalidateQueries({ queryKey: ['dailyStats', profile.id], exact: true });
                };
                const isDelete = signal.lastEventType === 'delete';
                const dataType = signal.lastDataType;
                const objectId = signal.lastObjectId;
                if (isDelete && dataType && objectId) {
                    const removeFromCache = (current: DailyStats | undefined) => (
                        current ? removeDeletedOuraRecord(current, dataType, objectId) : current
                    );
                    queryClient.setQueryData(['dailyStats', profile.id], removeFromCache);
                    queryClient.setQueryData(['allTimeStats', profile.id], removeFromCache);
                    void deleteStoredOuraRecord(profile.id, dataType, objectId)
                        .catch((error) => {
                            console.warn('Webhook delete reconciliation failed:', error);
                        })
                        .finally(invalidate);
                    return;
                }

                invalidate();
            }, WEBHOOK_INVALIDATE_DEBOUNCE_MS);
        };

        let unsubscribe = () => { /* noop */ };
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        let stopped = false;
        let listenerUnavailable = false;

        const clearPollTimer = () => {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        };

        const pollSignal = async () => {
            if (stopped || !profile?.ouraUserId) return;
            try {
                const signal = await webhookService.getSignal(profile.ouraUserId);
                handleSignal(signal);
            } catch (error) {
                if (stopped) return;
                console.warn('Webhook signal poll failed:', error);
            }
        };

        const startPollingFallback = () => {
            if (pollTimer || stopped) return;
            void pollSignal();
            pollTimer = setInterval(() => {
                void pollSignal();
            }, WEBHOOK_SIGNAL_POLL_INTERVAL_MS);
        };

        unsubscribe = firebaseService.subscribeToWebhookSignal(
            profile.ouraUserId,
            handleSignal,
            (error) => {
                if (stopped) return;
                if (isPermissionDeniedError(error)) {
                    if (!listenerUnavailable) {
                        listenerUnavailable = true;
                        startPollingFallback();
                    }
                    return;
                }
                console.warn('Webhook signal listener failed:', error);
            }
        );

        return () => {
            stopped = true;
            clearPollTimer();
            unsubscribe();
            if (invalidateTimerRef.current) {
                clearTimeout(invalidateTimerRef.current);
                invalidateTimerRef.current = null;
            }
        };
    }, [enabled, profile?.id, profile?.ouraUserId, queryClient]);

    useEffect(() => {
        if (!enabled || !profile?.id) return;
        if (typeof window !== 'undefined' && LOCALHOST_HOSTNAMES.has(window.location.hostname)) {
            return;
        }

        let cancelled = false;
        const now = Date.now();
        const lastChecked = (() => {
            try {
                return Number(localStorage.getItem(WEBHOOK_SETUP_CHECK_KEY) || '0');
            } catch {
                return 0;
            }
        })();

        if (lastChecked && now - lastChecked < WEBHOOK_SETUP_CHECK_INTERVAL_MS) {
            return;
        }

        webhookService.ensureSetup()
            .then(() => {
                if (cancelled) return;
                try {
                    localStorage.setItem(WEBHOOK_SETUP_CHECK_KEY, Date.now().toString());
                } catch {
                    // Ignore storage errors.
                }
            })
            .catch((error) => {
                if (cancelled) return;
                console.warn('Webhook auto-setup failed:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [enabled, profile?.id]);
};
