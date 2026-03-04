import { WebhookSignal } from '../types';

type WebhookSetupResult = {
    configured: boolean;
    callbackUrl: string;
    dataTypes: string[];
    subscriptions?: Array<{
        id: string;
        callback_url: string;
        event_type: string;
        data_type: string;
        expiration_time: string;
    }>;
    created?: any[];
    renewed?: any[];
    existing?: any[];
    missing?: string[];
    error?: string;
    details?: string;
};

type WebhookSignalResult = {
    ok: boolean;
    signal: WebhookSignal | null;
};

const parseJson = async (response: Response) => {
    const raw = await response.text();
    try {
        return raw ? JSON.parse(raw) : {};
    } catch {
        return { raw };
    }
};

const requestSetup = async (method: 'GET' | 'POST'): Promise<WebhookSetupResult> => {
    const response = await fetch('/api/webhook/setup', { method });
    const payload = await parseJson(response);
    if (!response.ok) {
        const errorMessage = typeof payload?.details === 'string'
            ? payload.details
            : typeof payload?.error === 'string'
                ? payload.error
                : `Webhook setup request failed (${response.status})`;
        throw new Error(errorMessage);
    }
    return payload as WebhookSetupResult;
};

const requestSignal = async (ouraUserId: string): Promise<WebhookSignal | null> => {
    const response = await fetch(`/api/webhook/signal?user_id=${encodeURIComponent(ouraUserId)}`, {
        method: 'GET',
    });
    const payload = await parseJson(response);
    if (!response.ok) {
        const errorMessage = typeof payload?.details === 'string'
            ? payload.details
            : typeof payload?.error === 'string'
                ? payload.error
                : `Webhook signal request failed (${response.status})`;
        throw new Error(errorMessage);
    }
    return (payload as WebhookSignalResult).signal || null;
};

export const webhookService = {
    getStatus: () => requestSetup('GET'),
    ensureSetup: () => requestSetup('POST'),
    getSignal: (ouraUserId: string) => requestSignal(ouraUserId),
};
