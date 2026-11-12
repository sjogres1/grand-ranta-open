# 🏸 Grand Räntä Open – badminton doubles tournament app

React + React Three Fiber frontend (Vite, TypeScript) with a tiny Express backend that
saves the tournament to `data/tournament.json`, so a page refresh never loses scores.

## Run locally

```bash
npm install        # first time only
npm run dev        # starts API (port 3001) + web app
```

Open **http://localhost:5173**.

Alternative "production" mode (one server, built frontend): `npm start` → http://localhost:3001

> **New here, want to publish it online or develop it further?** Read **[DEPLOY.md](DEPLOY.md)** –
> the full setup, deployment and development guide.

## Share with a friend (runs on their laptop)

```bash
npm run package
```

Creates **`release/GrandRantaOpen.zip`** (~34 MB). Your friend unzips it and double-clicks
*START HERE (Windows).bat* – Node.js is included, nothing to install. Mac users install
Node.js once and use *START HERE (Mac).command*. Instructions are in the zip's `README.txt`.
The package never contains your tournament data or passwords.

## Share the code with another developer

```bash
npm run package:source
```

Creates **`release/GrandRantaOpen-source.zip`** (~130 KB): all source code and docs, but no tournament
data, no secrets and no `node_modules`. The receiver follows [DEPLOY.md](DEPLOY.md). For ongoing
work together, use GitHub (DEPLOY.md, Part C).

## Online version with admin login

See **[DEPLOY.md](DEPLOY.md)** – free hosting on Cloudflare Workers + D1. The main page becomes an
organizer login; team pages stay public. Credentials are Cloudflare secrets, never in the code.
The local server can also require a login: set `ADMIN_USER` and `ADMIN_PASSWORD` environment variables.

## Flow

1. **Landing** – animated 3D doubles rally (players aged 29–74) and a big *Start tournament* button.
2. **Players** – name, age, optional funny special quality (🎲 suggests one).
   Minimum 12 players, even number. *Fill with demo players* adds 16 test players.
3. **Pair shuffling** – random pairs with rules:
   - at most one player **over 40** per pair
   - pair average age **≥ 35**
   - pair average ages **as close to each other as possible**
   The *Randomness* selector allows the spread to be up to N years worse than the best
   possible, so reshuffles give different pairs. *Strict* = always the closest possible
   (with many rosters there's only one such pairing).
4. **Program** – enter points per game (11–21, default 21), courts, minutes per game, time available
   and start time. Every game is 2v2. Points per game can also be changed any time from the
   "Games to … points" picker at the top of the program; results already entered stay valid.
   - **Round 1**: round robin – everyone plays everyone if time allows, otherwise as many whole
     rotations as fit (every pair still plays the same number of games). Time for a final &
     bronze match is always reserved.
   - **After round 1** you choose (with time estimates vs. your end time):
     - **Play round 2** – same pairs, same rules, same opponents again (sides swapped). If round 1
       was partial, round 2 continues with opponents not met yet.
     - **No round 2** → final (#1 vs #2) and bronze match (#3 vs #4).
   - **After round 2** you choose: **final & bronze match**, or **finish now** with the winner from
     the combined standings.
   - "Out of time? Decide what's next…" lets you decide early; unplayed games of that round are dropped.
   - **Scoring**: win = 1 point, loss = 0. Equal points → better ball difference (balls won − balls
     lost); if still equal, more balls won.
5. **Finals & results** – final + bronze match, podium and final ranking (places 1–4 from the
   final/bronze, the rest from the standings). "Undo" lets you go back and decide again.
   When the champion is decided, a brass winning fanfare plays (synthesized in the browser,
   `src/audio/fanfare.ts`). 🎺 *Fanfare!* replays it.

Scores: winner needs at least the points per game (e.g. 21), no ties, max points + 9 (e.g. 30).

## Team pages (for players' phones)

Every pair has its own live, read-only page at `/<team-name>`, e.g. `/unstoppable-clears`,
protected by a **random team password** (e.g. `lucky-otter-482`) that is created with the pairs.
Only the organizer sees the passwords – on the Pairs page cards and in the **📱 Team pages &
passwords** panel. They are **hidden by default** (the screen may be on a projector): "🔒 Show
password & link" reveals one team for 60 seconds, with "Copy invite" (link + password, ready for
WhatsApp) and "↻ new password" (replaces a leaked one). A phone
asks for the password once and remembers it. The servers never send passwords to team pages:
`/api/tournament` (full data) is organizer-only, and a team page gets data only via
`POST /api/team/<name>` with the right password.

**Score reporting by the teams.** After a game, either team can report the score on its team page
("📝 Report result"). The other team sees "🔔 … reported the score – is this correct?" and taps
**Accept** or **Not correct**. Only an accepted score counts (two identical reports count right away).
The organizer sees reports on the Program page ("⏳ waiting for …", with an **Approve** button) and a
score typed by the organizer always wins. Reports are stored separately from the organizer's data
(`data/tournament-reports.json` locally, `report:<matchId>` rows online), so the organizer app –
which saves its whole state – can never overwrite them; it merges accepted scores in every 5 seconds.

Team page contents:
rank, points, ball difference, **next games (time, court, opponent)**, played games and the
full scoreboard with their row highlighted. It refreshes automatically every 15 seconds – every 5 seconds while a score is waiting for confirmation – and not at all while the page isn't visible.
Links for all teams are in the **📱 Team pages** panel on the Program page.

`localhost` only works on the laptop itself. For phones on the same Wi-Fi:

1. Stop `npm run dev` and run `npm start` (one server on port 3001, reachable on the network).
2. Open the app on the laptop at http://localhost:3001 – the Team pages panel then shows links
   with the laptop's Wi-Fi address, e.g. `http://192.168.1.105:3001/unstoppable-clears`.
3. If Windows asks whether Node.js may communicate on networks, allow **private networks**.

Note: team names (and so the links) change if pairs are reshuffled. An unknown link shows a
list of all teams to pick from.

## Files

- `src/logic/pairing.ts` – pairing rules and the randomized search
- `src/logic/schedule.ts` – round robin (circle method), court/time-slot packing
- `src/logic/standings.ts` – points table, final/bronze seeding, final ranking
- `src/pages/TeamPage.tsx` – public team page (read-only, polls the API)
- `src/scene/HeroScene.tsx` – the 3D landing scene
- `server/index.js` – local server: persistence API (`GET/PUT/DELETE /api/tournament`), optional login
- `worker/index.js`, `wrangler.toml`, `migrations/` – online version (Cloudflare Worker + D1)
- `shared/auth.js` – admin login (signed session cookie), used by both servers
- `shared/teams.js` – team slugs, passwords, password-free team view
- `shared/reports.js` – score reporting rules (report / accept / reject / withdraw)
- `scripts/package.mjs` – builds the shareable zip
- `npm run test:logic` – sanity checks for pairing/scheduling rules
