import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Firebase web config is safe to be public. Access is protected by
// Firestore security rules (see firestore.rules) and Auth.
const firebaseConfig = {
  apiKey: "AIzaSyAEi8SUt_ug2Ji9R-pLqx6rZ6C9wG7fs5U",
  authDomain: "weathermap-31796.firebaseapp.com",
  projectId: "weathermap-31796",
  storageBucket: "weathermap-31796.appspot.com",
  messagingSenderId: "386652803602",
  appId: "1:386652803602:web:9540c4258fd20a9c937ecb",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Map ----------
const map = L.map("map").setView([17.385, 78.4867], 6); // Default: Hyderabad
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const emailInput = $("email");
const passwordInput = $("password");
const loginBtn = $("login-btn");
const signupBtn = $("signup-btn");
const logoutBtn = $("logout-btn");
const dashboard = $("dashboard");
const userDisplay = $("user-display");
const saveLocBtn = $("save-location-btn");
const cityInput = $("city-input");
const tempThresholdInput = $("temp-threshold");
const locationList = $("location-list");
const statusEl = $("status");

let currentUser = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b00020" : "#1b5e20";
}

// ---------- Auth ----------
signupBtn.addEventListener("click", () => {
  createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch((err) =>
    setStatus(err.message, true)
  );
});

loginBtn.addEventListener("click", () => {
  signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value).catch((err) =>
    setStatus(err.message, true)
  );
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    userDisplay.textContent = user.email;
    dashboard.style.display = "block";
    loginBtn.style.display = "none";
    signupBtn.style.display = "none";
    emailInput.style.display = "none";
    passwordInput.style.display = "none";
    logoutBtn.style.display = "inline-block";
    setStatus("");
    loadUserLocations(user.uid);
  } else {
    currentUser = null;
    dashboard.style.display = "none";
    loginBtn.style.display = "inline-block";
    signupBtn.style.display = "inline-block";
    emailInput.style.display = "inline-block";
    passwordInput.style.display = "inline-block";
    logoutBtn.style.display = "none";
    markerLayer.clearLayers();
    locationList.innerHTML = "";
  }
});

// ---------- Geocoding (no API key needed) ----------
async function geocodeCity(name) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" +
    encodeURIComponent(name);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Geocoding service error.");
  const data = await res.json();
  const hit = data.results?.[0];
  if (!hit) return null;
  return { lat: hit.latitude, lon: hit.longitude, label: hit.name };
}

// ---------- Save a location ----------
saveLocBtn.addEventListener("click", async () => {
  if (!currentUser) return;

  const cityName = cityInput.value.trim();
  const maxTempThreshold = parseFloat(tempThresholdInput.value);

  if (!cityName) return setStatus("Please enter a city name.", true);
  if (!Number.isFinite(maxTempThreshold)) return setStatus("Please enter a valid temperature threshold.", true);

  saveLocBtn.disabled = true;
  try {
    const place = await geocodeCity(cityName);
    if (!place) {
      setStatus("City not found.", true);
      return;
    }

    await addDoc(collection(db, "watched_locations"), {
      userId: currentUser.uid,
      cityName, // the worker uses this name to query OpenWeatherMap
      lat: place.lat,
      lon: place.lon,
      maxTempThreshold,
      createdAt: serverTimestamp(),
    });

    setStatus(`Saved ${cityName}. You'll get an email when it reaches ${maxTempThreshold}°C.`);
    cityInput.value = "";
    await loadUserLocations(currentUser.uid);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not save location.", true);
  } finally {
    saveLocBtn.disabled = false;
  }
});

// ---------- Load / render locations ----------
async function loadUserLocations(uid) {
  markerLayer.clearLayers();
  locationList.innerHTML = "";

  try {
    const q = query(collection(db, "watched_locations"), where("userId", "==", uid));
    const snapshot = await getDocs(q);
    const bounds = [];

    snapshot.forEach((docSnap) => {
      const loc = docSnap.data();

      // Popup built with DOM nodes (not innerHTML) to avoid XSS from city names.
      const popup = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = loc.cityName;
      popup.append(title, document.createElement("br"), `Alert threshold: >${loc.maxTempThreshold}°C`);

      L.marker([loc.lat, loc.lon]).addTo(markerLayer).bindPopup(popup);
      bounds.push([loc.lat, loc.lon]);

      const li = document.createElement("li");
      li.textContent = `${loc.cityName} — alert at ${loc.maxTempThreshold}°C `;
      const del = document.createElement("button");
      del.textContent = "Remove";
      del.addEventListener("click", async () => {
        try {
          await deleteDoc(doc(db, "watched_locations", docSnap.id));
          await loadUserLocations(uid);
        } catch (err) {
          setStatus(err.message, true);
        }
      });
      li.appendChild(del);
      locationList.appendChild(li);
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
  } catch (err) {
    console.error(err);
    setStatus("Could not load locations: " + err.message, true);
  }
}