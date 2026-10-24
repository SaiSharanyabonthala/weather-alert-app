import admin from "firebase-admin";
import nodemailer from "nodemailer";
import fetch from "node-fetch";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const gmailUser = process.env.GMAIL_USER;
const gmailPassword = process.env.GMAIL_APP_PASSWORD;
const weatherApiKey = process.env.WEATHER_API_KEY;

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
});

const db = admin.firestore();
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: gmailUser, pass: gmailPassword },
});

async function checkWeatherAlerts() {
  const snapshot = await db.collection("watched_locations").get();
  for (const docSnap of snapshot.docs) {
    const loc = docSnap.data();
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${loc.cityName}&appid=${weatherApiKey}&units=metric`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.cod === 200) {
      const temp = data.main.temp;
      const condition = data.weather[0].description;

      if (temp >= (loc.maxTempThreshold || 40)) {
        const user = await admin.auth().getUser(loc.userId);
        if (user.email) {
          await transporter.sendMail({
            from: gmailUser,
            to: user.email,
            subject: `Weather Alert: High Temperature in ${loc.cityName}`,
            text: `Warning! Current temperature in ${loc.cityName} is ${temp}°C (${condition}). Please take precautions.`
          });
          console.log(`Alert sent to ${user.email} for ${loc.cityName}`);
        }
      }
    }
  }
}

checkWeatherAlerts().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});