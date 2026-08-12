import crypto from 'crypto';
import { waitUntil } from '@vercel/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { syncOuraUser } from '../_lib/ouraBackgroundSync.js';

const WEBHOOK_SIGNALS_COLLECTION = 'webhookSignals';
const CLIENT_ID_HEADER = 'x-client-id';
const SIGNATURE_HEADER = 'x-oura-signature';
const TIMESTAMP_HEADER = 'x-oura-timestamp';
const WEBHOOK_DEBOUNCE_MS = 4_000;

type OuraWebhookEvent = {
    event_type?: string;
    data_type?: string;
    object_id?: string;
    user_id?: string | number;
    event_time?: string;
};

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(payload));
};

const readRawBody = (req: any): Promise<string> =>
    new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: Buffer | string) => {
            body += chunk.toString();
            if (body.length > 2_000_000) {
                reject(new Error('payload_too_large'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });

const computeSignature = (timestamp: string, rawBody: string, secret: string): string =>
    crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}${rawBody}`)
        .digest('hex')
        .toUpperCase();

const safeCompare = (left: string, right: string): boolean => {
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    if (leftBuf.length !== rightBuf.length) return false;
    return crypto.timingSafeEqual(leftBuf, rightBuf);
};

const scheduleBackground = (task: Promise<unknown>) => {
    try {
        waitUntil(task);
    } catch {
        void task.catch(() => undefined);
    }
};

const validateClientId = (req: any): boolean => {
    const expectedClientId = process.env.OURA_CLIENT_ID?.trim();
    if (!expectedClientId) return true;
    const receivedClientId = String(req.headers?.[CLIENT_ID_HEADER] || '').trim();
    return receivedClientId.length === 0 || receivedClientId === expectedClientId;
};

const persistSignal = async (params: {
    userId: string;
    lastEventAt: string;
    nowIso: string;
    event: OuraWebhookEvent;
}) => {
    const db = getAdminFirestore();
    await db.collection(WEBHOOK_SIGNALS_COLLECTION).doc(params.userId).set({
        ouraUserId: params.userId,
        lastEventAt: params.lastEventAt,
        lastReceivedAt: params.nowIso,
        lastEventType: params.event.event_type || 'update',
        lastDataType: params.event.data_type || 'unknown',
        lastObjectId: params.event.object_id || null,
        updateCount: FieldValue.increment(1),
    }, { merge: true });
};

const handleVerification = (req: any, res: any) => {
    const expectedToken = process.env.OURA_WEBHOOK_VERIFICATION_TOKEN?.trim();
    if (!expectedToken) {
        sendJson(res, 500, { error: 'missing_webhook_verification_token' });
        return;
    }

    const incomingToken = String(req.query?.verification_token || '').trim();
    const challenge = String(req.query?.challenge || '');
    if (!incomingToken || incomingToken !== expectedToken) {
        sendJson(res, 401, { error: 'invalid_verification_token' });
        return;
    }

    sendJson(res, 200, { challenge });
};

const handleEvent = async (req: any, res: any) => {
    const clientSecret = process.env.OURA_CLIENT_SECRET?.trim();
    if (!clientSecret) {
        sendJson(res, 500, { error: 'missing_oura_client_secret' });
        return;
    }

    if (!validateClientId(req)) {
        sendJson(res, 401, { error: 'invalid_client_id' });
        return;
    }

    let rawBody: string;
    try {
        rawBody = await readRawBody(req);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'read_failed';
        sendJson(res, message === 'payload_too_large' ? 413 : 400, { error: message });
        return;
    }

    const signature = String(req.headers?.[SIGNATURE_HEADER] || '').trim().toUpperCase();
    const timestamp = String(req.headers?.[TIMESTAMP_HEADER] || '').trim();
    if (!signature || !timestamp) {
        sendJson(res, 401, { error: 'missing_signature_headers' });
        return;
    }

    const expectedSignature = computeSignature(timestamp, rawBody, clientSecret);
    if (!safeCompare(signature, expectedSignature)) {
        sendJson(res, 401, { error: 'invalid_signature' });
        return;
    }

    let event: OuraWebhookEvent;
    try {
        event = (rawBody ? JSON.parse(rawBody) : {}) as OuraWebhookEvent;
    } catch {
        sendJson(res, 400, { error: 'invalid_json' });
        return;
    }

    const userId = event.user_id != null ? String(event.user_id) : '';
    if (!userId) {
        sendJson(res, 202, { ok: true, ignored: 'missing_user_id' });
        return;
    }

    const nowIso = new Date().toISOString();
    const lastEventAt = typeof event.event_time === 'string' && event.event_time ? event.event_time : nowIso;

    try {
        await persistSignal({
            userId,
            lastEventAt,
            nowIso,
            event,
        });
    } catch (error: any) {
        sendJson(res, 500, {
            error: 'failed_to_persist_webhook_signal',
            details: error?.message || 'unknown_error',
        });
        return;
    }

    scheduleBackground((async () => {
        await new Promise((resolve) => setTimeout(resolve, WEBHOOK_DEBOUNCE_MS));
        await syncOuraUser(userId, {
            reason: 'webhook',
            webhookRecord: {
                eventType: event.event_type,
                dataType: event.data_type,
                objectId: event.object_id || null,
            },
        });
    })());

    sendJson(res, 200, { ok: true });
};

export const maxDuration = 60;

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: any, res: any) {
    if (req.method === 'GET') {
        handleVerification(req, res);
        return;
    }

    if (req.method === 'POST') {
        await handleEvent(req, res);
        return;
    }

    sendJson(res, 405, { error: 'method_not_allowed' });
}
