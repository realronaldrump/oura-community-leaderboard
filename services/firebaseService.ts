
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    QuerySnapshot,
    DocumentData,
    runTransaction,
} from "firebase/firestore";
import {
    collection as bootstrapCollection,
    doc as bootstrapDoc,
    getDoc as getBootstrapDoc,
    getDocs as getBootstrapDocs,
} from "firebase/firestore/lite";
import { bootstrapDb, db } from "./firebaseConfig";
import { UserProfile, WebhookSignal } from "../types";
import {
    shouldReplaceProfileTemporalMetadata,
    type ProfileTemporalMetadata,
} from "../utils/profileTemporal";

const PROFILES_COLLECTION = "profiles";
const WEBHOOK_SIGNALS_COLLECTION = "webhookSignals";

export const firebaseService = {
    /**
     * Subscribe to real-time updates of all profiles
     */
    subscribeToProfiles: (
        callback: (profiles: UserProfile[]) => void,
        onError?: (error: any) => void
    ) => {
        const q = collection(db, PROFILES_COLLECTION);
        return onSnapshot(
            q,
            (querySnapshot: QuerySnapshot<DocumentData>) => {
                const profiles: UserProfile[] = [];
                querySnapshot.forEach((doc) => {
                    profiles.push(doc.data() as UserProfile);
                });
                callback(profiles);
            },
            (error) => {
                if (onError) {
                    onError(error);
                } else {
                    console.error("Firestore subscription error:", error);
                }
            }
        );
    },

    /**
     * One-shot fetch of all profiles (bypasses the realtime subscription).
     */
    getProfiles: async (): Promise<UserProfile[]> => {
        const snapshot = await getBootstrapDocs(bootstrapCollection(bootstrapDb, PROFILES_COLLECTION));
        const profiles: UserProfile[] = [];
        snapshot.forEach((profileDocument) => {
            profiles.push(profileDocument.data() as UserProfile);
        });
        return profiles;
    },

    /**
     * Read the latest profile document before a single-use token refresh.
     */
    getProfile: async (id: string): Promise<UserProfile | null> => {
        const snapshot = await getBootstrapDoc(bootstrapDoc(bootstrapDb, PROFILES_COLLECTION, id));
        return snapshot.exists() ? snapshot.data() as UserProfile : null;
    },

    /**
     * Save or update a profile
     */
    saveProfile: async (profile: UserProfile): Promise<void> => {
        try {
            await setDoc(doc(db, PROFILES_COLLECTION, profile.id), profile);
        } catch (error) {
            console.error("Error saving profile to Firebase:", error);
            throw error;
        }
    },

    /**
     * Patch a profile without overwriting unrelated fields.
     */
    patchProfile: async (id: string, patch: Partial<UserProfile>): Promise<void> => {
        try {
            await setDoc(doc(db, PROFILES_COLLECTION, id), patch, { merge: true });
        } catch (error) {
            console.error("Error patching profile in Firebase:", error);
            throw error;
        }
    },

    /**
     * Persist timezone evidence monotonically. Concurrent/partial syncs may
     * finish out of order, so an older observation must never roll the profile
     * clock backward. Legacy heart-rate-derived offsets are always replaceable.
     */
    persistProfileTemporalMetadata: async (
        id: string,
        metadata: ProfileTemporalMetadata
    ): Promise<boolean> => {
        return runTransaction(db, async (transaction) => {
            const profileRef = doc(db, PROFILES_COLLECTION, id);
            const snapshot = await transaction.get(profileRef);
            if (!snapshot.exists()) return false;

            const current = snapshot.data() as UserProfile;
            if (!shouldReplaceProfileTemporalMetadata(current, metadata)) {
                return false;
            }

            transaction.set(profileRef, {
                ...metadata,
                lastUpdated: new Date().toISOString(),
            }, { merge: true });
            return true;
        });
    },

    /**
     * Delete a profile
     */
    deleteProfile: async (id: string): Promise<void> => {
        try {
            await deleteDoc(doc(db, PROFILES_COLLECTION, id));
        } catch (error) {
            console.error("Error deleting profile from Firebase:", error);
            throw error;
        }
    },

    /**
     * Subscribe to webhook signal updates for a specific Oura user id.
     */
    subscribeToWebhookSignal: (
        ouraUserId: string,
        callback: (signal: WebhookSignal | null) => void,
        onError?: (error: any) => void
    ) => {
        const signalRef = doc(db, WEBHOOK_SIGNALS_COLLECTION, ouraUserId);
        return onSnapshot(
            signalRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    callback(null);
                    return;
                }
                callback(snapshot.data() as WebhookSignal);
            },
            (error) => {
                if (onError) {
                    onError(error);
                } else {
                    console.error("Webhook signal subscription error:", error);
                }
            }
        );
    }
};
