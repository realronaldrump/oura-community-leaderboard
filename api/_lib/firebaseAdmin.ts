import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

type ServiceAccountLike = {
    projectId: string;
    clientEmail: string;
    privateKey: string;
};

const parseServiceAccount = (): ServiceAccountLike | null => {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (json) {
        try {
            const parsed = JSON.parse(json);
            if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
                return {
                    projectId: parsed.project_id,
                    clientEmail: parsed.client_email,
                    privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
                };
            }
        } catch {
            return null;
        }
    }

    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
    const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.trim();
    const privateKeyBase64 = process.env.FIREBASE_ADMIN_PRIVATE_KEY_BASE64?.trim();
    const privateKey = privateKeyRaw
        ? privateKeyRaw.replace(/\\n/g, '\n')
        : privateKeyBase64
            ? Buffer.from(privateKeyBase64, 'base64').toString('utf8').replace(/\\n/g, '\n')
            : null;

    if (!projectId || !clientEmail || !privateKey) {
        return null;
    }

    return {
        projectId,
        clientEmail,
        privateKey,
    };
};

const resolveProjectId = (): string | null => {
    return process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
        || process.env.GCLOUD_PROJECT?.trim()
        || process.env.GOOGLE_CLOUD_PROJECT?.trim()
        || null;
};

const ensureAdminApp = () => {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    const serviceAccount = parseServiceAccount();
    if (serviceAccount) {
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.projectId,
        });
    }

    const projectId = resolveProjectId();
    if (!projectId) {
        throw new Error(
            'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_ADMIN_PROJECT_ID/FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_ADMIN_PRIVATE_KEY.'
        );
    }

    return initializeApp({
        credential: applicationDefault(),
        projectId,
    });
};

export const isFirebaseAdminConfigured = (): boolean => {
    if (parseServiceAccount()) return true;
    return Boolean(resolveProjectId());
};

export const getAdminFirestore = () => {
    const app = ensureAdminApp();
    return getFirestore(app);
};
