
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
