import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAWLdNoNhFunW5TYJMiv1LPIEO3ApIdVW8",
  authDomain: "smartbmi-demo.firebaseapp.com",
  projectId: "smartbmi-demo",
  databaseURL: "https://smartbmi-demo-default-rtdb.firebaseio.com",
  storageBucket: "smartbmi-demo.firebasestorage.app",
  messagingSenderId: "326937233306",
  appId: "1:326937233306:web:ce63236ff88ab744965c23"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export database and storage
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
