
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFirestore as getBootstrapFirestore } from "firebase/firestore/lite";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyA4BVUaIQ2vgX2AaSL3lIhmsctgEuRBtNc",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "oura-friends.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "oura-friends",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "oura-friends.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "117536947598",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:117536947598:web:35b69d39425215144538df",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-YTXWV81KBG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Firestore's full browser SDK uses a realtime WebChannel transport. That is
// appropriate for listeners, but a cold WebChannel negotiation can delay the
// first one-shot read for many seconds on mobile networks. The Lite instance
// uses the REST transport, so critical bootstrap reads can complete without
// waiting for the realtime connection to initialize.
export const bootstrapDb = getBootstrapFirestore(app);
