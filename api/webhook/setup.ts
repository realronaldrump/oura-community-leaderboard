const OURA_WEBHOOK_BASE_URL = 'https://api.ouraring.com/v2/webhook/subscription';
const DEFAULT_OURA_CLIENT_ID = '92e4c379-b278-4c42-a7c0-db088b67680f';
export const WEBHOOK_EVENT_TYPES = ['create', 'update', 'delete'] as const;
type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
const RENEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONCURRENT_SUBSCRIPTION_REQUESTS = 3;
const SUPPORTED_WEBHOOK_DATA_TYPES = new Set([
    'tag',
    'enhanced_tag',
    'workout',
    'session',
    'sleep',
    'daily_sleep',
    'daily_readiness',
    'daily_activity',
    'daily_spo2',
    'sleep_time',
    'rest_mode_period',
    'ring_configuration',
    'daily_stress',
    'daily_cardiovascular_age',
    'daily_resilience',
    'vo2_max',
]);
const DEFAULT_WEBHOOK_DATA_TYPES = [
    'session',
    'sleep',
    'daily_sleep',
    'daily_readiness',
    'daily_activity',
    'daily_spo2',
    'daily_stress',
    'daily_resilience',
    'sleep_time',
    'workout',
    'tag',
    'enhanced_tag',
    'rest_mode_period',
    'ring_configuration',
    'daily_cardiovascular_age',
    'vo2_max',
];

type WebhookSubscription = {
    id: string;
    callback_url: string;
    event_type: string;
    data_type: string;
    expiration_time: string;
};

type WebhookConfig = {
    clientId: string;
    clientSecret: string;
    verificationToken: string;
    dataTypes: string[];
    invalidDataTypes: string[];
    configured: boolean;
};

const subscriptionKey = (eventType: string, dataType: string): string => `${eventType}:${dataType}`;

export const getExpectedWebhookSubscriptionKeys = (dataTypes: string[]): string[] => (
    dataTypes.flatMap((dataType) => WEBHOOK_EVENT_TYPES.map((eventType) => subscriptionKey(eventType, dataType)))
);

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(payload));
};

const parseJsonResponse = async (response: Response): Promise<any> => {
    const raw = await response.text();
    try {
        return raw ? JSON.parse(raw) : null;
    } catch {
        return { raw };
    }
};

const normalizeCallbackUrl = (url: string): string => url.replace(/\/+$/, '');

const resolveServerOrigin = (req: any): string => {
    const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
    if (!host) {
        throw new Error('Cannot resolve request host for webhook callback URL.');
    }
    return `${proto}://${host}`;
};

const resolveDataTypes = (configuredDataTypes?: string): { dataTypes: string[]; invalidDataTypes: string[] } => {
    const rawDataTypes = configuredDataTypes
        ? configuredDataTypes.split(',').map((value) => value.trim()).filter(Boolean)
        : DEFAULT_WEBHOOK_DATA_TYPES;

    const uniqueDataTypes = Array.from(new Set(rawDataTypes));
    const dataTypes = uniqueDataTypes.filter((dataType) => SUPPORTED_WEBHOOK_DATA_TYPES.has(dataType));
    const invalidDataTypes = uniqueDataTypes.filter((dataType) => !SUPPORTED_WEBHOOK_DATA_TYPES.has(dataType));

    return {
        dataTypes: dataTypes.length > 0 ? dataTypes : DEFAULT_WEBHOOK_DATA_TYPES,
        invalidDataTypes,
    };
};

const resolveWebhookConfig = (): WebhookConfig => {
    const clientId =
        process.env.OURA_CLIENT_ID?.trim()
        || process.env.VITE_OURA_CLIENT_ID?.trim()
        || DEFAULT_OURA_CLIENT_ID;
    const clientSecret = process.env.OURA_CLIENT_SECRET?.trim() || '';
    const verificationToken = process.env.OURA_WEBHOOK_VERIFICATION_TOKEN?.trim() || '';
    const configuredDataTypes = process.env.OURA_WEBHOOK_DATA_TYPES?.trim();
    const { dataTypes, invalidDataTypes } = resolveDataTypes(configuredDataTypes);

    return {
        clientId,
        clientSecret,
        verificationToken,
        dataTypes,
        invalidDataTypes,
        configured: Boolean(clientId && clientSecret && verificationToken),
    };
};

const listSubscriptions = async (clientId: string, clientSecret: string): Promise<WebhookSubscription[]> => {
    const response = await fetch(OURA_WEBHOOK_BASE_URL, {
        method: 'GET',
        headers: {
            'x-client-id': clientId,
            'x-client-secret': clientSecret,
        },
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(`Oura list subscription failed (${response.status}): ${JSON.stringify(payload)}`);
    }
    return Array.isArray(payload) ? payload as WebhookSubscription[] : [];
};

const createSubscription = async (
    clientId: string,
    clientSecret: string,
    callbackUrl: string,
    verificationToken: string,
    eventType: WebhookEventType,
    dataType: string
): Promise<WebhookSubscription> => {
    const response = await fetch(OURA_WEBHOOK_BASE_URL, {
        method: 'POST',
        headers: {
            'x-client-id': clientId,
            'x-client-secret': clientSecret,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            callback_url: callbackUrl,
            verification_token: verificationToken,
            event_type: eventType,
            data_type: dataType,
        }),
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(`Oura create subscription failed (${response.status}): ${JSON.stringify(payload)}`);
    }
    return payload as WebhookSubscription;
};

const renewSubscription = async (
    clientId: string,
    clientSecret: string,
    id: string
): Promise<WebhookSubscription | null> => {
    const response = await fetch(`${OURA_WEBHOOK_BASE_URL}/renew/${id}`, {
        method: 'PUT',
        headers: {
            'x-client-id': clientId,
            'x-client-secret': clientSecret,
            'Content-Type': 'application/json',
        },
    });
    const payload = await parseJsonResponse(response);
    if (!response.ok) {
        return null;
    }
    return payload as WebhookSubscription;
};

const summarizeSubscriptions = (subscriptions: WebhookSubscription[], callbackUrl: string, dataTypes: string[]) => {
    const normalizedCallbackUrl = normalizeCallbackUrl(callbackUrl);
    const matching = subscriptions.filter((subscription) =>
        normalizeCallbackUrl(subscription.callback_url) === normalizedCallbackUrl
        && WEBHOOK_EVENT_TYPES.includes(subscription.event_type as WebhookEventType)
        && dataTypes.includes(subscription.data_type)
    );

    const byKey = new Map<string, WebhookSubscription[]>();
    matching.forEach((subscription) => {
        const key = subscriptionKey(subscription.event_type, subscription.data_type);
        const list = byKey.get(key) || [];
        list.push(subscription);
        byKey.set(key, list);
    });

    return {
        matching,
        byKey,
    };
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
    }

    let callbackUrl: string;
    try {
        callbackUrl = normalizeCallbackUrl(`${resolveServerOrigin(req)}/api/webhook/oura`);
    } catch (error: any) {
        sendJson(res, 400, { error: 'invalid_callback_origin', details: error?.message || 'unknown_error' });
        return;
    }

    const config = resolveWebhookConfig();
    if (!config.configured) {
        sendJson(res, 200, {
            configured: false,
            callbackUrl,
            dataTypes: config.dataTypes,
            eventTypes: WEBHOOK_EVENT_TYPES,
            invalidDataTypes: config.invalidDataTypes,
            subscriptions: [],
            missing: [
                !config.clientSecret ? 'OURA_CLIENT_SECRET' : null,
                !config.verificationToken ? 'OURA_WEBHOOK_VERIFICATION_TOKEN' : null,
            ].filter(Boolean),
        });
        return;
    }

    try {
        const subscriptions = await listSubscriptions(config.clientId, config.clientSecret);
        const summary = summarizeSubscriptions(subscriptions, callbackUrl, config.dataTypes);

        if (req.method === 'GET') {
            sendJson(res, 200, {
                configured: true,
                callbackUrl,
                dataTypes: config.dataTypes,
                eventTypes: WEBHOOK_EVENT_TYPES,
                invalidDataTypes: config.invalidDataTypes,
                subscriptions: summary.matching,
            });
            return;
        }

        const created: WebhookSubscription[] = [];
        const renewed: WebhookSubscription[] = [];
        const existing: WebhookSubscription[] = [];

        const expectedPairs = config.dataTypes.flatMap((dataType) => (
            WEBHOOK_EVENT_TYPES.map((eventType) => ({ dataType, eventType }))
        ));
        let nextPairIndex = 0;
        const worker = async () => {
            while (true) {
                const pairIndex = nextPairIndex;
                nextPairIndex += 1;
                if (pairIndex >= expectedPairs.length) return;
                const { dataType, eventType } = expectedPairs[pairIndex];
                const candidates = summary.byKey.get(subscriptionKey(eventType, dataType)) || [];
                if (candidates.length === 0) {
                    const subscription = await createSubscription(
                        config.clientId,
                        config.clientSecret,
                        callbackUrl,
                        config.verificationToken,
                        eventType,
                        dataType
                    );
                    created.push(subscription);
                    continue;
                }

                existing.push(...candidates);
                const earliestExpiring = candidates
                    .slice()
                    .sort((a, b) => new Date(a.expiration_time).getTime() - new Date(b.expiration_time).getTime())[0];
                const expiresInMs = new Date(earliestExpiring.expiration_time).getTime() - Date.now();
                const shouldRenewSoon = Number.isFinite(expiresInMs) && expiresInMs < RENEW_THRESHOLD_MS;
                if (shouldRenewSoon) {
                    const renewedSubscription = await renewSubscription(config.clientId, config.clientSecret, earliestExpiring.id);
                    if (renewedSubscription) {
                        renewed.push(renewedSubscription);
                    }
                }
            }
        };
        const workerCount = Math.min(MAX_CONCURRENT_SUBSCRIPTION_REQUESTS, expectedPairs.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));

        sendJson(res, 200, {
            configured: true,
            callbackUrl,
            dataTypes: config.dataTypes,
            eventTypes: WEBHOOK_EVENT_TYPES,
            invalidDataTypes: config.invalidDataTypes,
            created,
            renewed,
            existing,
        });
    } catch (error: any) {
        sendJson(res, 502, {
            error: 'webhook_setup_failed',
            details: error?.message || 'unknown_error',
        });
    }
}
