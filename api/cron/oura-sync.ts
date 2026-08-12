import crypto from 'node:crypto';
import { syncAllOuraProfiles } from '../_lib/ouraBackgroundSync.js';

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status)
        .setHeader('Content-Type', 'application/json')
        .setHeader('Cache-Control', 'no-store')
        .send(JSON.stringify(payload));
};

const safeEqual = (left: string, right: string): boolean => {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const isAuthorizedCronRequest = (authorization: unknown, secret: string | undefined): boolean => {
    const configuredSecret = secret?.trim() || '';
    const provided = typeof authorization === 'string' ? authorization.trim() : '';
    return Boolean(configuredSecret && provided && safeEqual(provided, `Bearer ${configuredSecret}`));
};

export const maxDuration = 60;

const maintainWebhookSubscriptions = async (req: any): Promise<boolean> => {
    const protocol = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
    if (!host) return false;
    try {
        const authorization = String(req.headers?.authorization || '');
        const response = await fetch(`${protocol}://${host}/api/webhook/setup`, {
            method: 'POST',
            headers: { Authorization: authorization },
        });
        return response.ok;
    } catch {
        return false;
    }
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
    }
    if (!isAuthorizedCronRequest(req.headers?.authorization, process.env.CRON_SECRET)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
    }

    try {
        const [results, webhooksMaintained] = await Promise.all([
            syncAllOuraProfiles(),
            maintainWebhookSubscriptions(req),
        ]);
        sendJson(res, 200, {
            ok: true,
            webhooksMaintained,
            synced: results.filter((result) => result.status === 'synced').length,
            skipped: results.filter((result) => result.status === 'skipped').length,
            reconnectRequired: results.filter((result) => result.status === 'reconnect_required').length,
            failed: results.filter((result) => result.status === 'failed').length,
        });
    } catch {
        sendJson(res, 500, { error: 'background_sync_failed' });
    }
}
