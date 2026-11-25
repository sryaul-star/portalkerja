import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 1. Ganti teks di dalam tanda kutip dengan judul website pilihan Anda
export const APP_NAME = "Portal Administrasi Logistik";

// 2. Konfigurasi asli proyek Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyD2JOO_n-0BKNt98mtcC6mMkAv4y0_CfU4",
  authDomain: "portal-kerja-9f880.firebaseapp.com",
  projectId: "portal-kerja-9f880",
  storageBucket: "portal-kerja-9f880.firebasestorage.app",
  messagingSenderId: "963065292587",
  appId: "1:963065292587:web:bfe7ee5aeb798cd616876e"
};

// 3. Menyalakan koneksi ke sistem Login (auth) dan Database (db)
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
