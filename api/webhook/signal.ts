import { getAdminFirestore } from '../_lib/firebaseAdmin.js';

const WEBHOOK_SIGNALS_COLLECTION = 'webhookSignals';

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(payload));
};

const resolveUserId = (req: any): string => {
    const query = req.query || {};
    const userId = query.user_id || query.userId || query.ouraUserId;
    return typeof userId === 'string' ? userId.trim() : '';
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
    }

    const userId = resolveUserId(req);
    if (!userId) {
        sendJson(res, 400, { error: 'missing_user_id' });
        return;
    }

    try {
        const db = getAdminFirestore();
        const snapshot = await db.collection(WEBHOOK_SIGNALS_COLLECTION).doc(userId).get();
        if (!snapshot.exists) {
            sendJson(res, 200, { ok: true, signal: null });
            return;
        }

        sendJson(res, 200, { ok: true, signal: snapshot.data() || null });
    } catch (error: any) {
        sendJson(res, 500, {
            error: 'failed_to_read_webhook_signal',
            details: error?.message || 'unknown_error',
        });
    }
}
