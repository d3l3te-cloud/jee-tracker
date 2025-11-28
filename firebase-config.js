// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAO6lAxJ8DTqRq62E-8PIxnwBBWm-vZ-d4",
  authDomain: "praxis-cd621.firebaseapp.com",
  projectId: "praxis-cd621",
  storageBucket: "praxis-cd621.firebasestorage.app",
  messagingSenderId: "924385334052",
  appId: "1:924385334052:web:89ff6ab687f2dd769e19b1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
};

