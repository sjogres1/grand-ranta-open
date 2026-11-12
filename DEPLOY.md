# Grand Räntä Open – setup, deployment & development guide

This guide is for anyone who wants to **run, publish or keep developing** the Grand Räntä Open
badminton tournament app. Follow it top to bottom the first time.

- **Part A** – get the code and run it on your own laptop
- **Part B** – put it on the internet as a normal web page (free)
- **Part C** – work on it together and publish updates
- **Part D** – limits, backups, troubleshooting and how the code is organised

---

## How the app works (1-minute overview)

```
 Organizer (laptop / phone)          Players (phones)
   https://…/                          https://…/golden-squirrels
   login → run the tournament          team password → own games, scoreboard,
                                       report & accept scores
            │                                   │
            └──────────── /api/… ───────────────┘
                              │
        ┌─────────────────────┴──────────────────────┐
        │ On a laptop: Node.js server                 │  On the internet: Cloudflare Worker
        │ server/index.js → files in data/            │  worker/index.js → D1 database
        └─────────────────────────────────────────────┘
```

- The **web app** (React + a 3D landing page) is in `src/`.
- There are **two interchangeable backends** with the same API: a small Node.js server for
  laptops and a Cloudflare Worker for the internet. Rules they share (login, team passwords,
  score reporting) live in `shared/` so both behave identically.
- **Organizer** = admin login. **Team pages** = one page per pair, protected by a random team
  password that only the organizer sees.

---

## Part A – Run it on your laptop

### A1. Install the tools (once)

| Tool | Why | Get it |
|---|---|---|
| **Node.js 20 or newer** (LTS) | runs the app and the build tools | <https://nodejs.org> → LTS installer |
| **VS Code** (recommended) | code editor | <https://code.visualstudio.com> |
| **Git** (for Part C) | sharing code changes | <https://git-scm.com> |

Check in a terminal: `node -v` should print `v20…` or higher.

### A2. Get the code

Either
- **From a zip:** unzip `GrandRantaOpen-source.zip` (made with `npm run package:source`), or
- **From GitHub** (once you've set it up, Part C): `git clone <repo address>`

Then open a terminal **in the project folder** and install the libraries (once, ~1 minute):

```bash
npm install
```

### A3. Start it

```bash
npm run dev
```

- Organizer page: **<http://localhost:5173>**
- Team pages: `http://localhost:5173/<team-name>` – links and passwords are on the Pairs page
  (🔒 *Show password & link*).
- Stop with **Ctrl + C**. Data is saved in `data/tournament.json` (+ `data/tournament-reports.json`).

On the laptop there is **no organizer login** by default – anyone who opens the main page is the
organizer. To try the login locally, start with
`ADMIN_USER=test ADMIN_PASSWORD=secret npm start` (Mac/Linux terminal or Git Bash on Windows).

### A4. Players' phones on the same Wi-Fi (no internet hosting)

`localhost` only works on the laptop itself. Instead:

```bash
npm start
```

Open <http://localhost:3001> on the laptop. The "Show password & link" links then use the laptop's
Wi-Fi address (e.g. `http://192.168.1.20:3001/golden-squirrels`). If Windows asks whether Node.js
may use the network, allow **Private networks**.

### A5. Check that everything still works (after changes)

```bash
npm run typecheck     # TypeScript errors
npm run test:logic    # pairing, schedule, scoring, passwords, score reporting rules
```

---

## Part B – Put it on the internet (free, ≈ 15 minutes)

The online version runs on **Cloudflare Workers** with a **D1 database**, both on the free plan.
You get an address like `https://grand-ranta-open.<your-name>.workers.dev`.
**One person** does this setup – the "owner" of the Cloudflare account.

### B1. Create a free Cloudflare account

<https://dash.cloudflare.com/sign-up> – no credit card needed.

### B2. Connect your terminal to Cloudflare

In the project folder:

```bash
npx wrangler login
```

A browser window opens → **Allow**. Check with `npx wrangler whoami`.

### B3. Create the database

```bash
npx wrangler d1 create grand-ranta-open
```

It prints a `database_id = "…"`. If Wrangler offers to add it to `wrangler.toml` for you, answer
yes; otherwise open `wrangler.toml` and replace `00000000-0000-0000-0000-000000000000` with it.

### B4. Publish

```bash
npm run deploy
```

This builds the app, creates the database table (answer **y** if asked) and uploads everything.
The first time, Cloudflare may ask you to choose your `workers.dev` sub-domain. At the end it
prints the web address of your site.

### B5. Set the organizer username and password

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASSWORD
```

Each command asks you to **type** the value. They are stored encrypted at Cloudflare and never in
any file – don't put them in the code or in chat messages. Until both are set, nobody can log in.

### B6. Done – try it

1. Open your address → organizer login → log in.
2. Add players, shuffle pairs, build the program.
3. On the Pairs page click **🔒 Show password & link → Copy invite** and send it to each team
   (e.g. WhatsApp). Players open the link and type their team password once.

> **Tip for tournament day:** open the organizer page on your laptop *and* phone; you stay logged
> in for 14 days. The Pairs page can be shown on a projector – passwords stay hidden until you
> click *Show*.

---

## Part C – Working on it together

### C1. Share the code with GitHub (recommended)

GitHub keeps one shared copy of the code and the history of every change. The owner does this once:

1. Create a free account at <https://github.com> and a **new private repository**
   (e.g. `grand-ranta-open`), without a README.
2. In the project folder:

   ```bash
   git init
   git add .
   git commit -m "Grand Räntä Open"
   git branch -M main
   git remote add origin https://github.com/<you>/grand-ranta-open.git
   git push -u origin main
   ```

   `.gitignore` already keeps out `node_modules`, your tournament data (`data/`), local secrets
   (`.dev.vars`) and build files – **check that `git status` never lists them**.
3. On GitHub: *Settings → Collaborators → Add people* → invite your friend.

Your friend then runs `git clone https://github.com/<you>/grand-ranta-open.git`, `cd grand-ranta-open`,
`npm install`, `npm run dev`.

**Day-to-day:**

```bash
git pull                      # get the other person's changes first
# …make changes, test with npm run dev / npm run typecheck / npm run test:logic …
git add .
git commit -m "What you changed"
git push
```

### C2. Who can publish to the internet?

Choose one:

- **Simple:** only the owner runs `npm run deploy` (after `git pull`).
- **Both of you:** in the Cloudflare dashboard → *Manage account → Members* → invite your friend
  (with access to Workers and D1). Your friend then runs `npx wrangler login` once and can use
  `npm run deploy` too. The `database_id` in `wrangler.toml` is shared through Git.
- **Automatic:** Cloudflare can build and publish every time you push to GitHub
  (dashboard → *Workers & Pages* → `grand-ranta-open` → *Settings → Build* → connect the GitHub
  repository; deploy command `npm run deploy`). Menu names may differ slightly. Handy later, not
  needed to start.

Avoid publishing in the middle of a running tournament – organizer tabs should then be reloaded.

### C3. Changing the database

The database has one table (`migrations/0001_init.sql`). If you ever need a new one, add a file
`migrations/0002_….sql`; `npm run deploy` applies it automatically. To test the online version
locally first: copy `.dev.vars.example` to `.dev.vars` (test credentials only) and run
`npm run cf:dev` → <http://localhost:8787>.

---

## Part D – Reference

### D1. Limits and cost for ~30 simultaneous users

| | Free plan limit | This app with 30 users |
|---|---|---|
| Worker requests | 100,000 / day | each open team page checks every 15 s (every 5 s while a score waits for confirmation); **locked phones don't check**. Even if all 30 screens stayed on, that's ≈ 7,000 / hour – a normal tournament day stays well below the limit |
| Static files (the app itself) | unlimited | – |
| D1 database | 5 GB storage, 5 M reads & 100 k writes / day | a whole tournament is ~20 KB; a few thousand reads/writes |

If you ever outgrow it (e.g. hundreds of players), the Workers **paid plan is $5/month** with
10 million requests – no code changes needed.

**Why this setup:** it's free, always on (no "sleeping" server that takes a minute to wake up),
fast everywhere, and there's no server to maintain. Free alternatives like Render or Railway either
sleep, delete their disk on restart (you'd lose scores) or need a separate database.

### D2. Backups and data

| What | How |
|---|---|
| Download the online tournament | `npx wrangler d1 export grand-ranta-open --remote --output backup.sql` |
| Laptop data | `data/tournament.json` and `data/tournament-reports.json` – copy the files |
| Start a new tournament | **Reset** button in the organizer page (deletes players, results and reports) |

The laptop version and the online version have **separate data**.

### D3. Troubleshooting

| Problem | Fix |
|---|---|
| Online login says "Server not configured" | Secrets missing → step B5 |
| "Wrong username or password" online | Usernames ignore capital letters, passwords don't. Reset with `npx wrangler secret put ADMIN_PASSWORD` (logs everyone out) |
| Team page: "Wrong password" | Check it on the Pairs page (🔒 Show). Reshuffling pairs creates new teams, names and passwords |
| Changes don't show up | Reload the page (Ctrl + F5). After `npm run deploy` or code changes, reload open organizer tabs |
| "Port 3001 is already in use" | The app is already running in another terminal – close it first |
| `wrangler` asks to log in / "not authorized" | `npx wrangler login`, check with `npx wrangler whoami` |
| "⚠️ Not saved to server" in the organizer page | Server not running or you were logged out – reload the page |
| `npm install` warns about "install-scripts" | Harmless – newer npm versions just list packages that have setup scripts. Everything works without approving them |

### D4. Security notes

- Organizer password: only in Cloudflare secrets, never in code. Use a long one.
- Team passwords are random (`lucky-otter-482`), shown only to the organizer, never sent to team
  pages, and wrong guesses are slowed down.
- A score only counts when the **other** team accepts it; the organizer can always override.
- Anyone with a team's link + password can open that team's page – send invites only to the two
  players. "↻ new password" replaces a leaked one.
- Last save wins: let one organizer enter results at a time.

### D5. Where things are in the code

| Folder / file | What |
|---|---|
| `src/pages/` | screens: Landing (+ login), Players, Pairs, Schedule (program), Finals, TeamPage |
| `src/components/` | match cards, standings, team invite/password box, score reporting box, fanfare |
| `src/logic/` | pairing rules, schedule & round robin, standings, merging accepted reports |
| `src/scene/HeroScene.tsx` | the 3D badminton scene on the landing page |
| `src/useTournament.ts` | organizer data: load, auto-save, login, report sync |
| `src/useLiveTournament.ts` | team page data (password, polling, score actions) |
| `shared/` | rules used by the browser **and** both servers: `auth.js`, `teams.js`, `reports.js` |
| `server/index.js` | laptop backend (Express) |
| `worker/index.js`, `wrangler.toml`, `migrations/` | internet backend (Cloudflare Worker + D1) |
| `scripts/` | tests, `package.mjs` (player zip), `package-source.mjs` (source zip) |

**Two zips, two purposes:**
- `npm run package` → `release/GrandRantaOpen.zip` – for someone who just wants to **use** the app on
  their laptop (double-click to start, nothing to install).
- `npm run package:source` → `release/GrandRantaOpen-source.zip` – for a **developer** (this guide).
