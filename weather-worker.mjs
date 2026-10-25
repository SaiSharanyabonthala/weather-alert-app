import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import nodemailer from "nodemailer";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const serviceAccountJson = requireEnv("FIREBASE_SERVICE_ACCOUNT");
  const gmailUser = requireEnv("GMAIL_USER");
  const gmailPassword = requireEnv("GMAIL_APP_PASSWORD");
  const weatherApiKey = requireEnv("WEATHER_API_KEY");

  let serviceAccount;

  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT must contain valid service account JSON."
    );
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
  });

  const db = getFirestore(app);
  const auth = getAuth(app);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  });

  await transporter.verify();
  console.log("Email service connection verified.");

  const snapshot = await db.collection("watched_locations").get();

  if (snapshot.empty) {
    console.log("No watched locations found in Firestore.");
    return;
  }

  let alertsSent = 0;
  let locationsChecked = 0;
  let locationsFailed = 0;

  for (const docSnap of snapshot.docs) {
    const loc = docSnap.data();

    if (
      !loc.cityName ||
      !loc.userId ||
      !Number.isFinite(Number(loc.maxTempThreshold))
    ) {
      console.error(`Skipping invalid location document: ${docSnap.id}`);
      locationsFailed++;
      continue;
    }

    try {
      const city = encodeURIComponent(loc.cityName);
      const url =
        `https://api.openweathermap.org/data/2.5/weather` +
        `?q=${city}&appid=${weatherApiKey}&units=metric`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || Number(data.cod) !== 200) {
        throw new Error(
          data.message || `Weather API returned HTTP ${response.status}`
        );
      }

      locationsChecked++;

      const temperature = data.main.temp;
      const condition = data.weather?.[0]?.description ?? "Unknown";
      const threshold = Number(loc.maxTempThreshold);

      console.log(
        `${loc.cityName}: ${temperature}°C; alert threshold: ${threshold}°C`
      );

      if (temperature < threshold) {
        continue;
      }

      const user = await auth.getUser(loc.userId);

      if (!user.email) {
        console.warn(`No email address for Firebase user ${loc.userId}`);
        continue;
      }

      await transporter.sendMail({
        from: gmailUser,
        to: user.email,
        subject: `Weather Alert: High Temperature in ${loc.cityName}`,
        text:
          `Warning! The current temperature in ${loc.cityName} is ` +
          `${temperature}°C (${condition}). Your configured threshold is ` +
          `${threshold}°C. Please take precautions.`,
      });

      alertsSent++;
      console.log(`Alert email sent for ${loc.cityName}.`);
    } catch (error) {
      locationsFailed++;
      console.error(
        `Failed to process ${loc.cityName || docSnap.id}:`,
        error.message
      );
    }
  }

  console.log("Weather check completed.", {
    locationsFound: snapshot.size,
    locationsChecked,
    locationsFailed,
    alertsSent,
  });
}

main().catch((error) => {
  console.error("Weather worker failed:", error.message);
  process.exitCode = 1;
});