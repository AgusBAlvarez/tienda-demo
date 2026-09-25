// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDrxz6LjiS6C_vxXyVtfG7luGvO78vI4hI",
  authDomain: "el-baul-de-maribel.firebaseapp.com",
  projectId: "el-baul-de-maribel",
  storageBucket: "el-baul-de-maribel.firebasestorage.app",
  messagingSenderId: "535344319653",
  appId: "1:535344319653:web:782d005d6e61117866514c"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);