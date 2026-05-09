# Pair Cricket Scorer

Mobile-first scoring app for a four-team custom cricket league:

- 4 teams, 6 round-robin matches, and a final
- Configurable innings length, usually 15 or 18 overs
- Batting pairs, with every pair allocated 3 overs
- Third over in each pair block is a golden over
- Golden over scoring: 0/1/2/3 are doubled, 4 becomes 6, 6 becomes 8
- Wickets do not end an innings
- Wicket penalty: male -5, female -2 by default
- Wide and no-ball are extra events and do not count as legal balls
- Wide/no-ball scoring is 1 extra plus any runs taken; in golden overs the extra and added runs use golden scoring
- Scorer selects the batting pair for each 3-over block
- Scorer selects the opening striker for each golden over
- Golden over strike rotates on odd legal runs and odd wide/no-ball taken runs
- Scorer selects the bowler before every over
- Public scorecard includes batter and bowler statistics
- Full innings quota is always played, including while chasing
- Standings use points first, then run difference

## Run Locally

Open `index.html` directly in a browser.

Default admin PIN: `1234`

In the default demo mode, data is stored in the browser on the current device. This is useful for testing the scorer.

## Free Live Setup

Use these free services:

1. GitHub Pages for hosting
2. Firebase Realtime Database free Spark plan for shared match data

Create a Firebase web app, enable Realtime Database, then paste the web config into:

```txt
src/firebase-config.js
```

When `apiKey` and `databaseURL` are filled, the app automatically switches from demo mode to live mode. Admins can score from one phone, and viewers can refresh the match URL from their own phones.

## Firebase Database Rules

For a friendly private league, start with the sample in `docs/firebase-rules.json`.

For a public or larger event, add Firebase Auth and make writes admin-only before sharing widely.

## Deploy On GitHub Pages

1. Push this repository to GitHub.
2. Open repository Settings.
3. Go to Pages.
4. Set source to the `main` branch and root folder.
5. Open the Pages URL after GitHub finishes publishing.

## Match Day Flow

1. Open the app as admin.
2. Set teams, players, genders, overs, and penalties.
3. Generate or edit fixtures.
4. Start a match.
5. Choose the first batting team.
6. Select the batting pair for each 3-over block.
7. Select the bowler before each over.
8. Score legal balls, wides, no-balls, and wickets.
9. End innings only after the full over quota is complete.
10. Share the viewer link for the match.
