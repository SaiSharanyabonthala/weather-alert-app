import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAEi8SUt_ug2Ji9R-pLqx6rZ6C9wG7fs5U",
  authDomain: "weathermap-31796.firebaseapp.com",
  projectId: "weathermap-31796",
  storageBucket: "weathermap-31796.appspot.com",
  messagingSenderId: "386652803602",
  appId: "1:386652803602:web:9540c4258fd20a9c937ecb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize Leaflet Map
const map = L.map('map').setView([17.3850, 78.4867], 6); // Default: Hyderabad
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// DOM Elements
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const logoutBtn = document.getElementById('logout-btn');
const dashboard = document.getElementById('dashboard');
const userDisplay = document.getElementById('user-display');
const saveLocBtn = document.getElementById('save-location-btn');
const cityInput = document.getElementById('city-input');
const tempThresholdInput = document.getElementById('temp-threshold');

let currentUser = null;

signupBtn.addEventListener('click', () => {
  createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message));
});

loginBtn.addEventListener('click', () => {
  signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch(err => alert(err.message));
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    userDisplay.textContent = user.email;
    dashboard.style.display = 'block';
    loginBtn.style.display = 'none';
    signupBtn.style.display = 'none';
    logoutBtn.style.display = 'inline-block';
    loadUserLocations(user.uid);
  } else {
    currentUser = null;
    dashboard.style.display = 'none';
    loginBtn.style.display = 'inline-block';
    signupBtn.style.display = 'inline-block';
    logoutBtn.style.display = 'none';
  }
});

saveLocBtn.addEventListener('click', async () => {
  const cityName = cityInput.value.trim();
  const maxTempThreshold = parseFloat(tempThresholdInput.value);
  if (!cityName) return alert("Please enter a city name.");

  try {
    // Fetch coordinates via OpenWeatherMap to place a map marker immediately
    const apiKey = "be367053026ea72a38768fed46cf7dbf"; // Replace with your OpenWeatherMap API key
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}&units=metric`);
    const data = await res.json();

    if (data.cod === 200) {
      const { lat, lon } = data.coord;
      
      await addDoc(collection(db, "watched_locations"), {
        userId: currentUser.uid,
        cityName: cityName,
        lat: lat,
        lon: lon,
        maxTempThreshold: maxTempThreshold
      });

      alert("Location saved and scheduled for monitoring!");
      cityInput.value = "";
      loadUserLocations(currentUser.uid);
    } else {
      alert("City not found.");
    }
  } catch (err) {
    console.error(err);
  }
});

async function loadUserLocations(uid) {
  const q = query(collection(db, "watched_locations"), where("userId", "==", uid));
  const snapshot = await getDocs(q);
  
  snapshot.forEach((docSnap) => {
    const loc = docSnap.data();
    L.marker([loc.lat, loc.lon]).addTo(map)
      .bindPopup(`<b>${loc.cityName}</b><br>Alert Threshold: >${loc.maxTempThreshold}°C`);
  });
}