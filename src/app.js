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

function emptyLeague() {
  const id = qs.get("league") || uid();
  return {
    id,
    name: "Weekend Pair Cricket League",
    adminPin: "1234",
    oversPerInnings: 18,
    wicketPenaltyMale: 5,
    wicketPenaltyFemale: 2,
    teams: [
      makeTeam("Falcons"),
      makeTeam("Titans"),
      makeTeam("Strikers"),
      makeTeam("Royals")
    ],
    matches: [],
    updatedAt: Date.now()
  };
}

function makeTeam(name) {
  return { id: uid(), name, players: [], pairs: [] };
}

function makeMatch(homeId, awayId, label) {
  return {
    id: uid(),
    label,
    homeId,
    awayId,
    status: "scheduled",
    tossWinnerId: "",
    innings: []
  };
}

function normalizeLeague(value) {
  const fallback = emptyLeague();
  const league = value && typeof value === "object" ? value : {};
  const teams = Array.isArray(league.teams) ? league.teams : fallback.teams;
  const matches = Array.isArray(league.matches) ? league.matches : [];
  return {
    ...fallback,
    ...league,
    teams: teams.map((team, index) => ({
      id: team.id || fallback.teams[index]?.id || uid(),
      name: team.name || fallback.teams[index]?.name || `Team ${index + 1}`,
      players: Array.isArray(team.players) ? team.players : [],
      pairs: Array.isArray(team.pairs) ? team.pairs : []
    })),
    matches: matches.map((match) => ({
      id: match.id || uid(),
      label: match.label || "Match",
      homeId: match.homeId || "",
      awayId: match.awayId || "",
      status: match.status || "scheduled",
      tossWinnerId: match.tossWinnerId || "",
      innings: Array.isArray(match.innings) ? match.innings.map((innings) => ({
        ...innings,
        pairSlots: Array.isArray(innings.pairSlots) ? innings.pairSlots : [],
        bowlersByOver: Array.isArray(innings.bowlersByOver) ? innings.bowlersByOver : [],
        goldenStrikers: Array.isArray(innings.goldenStrikers) ? innings.goldenStrikers : [],
        balls: Array.isArray(innings.balls) ? innings.balls : []
      })) : []
    }))
  };
}

async function initBackend() {
  if (!hasFirebaseConfig) {
    state.backend = localBackend();
    return;
  }

  const [{ initializeApp }, { getDatabase, ref, set, onValue }] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js")
  ]);
  const app = initializeApp(firebaseConfig);
  const db = getDatabase(app);
  const leagueId = qs.get("league") || localStorage.getItem("pair-cricket-league-id") || uid();
  localStorage.setItem("pair-cricket-league-id", leagueId);
  state.backend = firebaseBackend(db, ref, set, onValue, leagueId);
}

function localBackend() {
  return {
    mode: "Demo",
    async load() {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeLeague(JSON.parse(saved)) : emptyLeague();
    },
    async save(league) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(league));
    },
    subscribe(callback) {
      const onStorage = (event) => {
        if (event.key === STORAGE_KEY && event.newValue) callback(normalizeLeague(JSON.parse(event.newValue)));
      };
      addEventListener("storage", onStorage);
      return () => removeEventListener("storage", onStorage);
    }
  };
}

function firebaseBackend(db, ref, set, onValue, leagueId) {
  const leagueRef = ref(db, `leagues/${leagueId}`);
  return {
    mode: "Live",
    async load() {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Firebase did not respond. Check Realtime Database rules and database URL."));
        }, 9000);
        const stop = onValue(leagueRef, (snapshot) => {
          clearTimeout(timeout);
          stop();
          resolve(normalizeLeague(snapshot.val() || { ...emptyLeague(), id: leagueId }));
        }, (error) => {
          clearTimeout(timeout);
          stop();
          reject(error);
        });
      });
    },
    async save(league) {
      await set(leagueRef, league);
    },
    subscribe(callback) {
      return onValue(leagueRef, (snapshot) => {
        if (snapshot.exists()) callback(normalizeLeague(snapshot.val()));
      }, (error) => {
        console.error("Firebase subscription failed", error);
        toast(`Firebase error: ${error.message}`);
      });
    }
  };
}

async function save(mutator) {
  const next = structuredClone(state.league);
  mutator(next);
  next.updatedAt = Date.now();
  state.league = next;
  render();
  try {
    await state.backend.save(next);
  } catch (error) {
    console.error("Save failed", error);
    toast(`Save failed: ${error.message}`);
  }
}

function toast(message) {
  state.toast = message;
  render();
  setTimeout(() => {
    state.toast = "";
    render();
  }, 2400);
}

function setRoute(route, matchId = state.matchId) {
  state.route = route;
  state.matchId = matchId || "";
  const params = new URLSearchParams();
  params.set("view", route);
  if (matchId) params.set("match", matchId);
  if (state.league?.id) params.set("league", state.league.id);
  history.replaceState(null, "", `${location.pathname}?${params}`);
  render();
}

function login(pin) {
  if (pin === state.league.adminPin) {
    state.admin = true;
    localStorage.setItem(ADMIN_KEY, "true");
    toast("Admin scoring unlocked");
  } else {
    toast("Wrong admin PIN");
  }
}

function logout() {
  state.admin = false;
  localStorage.removeItem(ADMIN_KEY);
  render();
}

function createSchedule(league) {
  if (league.teams.length !== 4) return;
  const [a, b, c, d] = league.teams;
  league.matches = [
    makeMatch(a.id, b.id, "Match 1"),
    makeMatch(c.id, d.id, "Match 2"),
    makeMatch(a.id, c.id, "Match 3"),
    makeMatch(b.id, d.id, "Match 4"),
    makeMatch(a.id, d.id, "Match 5"),
    makeMatch(b.id, c.id, "Match 6"),
    makeMatch("", "", "Final")
  ];
}

function currentInnings(match) {
  return match.innings[match.innings.length - 1];
}

function inningsScore(innings) {
  if (!innings) return { runs: 0, wickets: 0, balls: 0, rawRuns: 0, penalties: 0 };
  return innings.balls.reduce((acc, ball) => {
    acc.runs += ball.runs;
    acc.rawRuns += (ball.extraBase || 0) + (ball.scoringRuns ?? ball.rawRuns);
    acc.penalties += ball.penalty;
    acc.wickets += ball.wicket ? 1 : 0;
    acc.balls += ball.legal === false ? 0 : 1;
    return acc;
  }, { runs: 0, wickets: 0, balls: 0, rawRuns: 0, penalties: 0 });
}

function legalOverIndex(innings) {
  return Math.floor(legalBallCount(innings) / 6);
}

function pairForOver(team, overIndex, innings) {
  const pairIndex = pairBlockIndex(overIndex);
  return innings?.pairSlots?.[pairIndex] || null;
}

function strikerIdForBall(innings, team, ballInOver) {
  const overIndex = legalOverIndex(innings);
  const pair = pairForOver(team, overIndex, innings);
  if (!pair) return "";
  const overInPair = overIndex % 3;
  if (overInPair === 0) return pair.playerAId;
  if (overInPair === 1) return pair.playerBId;
  return goldenStrikerId(innings, pair, overIndex);
}

function otherBatterId(pair, strikerId) {
  return strikerId === pair.playerAId ? pair.playerBId : pair.playerAId;
}

function goldenStrikerId(innings, pair, overIndex) {
  const block = pairBlockIndex(overIndex);
  let strikerId = innings?.goldenStrikers?.[block] || pair.playerAId;
  for (const ball of innings?.balls || []) {
    if (ball.overIndex === overIndex && ball.causesStrikeChange) {
      strikerId = otherBatterId(pair, strikerId);
    }
  }
  return strikerId;
}

function adjustedRuns(rawRuns, isGolden) {
  if (!isGolden) return rawRuns;
  if (rawRuns === 4) return 6;
  if (rawRuns === 6) return 8;
  return rawRuns * 2;
}

function bowlerIdForOver(innings, overIndex) {
  return innings?.bowlersByOver?.[overIndex] || "";
}

function canStartMatch(match) {
  return match.homeId && match.awayId && match.status === "scheduled";
}

function startMatch(matchId) {
  save((league) => {
    const match = byId(league.matches, matchId);
    match.status = "live";
    match.innings = [];
  });
}

function startInnings(matchId, battingTeamId) {
  save((league) => {
    const match = byId(league.matches, matchId);
    const bowlingTeamId = match.homeId === battingTeamId ? match.awayId : match.homeId;
    match.status = "live";
    match.innings.push({
      id: uid(),
      battingTeamId,
      bowlingTeamId,
      pairSlots: [],
      bowlersByOver: [],
      goldenStrikers: [],
      balls: [],
      startedAt: Date.now()
    });
  });
}

function endInnings(matchId) {
  save((league) => {
    const match = byId(league.matches, matchId);
    if (match.innings.length >= 2) {
      match.status = "completed";
      return;
    }
    const first = match.innings[0];
    const nextBatting = first.bowlingTeamId;
    match.innings.push({
      id: uid(),
      battingTeamId: nextBatting,
      bowlingTeamId: first.battingTeamId,
      pairSlots: [],
      bowlersByOver: [],
      goldenStrikers: [],
      balls: [],
      startedAt: Date.now()
    });
  });
}

function addBall(matchId, rawRuns, wicket, options = {}) {
  save((league) => {
    const match = byId(league.matches, matchId);
    const innings = currentInnings(match);
    const battingTeam = byId(league.teams, innings.battingTeamId);
    const ballInOver = legalBallCount(innings) % 6;
    const overIndex = legalOverIndex(innings);
    const pair = pairForOver(battingTeam, overIndex, innings);
    const strikerId = strikerIdForBall(innings, battingTeam, ballInOver);
    const striker = byId(battingTeam.players, strikerId);
    const isGolden = overIndex % 3 === 2;
    const scoringRuns = adjustedRuns(rawRuns, isGolden);
    const extraBase = options.extraType ? adjustedRuns(1, isGolden) : 0;
    const causesStrikeChange = isGolden && rawRuns % 2 === 1;
    const penalty = wicket ? (striker?.gender === "female" ? league.wicketPenaltyFemale : league.wicketPenaltyMale) : 0;
    innings.balls.push({
      id: uid(),
      rawRuns,
      runs: extraBase + scoringRuns - penalty,
      scoringRuns,
      extraBase,
      extraType: options.extraType || "",
      penalty,
      wicket,
      causesStrikeChange,
      legal: options.legal !== false,
      strikerId,
      bowlerId: bowlerIdForOver(innings, overIndex),
      pairId: pair?.id || "",
      isGolden,
      overIndex,
      at: Date.now()
    });
  });
}

function undoBall(matchId) {
  save((league) => {
    const match = byId(league.matches, matchId);
    currentInnings(match)?.balls.pop();
  });
}

function standings(league) {
  const rows = league.teams.map((team) => ({
    team,
    played: 0,
    won: 0,
    lost: 0,
    tied: 0,
    for: 0,
    against: 0,
    points: 0
  }));
  const get = (teamId) => rows.find((row) => row.team.id === teamId);
  league.matches.filter((match) => match.status === "completed" && match.innings.length === 2).forEach((match) => {
    const [i1, i2] = match.innings;
    const s1 = inningsScore(i1).runs;
    const s2 = inningsScore(i2).runs;
    const r1 = get(i1.battingTeamId);
    const r2 = get(i2.battingTeamId);
    r1.played += 1;
    r2.played += 1;
    r1.for += s1;
    r1.against += s2;
    r2.for += s2;
    r2.against += s1;
    if (s1 === s2) {
      r1.tied += 1;
      r2.tied += 1;
      r1.points += 1;
      r2.points += 1;
    } else {
      const winner = s1 > s2 ? r1 : r2;
      const loser = s1 > s2 ? r2 : r1;
      winner.won += 1;
      winner.points += 2;
      loser.lost += 1;
    }
  });
  return rows.sort((a, b) => b.points - a.points || ((b.for - b.against) - (a.for - a.against)) || b.for - a.for);
}

function html(strings, ...values) {
  return strings.reduce((out, str, i) => out + str + (values[i] ?? ""), "");
}

function topbar() {
  return html`
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">PC</div>
        <div>
          <h1 class="brand-title">${state.league.name}</h1>
          <p class="brand-subtitle">${state.backend.mode} scoring · ${state.league.oversPerInnings} overs</p>
        </div>
      </div>
      <div class="top-actions">
        <button class="btn ghost small" data-route="viewer">Viewer</button>
        <button class="btn ghost small" data-route="admin">Admin</button>
        ${state.admin ? `<button class="btn danger small" data-action="logout">Lock</button>` : ""}
      </div>
    </header>
  `;
}

function render() {
  if (!state.league) return;
  const content = state.route === "viewer" ? viewerPage() : adminPage();
  $app.innerHTML = `${topbar()}${content}${state.toast ? `<div class="toast">${state.toast}</div>` : ""}`;
}

function adminPage() {
  if (!state.admin) return loginPage();
  return html`
    <main class="container">
      ${hero()}
      <section class="grid grid-2">
        ${settingsPanel()}
        ${schedulePanel()}
      </section>
      <section class="section">
        <h2 class="section-title">Teams</h2>
        <div class="grid grid-2">${state.league.teams.map(teamPanel).join("")}</div>
      </section>
      <section class="section">${matchWorkspace()}</section>
    </main>
  `;
}

function loginPage() {
  return html`
    <main class="container">
      ${hero()}
      <section class="panel panel-pad">
        <h2 class="panel-title">Admin Access</h2>
        <p class="panel-note">Viewers can open match links without this PIN.</p>
        <form class="grid" data-form="login">
          <label class="field">
            <span>PIN</span>
            <input class="input" name="pin" inputmode="numeric" autocomplete="off" />
          </label>
          <button class="btn primary" type="submit">Unlock Scoring</button>
        </form>
      </section>
    </main>
  `;
}

function hero() {
  return html`
    <section class="hero">
      <div class="score-hero">
        <div class="score-hero-inner">
          <p class="eyebrow">Pair format cricket</p>
          <h1>Score every over, even after the chase.</h1>
          <p class="hero-copy">Built for round-robin leagues, compulsory pair balance, golden overs, negative wickets, and final-table run difference.</p>
        </div>
      </div>
      <div class="panel panel-pad">
        <h2 class="panel-title">Live Links</h2>
        <p class="panel-note">Share a match URL with viewers. In demo mode updates stay on this device; with Firebase config they refresh from the shared database.</p>
        <div class="card-list section">
          ${state.league.matches.slice(0, 7).map((match) => {
            const url = `${location.origin}${location.pathname}?view=viewer&league=${state.league.id}&match=${match.id}`;
            return `<div class="score-row"><span class="meta">${match.label}: ${matchName(match)}</span><button class="btn small" data-copy="${url}">Copy</button></div>`;
          }).join("") || `<div class="empty">Generate fixtures after teams are named.</div>`}
        </div>
      </div>
    </section>
  `;
}

function settingsPanel() {
  return html`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">League Setup</h2>
          <p class="panel-note">Four teams, six round-robin matches, then a final.</p>
        </div>
      </div>
      <form class="grid panel-pad" data-form="settings">
        <label class="field"><span>League name</span><input class="input" name="name" value="${state.league.name}" /></label>
        <div class="grid grid-3">
          <label class="field"><span>Overs</span><input class="input" name="overs" type="number" min="3" step="3" value="${state.league.oversPerInnings}" /></label>
          <label class="field"><span>Male wicket</span><input class="input" name="malePenalty" type="number" value="${state.league.wicketPenaltyMale}" /></label>
          <label class="field"><span>Female wicket</span><input class="input" name="femalePenalty" type="number" value="${state.league.wicketPenaltyFemale}" /></label>
        </div>
        <label class="field"><span>Admin PIN</span><input class="input" name="pin" value="${state.league.adminPin}" /></label>
        <button class="btn primary" type="submit">Save League</button>
      </form>
    </section>
  `;
}

function schedulePanel() {
  return html`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">Fixtures</h2>
          <p class="panel-note">Final teams can be assigned after league matches.</p>
        </div>
        <button class="btn small" data-action="schedule">Generate</button>
      </div>
      <div class="card-list panel-pad">
        ${state.league.matches.map(matchCard).join("") || `<div class="empty">No fixtures yet.</div>`}
      </div>
    </section>
  `;
}

function matchCard(match) {
  return html`
    <article class="match-card">
      <div class="match-title">
        <span class="match-name">${match.label}</span>
        <span class="pill ${match.status === "live" ? "live" : ""}">${match.status}</span>
      </div>
      <div class="grid grid-2">
        <label class="field"><span>Team A</span>${teamSelect(`match-home-${match.id}`, match.homeId)}</label>
        <label class="field"><span>Team B</span>${teamSelect(`match-away-${match.id}`, match.awayId)}</label>
      </div>
      <div class="toolbar">
        <button class="btn small primary" data-action="open-match" data-id="${match.id}">Score</button>
        <button class="btn small" data-action="start-match" data-id="${match.id}" ${canStartMatch(match) ? "" : "disabled"}>Start</button>
      </div>
    </article>
  `;
}

function teamPanel(team) {
  const pairCheck = validatePairs(team);
  return html`
    <article class="team-card">
      <div class="team-title">
        <input class="input team-name-input" data-team-name="${team.id}" value="${team.name}" />
        <span class="pill">${team.players.length} players</span>
      </div>
      <div class="toolbar">
        <button class="btn small" data-action="add-player" data-team="${team.id}">Add Player</button>
        <button class="btn small" data-action="auto-pair" data-team="${team.id}">Auto Pair</button>
      </div>
      <div class="card-list">
        ${team.players.map((player) => playerRow(team, player)).join("") || `<div class="empty">Add players before pairing.</div>`}
      </div>
      <div class="card-list">
        <div class="meta">${pairCheck}</div>
        ${team.pairs.map((pair) => pairRow(team, pair)).join("")}
      </div>
    </article>
  `;
}

function playerRow(team, player) {
  return html`
    <div class="player-row">
      <label class="field"><span>Player</span><input class="input" data-player-name="${team.id}:${player.id}" value="${player.name}" /></label>
      <label class="field"><span>Gender</span>
        <select class="select" data-player-gender="${team.id}:${player.id}">
          <option value="male" ${player.gender === "male" ? "selected" : ""}>Male</option>
          <option value="female" ${player.gender === "female" ? "selected" : ""}>Female</option>
        </select>
      </label>
      <button class="btn small danger" data-action="remove-player" data-team="${team.id}" data-player="${player.id}">Remove</button>
    </div>
  `;
}

function pairRow(team, pair) {
  return html`
    <div class="pair-row">
      <label class="field"><span>Over 1</span>${playerSelect(team, `pair-a-${team.id}-${pair.id}`, pair.playerAId)}</label>
      <label class="field"><span>Over 2</span>${playerSelect(team, `pair-b-${team.id}-${pair.id}`, pair.playerBId)}</label>
      <span class="pill ${pairIsWomen(team, pair) ? "live" : pairIsMixed(team, pair) ? "gold" : ""}">${pairLabel(team, pair)}</span>
    </div>
  `;
}

function teamSelect(name, selected) {
  return `<select class="select" name="${name}"><option value="">TBD</option>${state.league.teams.map((team) => `<option value="${team.id}" ${team.id === selected ? "selected" : ""}>${team.name}</option>`).join("")}</select>`;
}

function playerSelect(team, name, selected) {
  return `<select class="select" name="${name}">${team.players.map((player) => `<option value="${player.id}" ${player.id === selected ? "selected" : ""}>${player.name || "Player"} (${genders[player.gender]})</option>`).join("")}</select>`;
}

function pairIsWomen(team, pair) {
  return [byId(team.players, pair.playerAId), byId(team.players, pair.playerBId)].every((p) => p?.gender === "female");
}

function pairIsMixed(team, pair) {
  const players = [byId(team.players, pair.playerAId), byId(team.players, pair.playerBId)];
  return players.some((p) => p?.gender === "female") && players.some((p) => p?.gender === "male");
}

function pairLabel(team, pair) {
  if (pairIsWomen(team, pair)) return "Women pair";
  if (pairIsMixed(team, pair)) return "Mixed pair";
  return "Open pair";
}

function validatePairs(team) {
  if (!team.pairs.length) return "No pairs yet.";
  const hasWomen = team.pairs.some((pair) => pairIsWomen(team, pair));
  const hasMixed = team.pairs.some((pair) => pairIsMixed(team, pair));
  if (hasWomen && hasMixed) return "Pair rule satisfied.";
  if (!hasWomen && !hasMixed) return "Needs one women pair and one mixed pair.";
  return hasWomen ? "Needs one mixed pair." : "Needs one women pair.";
}

function matchWorkspace() {
  const match = byId(state.league.matches, state.matchId) || state.league.matches.find((m) => m.status === "live") || state.league.matches[0];
  if (!match) return "";
  return html`
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2 class="panel-title">${match.label}: ${matchName(match)}</h2>
          <p class="panel-note">${match.status}</p>
        </div>
        <button class="btn small" data-route="viewer" data-match="${match.id}">Public Board</button>
      </div>
      <div class="panel-pad">${scoreMatch(match, true)}</div>
    </section>
  `;
}

function viewerPage() {
  const match = byId(state.league.matches, state.matchId) || state.league.matches[0];
  return html`
    <main class="container">
      <section class="panel panel-pad">
        <div class="toolbar">
          ${state.league.matches.map((m) => `<button class="btn small ${m.id === match?.id ? "primary" : ""}" data-route="viewer" data-match="${m.id}">${m.label}</button>`).join("")}
        </div>
      </section>
      <section class="section">
        ${match ? scoreMatch(match, false) : `<div class="empty">No match selected.</div>`}
      </section>
      <section class="section panel panel-pad">
        <h2 class="panel-title">Standings</h2>
        ${standingsTable()}
      </section>
    </main>
  `;
}

function scoreMatch(match, adminMode) {
  const innings = currentInnings(match);
  const first = match.innings[0];
  const second = match.innings[1];
  const score = inningsScore(innings);
  const battingTeam = innings ? byId(state.league.teams, innings.battingTeamId) : null;
  const bowlingTeam = innings ? byId(state.league.teams, innings.bowlingTeamId) : null;
  const overIndex = innings ? legalOverIndex(innings) : 0;
  const pair = battingTeam ? pairForOver(battingTeam, overIndex, innings) : null;
  const isCompleteQuota = innings && score.balls >= state.league.oversPerInnings * 6;
  return html`
    <div class="innings-grid">
      <div class="scoreboard">
        <div class="panel panel-pad">
          <div class="score-main">
            <div>
              <p class="eyebrow" style="color: var(--muted)">${matchName(match)}</p>
              <div class="big-score">${score.runs < 0 ? `<span class="score-sign">-</span>${Math.abs(score.runs)}` : score.runs}<span class="meta"> / ${score.wickets}</span></div>
              <div class="meta">${battingTeam?.name || "Batting"} vs ${bowlingTeam?.name || "Bowling"} · ${oversText(score.balls)} overs</div>
            </div>
            <div class="over-box">
              <span class="meta">Over</span>
              <strong>${Math.min(overIndex + 1, state.league.oversPerInnings)}</strong>
              <span class="pill ${overIndex % 3 === 2 ? "gold" : ""}">${overIndex % 3 === 2 ? "Golden" : "Normal"}</span>
            </div>
          </div>
        </div>
        ${adminMode ? scorerControls(match, innings, battingTeam, bowlingTeam, pair, isCompleteQuota) : recentBalls(innings)}
      </div>
      <div class="panel panel-pad">
        <h3 class="panel-title">Scorecard</h3>
        ${inningsScorecard(first, "1st Innings")}
        ${inningsScorecard(second, "2nd Innings")}
        ${matchResult(match)}
      </div>
    </div>
  `;
}

function scorerControls(match, innings, battingTeam, bowlingTeam, pair, isCompleteQuota) {
  if (match.status === "scheduled") return `<button class="btn primary" data-action="start-match" data-id="${match.id}">Start Match</button>`;
  if (!innings) {
    return html`
      <div class="panel panel-pad">
        <h3 class="panel-title">Choose Batting Team</h3>
        <div class="toolbar section">
          <button class="btn primary" data-action="start-innings" data-match="${match.id}" data-team="${match.homeId}">${byId(state.league.teams, match.homeId)?.name}</button>
          <button class="btn primary" data-action="start-innings" data-match="${match.id}" data-team="${match.awayId}">${byId(state.league.teams, match.awayId)?.name}</button>
        </div>
      </div>
    `;
  }
  if (match.status === "completed") return recentBalls(innings);
  const overIndex = legalOverIndex(innings);
  const striker = byId(battingTeam.players, strikerIdForBall(innings, battingTeam, legalBallCount(innings) % 6));
  const bowler = byId(bowlingTeam.players, bowlerIdForOver(innings, overIndex));
  if (!pair) return `${pairSelectionPanel(match, innings, battingTeam, overIndex)}${recentBalls(innings)}`;
  if (overIndex % 3 === 2 && !innings.goldenStrikers?.[pairBlockIndex(overIndex)]) {
    return `${goldenStrikerPanel(match, innings, battingTeam, pair, overIndex)}${recentBalls(innings)}`;
  }
  if (!bowler) return `${bowlerSelectionPanel(match, innings, bowlingTeam, overIndex)}${recentBalls(innings)}`;
  const blocked = !pair || isCompleteQuota;
  const extraRuns = [0, 1, 2, 3, 4, 6];
  return html`
    <div class="panel panel-pad">
      <div class="score-row">
        <div>
          <h3 class="panel-title">${striker?.name || "No pair selected"}</h3>
          <p class="panel-note">${pairLabel(battingTeam, pair)} · Bowler: ${bowler.name}</p>
        </div>
        <button class="btn small" data-action="undo" data-id="${match.id}" ${innings.balls.length ? "" : "disabled"}>Undo</button>
      </div>
      <div class="controls section">
        ${[0, 1, 2, 3, 4, 6].map((run) => `<button class="run-btn ${run >= 4 ? "boundary" : ""}" data-action="ball" data-id="${match.id}" data-run="${run}" ${blocked ? "disabled" : ""}>${run}</button>`).join("")}
        <button class="run-btn wicket" data-action="wicket" data-id="${match.id}" ${blocked ? "disabled" : ""}>W</button>
        <button class="run-btn gold" data-action="end-innings" data-id="${match.id}" ${isCompleteQuota ? "" : "disabled"}>${match.innings.length >= 2 ? "Finish" : "Next"}</button>
      </div>
      <p class="panel-note section">Wide and no-ball do not count as legal balls. The number is runs taken in addition to the one-run extra; in golden overs the extra and added runs use golden scoring.</p>
      <div class="extra-controls section">
        ${extraRuns.map((run) => `<button class="extra-btn" data-action="extra" data-extra="wide" data-id="${match.id}" data-run="${run}" ${blocked ? "disabled" : ""}>Wd +${run}</button>`).join("")}
        ${extraRuns.map((run) => `<button class="extra-btn" data-action="extra" data-extra="noball" data-id="${match.id}" data-run="${run}" ${blocked ? "disabled" : ""}>Nb +${run}</button>`).join("")}
      </div>
    </div>
    ${recentBalls(innings)}
  `;
}

function pairSelectionPanel(match, innings, battingTeam, overIndex) {
  if (!battingTeam.players.length) {
    return `<div class="panel panel-pad"><h3 class="panel-title">Select Batting Pair</h3><p class="panel-note">Add players to ${battingTeam.name} before scoring this block.</p></div>`;
  }
  const block = pairBlockIndex(overIndex);
  return html`
    <form class="panel panel-pad" data-form="innings-pair">
      <input type="hidden" name="matchId" value="${match.id}" />
      <input type="hidden" name="inningsId" value="${innings.id}" />
      <input type="hidden" name="block" value="${block}" />
      <h3 class="panel-title">Select Pair ${block + 1}</h3>
      <p class="panel-note">This pair will bat overs ${block * 3 + 1}, ${block * 3 + 2}, and golden over ${block * 3 + 3}.</p>
      <div class="grid grid-2 section">
        <label class="field"><span>First over batter</span>${playerSelect(battingTeam, "playerAId", battingTeam.players[0]?.id || "")}</label>
        <label class="field"><span>Second over batter</span>${playerSelect(battingTeam, "playerBId", battingTeam.players[1]?.id || battingTeam.players[0]?.id || "")}</label>
      </div>
      <button class="btn primary section" type="submit">Start Pair Block</button>
    </form>
  `;
}

function bowlerSelectionPanel(match, innings, bowlingTeam, overIndex) {
  if (!bowlingTeam.players.length) {
    return `<div class="panel panel-pad"><h3 class="panel-title">Select Bowler</h3><p class="panel-note">Add players to ${bowlingTeam.name} before starting this over.</p></div>`;
  }
  return html`
    <form class="panel panel-pad" data-form="over-bowler">
      <input type="hidden" name="matchId" value="${match.id}" />
      <input type="hidden" name="inningsId" value="${innings.id}" />
      <input type="hidden" name="overIndex" value="${overIndex}" />
      <h3 class="panel-title">Select Bowler</h3>
      <p class="panel-note">Choose the bowler for over ${overIndex + 1} before scoring balls.</p>
      <label class="field section"><span>Bowler</span>${playerSelect(bowlingTeam, "bowlerId", bowlingTeam.players[0]?.id || "")}</label>
      <button class="btn primary section" type="submit">Start Over</button>
    </form>
  `;
}

function goldenStrikerPanel(match, innings, battingTeam, pair, overIndex) {
  const block = pairBlockIndex(overIndex);
  const playerA = byId(battingTeam.players, pair.playerAId);
  const playerB = byId(battingTeam.players, pair.playerBId);
  return html`
    <form class="panel panel-pad" data-form="golden-striker">
      <input type="hidden" name="matchId" value="${match.id}" />
      <input type="hidden" name="inningsId" value="${innings.id}" />
      <input type="hidden" name="block" value="${block}" />
      <h3 class="panel-title">Golden Over Striker</h3>
      <p class="panel-note">Choose who takes strike for over ${overIndex + 1}. After this, odd runs and odd wide/no-ball taken runs will rotate strike.</p>
      <label class="field section">
        <span>On strike</span>
        <select class="select" name="strikerId">
          <option value="${pair.playerAId}">${playerA?.name || "First batter"}</option>
          <option value="${pair.playerBId}">${playerB?.name || "Second batter"}</option>
        </select>
      </label>
      <button class="btn primary section" type="submit">Set Golden Striker</button>
    </form>
  `;
}

function recentBalls(innings) {
  if (!innings?.balls.length) return `<div class="empty">No balls recorded.</div>`;
  const team = byId(state.league.teams, innings.battingTeamId);
  return html`
    <div class="panel panel-pad">
      <h3 class="panel-title">Recent Balls</h3>
      <div class="card-list section">
        ${innings.balls.slice(-12).reverse().map((ball) => {
          const player = byId(team.players, ball.strikerId);
          const eventLabel = ball.extraType ? `${ball.extraType === "wide" ? "Wd" : "Nb"} +${ball.rawRuns}` : (ball.wicket ? "Wicket" : "Ball");
          return `<div class="score-row"><span>${player?.name || "Player"} <span class="meta">${eventLabel} · ${ball.legal === false ? "extra" : ball.isGolden ? "Golden" : `Over ${ball.overIndex + 1}`}</span></span><strong>${ball.runs >= 0 ? "+" : ""}${ball.runs}${ball.wicket ? " W" : ""}</strong></div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function battingStats(innings) {
  if (!innings) return [];
  const team = byId(state.league.teams, innings.battingTeamId);
  const rows = (team?.players || []).map((player) => ({
    player,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    wickets: 0
  }));
  const get = (playerId) => rows.find((row) => row.player.id === playerId);
  innings.balls.forEach((ball) => {
    const row = get(ball.strikerId);
    if (!row) return;
    if (ball.legal !== false) row.balls += 1;
    if (ball.extraType !== "wide") row.runs += ball.scoringRuns - ball.penalty;
    if (ball.rawRuns === 4) row.fours += 1;
    if (ball.rawRuns === 6) row.sixes += 1;
    if (ball.wicket) row.wickets += 1;
  });
  return rows.filter((row) => row.balls || row.runs || row.wickets);
}

function bowlingStats(innings) {
  if (!innings) return [];
  const team = byId(state.league.teams, innings.bowlingTeamId);
  const rows = (team?.players || []).map((player) => ({
    player,
    balls: 0,
    runs: 0,
    wickets: 0
  }));
  const get = (playerId) => rows.find((row) => row.player.id === playerId);
  innings.balls.forEach((ball) => {
    const row = get(ball.bowlerId);
    if (!row) return;
    if (ball.legal !== false) row.balls += 1;
    row.runs += ball.extraBase + ball.scoringRuns;
    if (ball.wicket) row.wickets += 1;
  });
  return rows.filter((row) => row.balls || row.runs || row.wickets);
}

function inningsScorecard(innings, label) {
  if (!innings) return `<div class="empty section">${label} pending.</div>`;
  const score = inningsScore(innings);
  const team = byId(state.league.teams, innings.battingTeamId);
  return html`
    <div class="score-row section">
      <div>
        <strong>${label}: ${team?.name}</strong>
        <div class="meta">Gross ${score.rawRuns}, penalties -${score.penalties}, wickets ${score.wickets}</div>
      </div>
      <strong>${score.runs}</strong>
    </div>
    <div class="stat-grid">
      <div>
        <div class="mini-title">Batting</div>
        ${battingStats(innings).map((row) => `
          <div class="stat-row">
            <span>${row.player.name}</span>
            <strong>${row.runs} <small>(${row.balls})</small></strong>
          </div>
        `).join("") || `<div class="meta">No batting stats yet.</div>`}
      </div>
      <div>
        <div class="mini-title">Bowling</div>
        ${bowlingStats(innings).map((row) => `
          <div class="stat-row">
            <span>${row.player.name}</span>
            <strong>${row.runs}/${row.wickets} <small>${oversText(row.balls)}</small></strong>
          </div>
        `).join("") || `<div class="meta">No bowling stats yet.</div>`}
      </div>
    </div>
  `;
}

function matchResult(match) {
  if (match.status !== "completed" || match.innings.length < 2) return "";
  const [i1, i2] = match.innings;
  const s1 = inningsScore(i1).runs;
  const s2 = inningsScore(i2).runs;
  if (s1 === s2) return `<div class="pill section">Tie</div>`;
  const winner = byId(state.league.teams, s1 > s2 ? i1.battingTeamId : i2.battingTeamId);
  return `<div class="pill live section">${winner?.name} won by ${Math.abs(s1 - s2)} runs</div>`;
}

function standingsTable() {
  return html`
    <table class="standings">
      <thead><tr><th>Team</th><th>P</th><th>W</th><th>Pts</th><th>Diff</th></tr></thead>
      <tbody>
        ${standings(state.league).map((row) => `<tr><td>${row.team.name}</td><td>${row.played}</td><td>${row.won}</td><td>${row.points}</td><td>${row.for - row.against}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function matchName(match) {
  const home = byId(state.league.teams, match.homeId)?.name || "TBD";
  const away = byId(state.league.teams, match.awayId)?.name || "TBD";
  return `${home} v ${away}`;
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const el = event.target.closest("button");
    if (!el) return;
    const action = el.dataset.action;
    if (el.dataset.route) setRoute(el.dataset.route, el.dataset.match);
    if (el.dataset.copy) {
      await navigator.clipboard.writeText(el.dataset.copy);
      toast("Match link copied");
    }
    if (action === "logout") logout();
    if (action === "schedule") save(createSchedule);
    if (action === "open-match") setRoute("admin", el.dataset.id);
    if (action === "start-match") startMatch(el.dataset.id);
    if (action === "add-player") addPlayer(el.dataset.team);
    if (action === "remove-player") removePlayer(el.dataset.team, el.dataset.player);
    if (action === "auto-pair") autoPair(el.dataset.team);
    if (action === "start-innings") startInnings(el.dataset.match, el.dataset.team);
    if (action === "ball") addBall(el.dataset.id, Number(el.dataset.run), false);
    if (action === "extra") addBall(el.dataset.id, Number(el.dataset.run), false, { legal: false, extraType: el.dataset.extra });
    if (action === "wicket") addBall(el.dataset.id, 0, true);
    if (action === "undo") undoBall(el.dataset.id);
    if (action === "end-innings") endInnings(el.dataset.id);
  });

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.dataset.form === "login") login(new FormData(form).get("pin"));
    if (form.dataset.form === "settings") {
      const data = new FormData(form);
      save((league) => {
        league.name = data.get("name").trim() || league.name;
        league.oversPerInnings = Number(data.get("overs")) || 18;
        league.wicketPenaltyMale = Number(data.get("malePenalty")) || 5;
        league.wicketPenaltyFemale = Number(data.get("femalePenalty")) || 2;
        league.adminPin = data.get("pin").trim() || "1234";
      });
    }
    if (form.dataset.form === "innings-pair") {
      const data = new FormData(form);
      save((league) => {
        const match = byId(league.matches, data.get("matchId"));
        const innings = byId(match.innings, data.get("inningsId"));
        const block = Number(data.get("block"));
        innings.pairSlots ||= [];
        innings.pairSlots[block] = {
          id: `slot-${block}`,
          playerAId: data.get("playerAId"),
          playerBId: data.get("playerBId")
        };
      });
    }
    if (form.dataset.form === "over-bowler") {
      const data = new FormData(form);
      save((league) => {
        const match = byId(league.matches, data.get("matchId"));
        const innings = byId(match.innings, data.get("inningsId"));
        const overIndex = Number(data.get("overIndex"));
        innings.bowlersByOver ||= [];
        innings.bowlersByOver[overIndex] = data.get("bowlerId");
      });
    }
    if (form.dataset.form === "golden-striker") {
      const data = new FormData(form);
      save((league) => {
        const match = byId(league.matches, data.get("matchId"));
        const innings = byId(match.innings, data.get("inningsId"));
        const block = Number(data.get("block"));
        innings.goldenStrikers ||= [];
        innings.goldenStrikers[block] = data.get("strikerId");
      });
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target;
    const name = el.name || "";
    if (name.startsWith("match-home-") || name.startsWith("match-away-")) {
      const id = name.replace("match-home-", "").replace("match-away-", "");
      const side = name.startsWith("match-home-") ? "homeId" : "awayId";
      save((league) => { byId(league.matches, id)[side] = el.value; });
    }
    if (name.startsWith("pair-a-") || name.startsWith("pair-b-")) {
      const [, side, teamId, pairId] = name.split("-");
      save((league) => {
        const team = byId(league.teams, teamId);
        const pair = byId(team.pairs, pairId);
        pair[side === "a" ? "playerAId" : "playerBId"] = el.value;
      });
    }
    if (el.dataset.playerGender) {
      const [teamId, playerId] = el.dataset.playerGender.split(":");
      save((league) => { byId(byId(league.teams, teamId).players, playerId).gender = el.value; });
    }
  });

  document.addEventListener("blur", (event) => {
    const el = event.target;
    if (el.dataset.teamName) {
      save((league) => { byId(league.teams, el.dataset.teamName).name = el.value.trim() || "Team"; });
    }
    if (el.dataset.playerName) {
      const [teamId, playerId] = el.dataset.playerName.split(":");
      save((league) => { byId(byId(league.teams, teamId).players, playerId).name = el.value.trim() || "Player"; });
    }
  }, true);
}

function addPlayer(teamId) {
  save((league) => {
    const team = byId(league.teams, teamId);
    team.players.push({ id: uid(), name: `Player ${team.players.length + 1}`, gender: "male" });
  });
}

function removePlayer(teamId, playerId) {
  save((league) => {
    const team = byId(league.teams, teamId);
    team.players = team.players.filter((player) => player.id !== playerId);
    team.pairs = team.pairs.filter((pair) => pair.playerAId !== playerId && pair.playerBId !== playerId);
  });
}

function autoPair(teamId) {
  save((league) => {
    const team = byId(league.teams, teamId);
    const players = [...team.players];
    team.pairs = [];
    for (let i = 0; i < players.length; i += 2) {
      if (players[i + 1]) team.pairs.push({ id: uid(), playerAId: players[i].id, playerBId: players[i + 1].id });
    }
  });
}

async function boot() {
  await initBackend();
  state.league = await state.backend.load();
  if (!state.league.matches.length) createSchedule(state.league);
  await state.backend.save(state.league);
  state.backend.subscribe((league) => {
    state.league = league;
    render();
  });
  bindEvents();
  render();
}

boot().catch((error) => {
  console.error(error);
  $app.innerHTML = `
    <main class="container">
      <div class="panel panel-pad">
        <h1>Could not start app</h1>
        <p>${error.message}</p>
        <p class="panel-note">If this is a Firebase permission error, open Firebase Console > Realtime Database > Rules and allow read/write for your league while testing.</p>
      </div>
    </main>
  `;
});
