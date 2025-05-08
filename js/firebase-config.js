// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Your web app's Firebase configuration
// WARNING: Exposing API keys client-side is standard for web apps,
// but ensure your Firestore Security Rules are properly configured.
const firebaseConfig = {
  apiKey: "AIzaSyDDkGr_sOFIZzW5Nh8VmvPiOyFtoghBd9A", // USE YOUR ACTUAL KEY
  authDomain: "gymm-178fb.firebaseapp.com",         // USE YOUR ACTUAL DOMAIN
  projectId: "gymm-178fb",                         // USE YOUR ACTUAL PROJECT ID
  storageBucket: "gymm-178fb.appspot.com",         // USE YOUR ACTUAL BUCKET
  messagingSenderId: "749496767338",               // USE YOUR ACTUAL SENDER ID
  appId: "1:749496767338:web:4f399779bd7cb6b8968b13" // USE YOUR ACTUAL APP ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };