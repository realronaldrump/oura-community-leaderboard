import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../_lib/firebaseAdmin.js';
import { syncOuraProfile } from '../_lib/ouraBackgroundSync.js';

const OURA_PERSONAL_INFO_URL = 'https://api.ouraring.com/v2/usercollection/personal_info';
const PROFILES_COLLECTION = 'profiles';
const CREDENTIALS_COLLECTION = 'ouraCredentials';
const REQUEST_TIMEOUT_MS = 10_000;

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status)
        .setHeader('Content-Type', 'application/json')
        .setHeader('Cache-Control', 'no-store')
        .setHeader('Pragma', 'no-cache')
        .send(JSON.stringify(payload));
};

const sanitizedScopes = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((entry) => {
        if (typeof entry !== 'string') return [];
        const scope = entry.trim();
        const key = scope.toLowerCase().replace(/^extapi:/, '').replace(/[^a-z0-9]/g, '');
        if (!scope || !key || seen.has(key)) return [];
        seen.add(key);
        return [scope];
    });
};

const fetchPersonalInfo = async (accessToken: string): Promise<Record<string, any>> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(OURA_PERSONAL_INFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 401 ? 'invalid_access_token' : 'personal_info_unavailable');
        const payload = await response.json();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('invalid_personal_info');
        }
        return payload;
    } finally {
        clearTimeout(timeout);
    }
};

export const buildPublicProfile = (
    profileId: string,
    existing: Record<string, any> | null,
    personalInfo: Record<string, any>,
    ouraUserId: string,
    grantedScopes: string[],
    nowIso: string
) => {
    const {
        token: _token,
        refreshToken: _refreshToken,
        tokenExpiresAt: _tokenExpiresAt,
        ...safeExisting
    } = existing || {};
    return {
        ...safeExisting,
        ...personalInfo,
        id: profileId,
        ouraUserId,
        email: typeof personalInfo.email === 'string' ? personalInfo.email.toLowerCase() : safeExisting.email || null,
        grantedScopes,
        lastSuccessfulSyncAt: safeExisting.lastSuccessfulSyncAt || null,
        lastSyncError: null,
        lastSyncErrorAt: null,
        lastUpdated: nowIso,
    };
};

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
    }
    const accessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : '';
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : '';
    if (!accessToken || !refreshToken || accessToken.length > 8_000 || refreshToken.length > 8_000) {
        sendJson(res, 400, { error: 'invalid_credentials' });
        return;
    }

    try {
        const personalInfo = await fetchPersonalInfo(accessToken);
        const ouraUserId = personalInfo.id != null ? String(personalInfo.id) : '';
        if (!ouraUserId) {
            sendJson(res, 502, { error: 'missing_oura_user_id' });
            return;
        }
        const db = getAdminFirestore();
        const profiles = await db.collection(PROFILES_COLLECTION).get();
        const email = typeof personalInfo.email === 'string' ? personalInfo.email.toLowerCase() : null;
        const existingDocument = profiles.docs.find((document) => {
            const profile = document.data();
            return String(profile.ouraUserId ?? '') === ouraUserId ||
                Boolean(email && String(profile.email || '').toLowerCase() === email);
        });
        const profileId = existingDocument?.id || crypto.randomUUID();
        const existing = existingDocument?.data() || null;
        const nowIso = new Date().toISOString();
        const expiresInSeconds = Number(req.body?.expiresInSeconds);
        const grantedScopes = sanitizedScopes(req.body?.grantedScopes);
        const publicProfile = buildPublicProfile(
            profileId,
            existing,
            personalInfo,
            ouraUserId,
            grantedScopes.length > 0 ? grantedScopes : sanitizedScopes(existing?.grantedScopes),
            nowIso
        );
        const credential = {
            profileId,
            ouraUserId,
            token: accessToken,
            refreshToken,
            tokenExpiresAt: Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
                ? new Date(Date.now() + expiresInSeconds * 1_000).toISOString()
                : new Date(Date.now() + 10 * 60_000).toISOString(),
            grantedScopes: publicProfile.grantedScopes,
            updatedAt: nowIso,
        };

        const batch = db.batch();
        batch.set(db.collection(CREDENTIALS_COLLECTION).doc(profileId), credential, { merge: false });
        batch.set(db.collection(PROFILES_COLLECTION).doc(profileId), {
            ...publicProfile,
            token: FieldValue.delete(),
            refreshToken: FieldValue.delete(),
            tokenExpiresAt: FieldValue.delete(),
        }, { merge: true });
        await batch.commit();

        const task = syncOuraProfile(profileId, { reason: 'bootstrap', includeStatic: true });
        try {
            waitUntil(task);
        } catch {
            void task.catch(() => undefined);
        }
        sendJson(res, 200, { profile: publicProfile });
    } catch (error) {
        const code = error instanceof Error ? error.message : 'profile_connection_failed';
        const status = code === 'invalid_access_token' ? 401 : code === 'personal_info_unavailable' ? 503 : 500;
        sendJson(res, status, { error: code });
    }
}
