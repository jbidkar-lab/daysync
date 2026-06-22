import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD_zlRsg0rxtsIw7rGv09DlgMqahipSogY",
  authDomain: "daysync-bf7b0.firebaseapp.com",
  projectId: "daysync-bf7b0",
  storageBucket: "daysync-bf7b0.firebasestorage.app",
  messagingSenderId: "1020671539287",
  appId: "1:1020671539287:web:c129165060d2ed874c8b12"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();