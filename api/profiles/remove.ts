import { getAdminFirestore } from '../_lib/firebaseAdmin.js';

const PROFILES_COLLECTION = 'profiles';
const PROFILE_STATS_COLLECTION = 'profileStats';
const CREDENTIALS_COLLECTION = 'ouraCredentials';
const SYNC_STATE_COLLECTION = 'ouraSyncState';
const WEBHOOK_SIGNALS_COLLECTION = 'webhookSignals';

const sendJson = (res: any, status: number, payload: Record<string, unknown>) => {
    res.status(status)
        .setHeader('Content-Type', 'application/json')
        .setHeader('Cache-Control', 'no-store')
        .send(JSON.stringify(payload));
};

export const isValidProfileId = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' });
        return;
    }

    const profileId = req.body?.profileId;
    if (!isValidProfileId(profileId)) {
        sendJson(res, 400, { error: 'invalid_profile_id' });
        return;
    }

    try {
        const db = getAdminFirestore();
        const [profiles, profileSnapshot] = await Promise.all([
            db.collection(PROFILES_COLLECTION).limit(2).get(),
            db.collection(PROFILES_COLLECTION).doc(profileId).get(),
        ]);
        if (!profileSnapshot.exists) {
            sendJson(res, 404, { error: 'profile_not_found' });
            return;
        }
        if (profiles.size <= 1) {
            sendJson(res, 409, { error: 'cannot_remove_only_profile' });
            return;
        }

        // Delete history first so a retry remains possible if cleanup fails.
        await db.recursiveDelete(db.collection(PROFILE_STATS_COLLECTION).doc(profileId));

        const profile = profileSnapshot.data() || {};
        const batch = db.batch();
        batch.delete(db.collection(CREDENTIALS_COLLECTION).doc(profileId));
        batch.delete(db.collection(SYNC_STATE_COLLECTION).doc(profileId));
        if (profile.ouraUserId != null) {
            batch.delete(db.collection(WEBHOOK_SIGNALS_COLLECTION).doc(String(profile.ouraUserId)));
        }
        batch.delete(db.collection(PROFILES_COLLECTION).doc(profileId));
        await batch.commit();

        sendJson(res, 200, { ok: true });
    } catch {
        sendJson(res, 500, { error: 'profile_removal_failed' });
    }
}
