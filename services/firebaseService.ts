
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    QuerySnapshot,
    DocumentData
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { UserProfile } from "../types";

const PROFILES_COLLECTION = "profiles";

export const firebaseService = {
    /**
     * Subscribe to real-time updates of all profiles
     */
    subscribeToProfiles: (callback: (profiles: UserProfile[]) => void) => {
        const q = collection(db, PROFILES_COLLECTION);
        return onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
            const profiles: UserProfile[] = [];
            querySnapshot.forEach((doc) => {
                profiles.push(doc.data() as UserProfile);
            });
            callback(profiles);
        });
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
     * Delete a profile
     */
    deleteProfile: async (id: string): Promise<void> => {
        try {
            await deleteDoc(doc(db, PROFILES_COLLECTION, id));
        } catch (error) {
            console.error("Error deleting profile from Firebase:", error);
            throw error;
        }
    }
};
