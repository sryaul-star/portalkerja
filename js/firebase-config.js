import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 1. Ganti dengan nama portal yang Anda inginkan
export const APP_NAME = "NAMA PORTAL PILIHAN ANDA";

// 2. Ganti blok di bawah ini dengan firebaseConfig asli dari Notepad Anda
const firebaseConfig = {
  apiKey: "TEMPEL_API_KEY_ANDA",
  authDomain: "TEMPEL_AUTH_DOMAIN_ANDA",
  projectId: "TEMPEL_PROJECT_ID_ANDA",
  storageBucket: "TEMPEL_STORAGE_BUCKET_ANDA",
  messagingSenderId: "TEMPEL_MESSAGING_SENDER_ID_ANDA",
  appId: "TEMPEL_APP_ID_ANDA"
};

// 3. Menyalakan koneksi ke sistem Login (auth) dan Database (db)
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
