console.log("App JS loaded!");
import { firebaseConfig } from "./firebase-config.js";

const STORAGE_KEY = "pair-cricket-league-v1";
const ADMIN_KEY = "pair-cricket-admin-v1";
const qs = new URLSearchParams(location.search);
const state = {
  league: null,
  route: qs.get("view") || "admin",
  matchId: qs.get("match") || "",
  admin: localStorage.getItem(ADMIN_KEY) === "true",
  backend: null,
  toast: ""
};

const $app = document.querySelector("#app");

const uid = () => Math.random().toString(36).slice(2, 9);
const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const byId = (items, id) => items.find((item) => item.id === id);
const genders = { male: "Male", female: "Female" };
const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL);
const legalBallCount = (innings) => (innings?.balls || []).filter((ball) => ball.legal !== false).length;
const pairBlockIndex = (overIndex) => Math.floor(overIndex / 3);

// ...(rest of your app.js code remains unchanged)

// Place the rest of the existing content of app.js here without modification (after this log).
