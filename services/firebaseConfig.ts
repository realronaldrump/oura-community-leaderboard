
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace with your actual Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyA4BVUaIQ2vgX2AaSL3lIhmsctgEuRBtNc",
    authDomain: "oura-friends.firebaseapp.com",
    projectId: "oura-friends",
    storageBucket: "oura-friends.firebasestorage.app",
    messagingSenderId: "117536947598",
    appId: "1:117536947598:web:35b69d39425215144538df",
    measurementId: "G-YTXWV81KBG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
