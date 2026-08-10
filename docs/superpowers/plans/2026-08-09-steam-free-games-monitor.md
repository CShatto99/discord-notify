# Steam Free Games Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js monitor that detects Steam free promotional game additions/removals and notifies Discord only after a real change.

**Architecture:** A small ES module app with `steam-free-games-monitor.js` as both executable entrypoint and testable module. Pure parsing/comparison/orchestration helpers are exported for Node's built-in test runner. Runtime snapshot state is stored in an ignored JSON file next to the script.

**Tech Stack:** Node.js 18+, ES modules, native `fetch`, `cheerio`, `node:test`, `node:assert/strict`, `node:fs/promises`.

## Global Constraints

- Target Node.js 18 or newer.
- Use `process.env.DISCORD_WEBHOOK_URL` for Discord configuration.
- Do not commit a real Discord webhook URL.
- Store runtime state in `steam-free-games.json` and ignore it in Git.
- Refuse to overwrite the snapshot when Steam parsing returns zero games.
- Update the snapshot after Discord notification succeeds, never before.
- First run creates a baseline and sends no Discord notification.
- Missing Discord webhook configuration is only fatal when a notification is required.
- Set `process.exitCode = 1` for application failures instead of calling `process.exit(1)`.

---

## File Structure

- Create `package.json`: project metadata, ES module mode, `start` and `test` scripts, `cheerio` dependency.
- Create `.gitignore`: ignore `node_modules/`, `steam-free-games.json`, and transient test temp files if any are added later.
- Create `steam-free-games-monitor.js`: constants, parsing, fetching, snapshot I/O, comparison, Discord notification, orchestration, CLI entrypoint.
- Create `steam-free-games-monitor.test.js`: unit tests for pure helpers and monitor orchestration using injected dependencies.
- Generated `package-lock.json`: created by `npm install`.

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Generated: `package-lock.json`

**Interfaces:**
- Produces: `npm start` runs `node steam-free-games-monitor.js`.
- Produces: `npm test` runs `node --test`.

- [ ] **Step 1: Create package metadata**

Create `package.json` with:

```json
{
  "name": "steam-free-games-monitor",
  "version": "1.0.0",
  "type": "module",
  "main": "steam-free-games-monitor.js",
  "scripts": {
    "start": "node steam-free-games-monitor.js",
    "test": "node --test"
  },
  "dependencies": {
    "cheerio": "^1.1.2"
  }
}
```

- [ ] **Step 2: Create Git ignore rules**

Create `.gitignore` with:

```gitignore
node_modules/
steam-free-games.json
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`

Expected: `node_modules/` and `package-lock.json` are created, with `cheerio` installed.

- [ ] **Step 4: Verify scripts exist**

Run: `npm pkg get scripts`

Expected: JSON includes `start` and `test`.

---

### Task 2: Parsing And Comparison

**Files:**
- Create: `steam-free-games-monitor.js`
- Create: `steam-free-games-monitor.test.js`

**Interfaces:**
- Produces: `parseFreeGames(html: string): Array<{ appId: string, name: string, url: string }>`
- Produces: `compareGames(previous: Game[], current: Game[]): { added: Game[], removed: Game[] }`

- [ ] **Step 1: Write failing parser and comparison tests**

Add tests that assert `parseFreeGames` extracts titles, strips query params, extracts app IDs, dedupes duplicate rows, sorts by app ID, and throws when no rows parse. Add tests that assert `compareGames` detects added/removed games and ignores reordering.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because the module or exports do not exist yet.

- [ ] **Step 3: Implement minimal parser and comparison helpers**

In `steam-free-games-monitor.js`, import Cheerio and implement `parseFreeGames`, `normalizeSteamUrl`, `getGameId`, and `compareGames`. Throw `Steam returned zero games. Refusing to overwrite the existing snapshot.` when parsing finds no valid games.

- [ ] **Step 4: Run tests to verify parser/comparison pass**

Run: `npm test`

Expected: PASS for parser and comparison tests.

---

### Task 3: Monitor Orchestration

**Files:**
- Modify: `steam-free-games-monitor.js`
- Modify: `steam-free-games-monitor.test.js`

**Interfaces:**
- Consumes: `parseFreeGames(html)`, `compareGames(previous, current)`
- Produces: `runMonitor(options?: { fetchImpl, webhookUrl, snapshotFile, now, logger }): Promise<{ status: string, currentCount: number, added?: Game[], removed?: Game[] }>`
- Produces: `readPreviousSnapshot(snapshotFile: string): Promise<Game[] | null>`
- Produces: `saveSnapshot(snapshotFile: string, games: Game[]): Promise<void>`

- [ ] **Step 1: Write failing orchestration tests**

Add tests using temp snapshot files and fake fetch functions for first-run baseline, unchanged second run, changed run with Discord success, Discord failure preserving the old snapshot, and zero-game scrape preserving the old snapshot.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because `runMonitor`, snapshot helpers, and notification behavior are incomplete.

- [ ] **Step 3: Implement snapshot I/O and monitor flow**

Implement `fetchFreeGames`, `readPreviousSnapshot`, `saveSnapshot`, and `runMonitor`. `runMonitor` must fetch Steam, parse games, load the snapshot, establish baseline on first run, compare later runs, skip Discord when unchanged, send Discord before saving when changed, and return a status object.

- [ ] **Step 4: Run tests to verify orchestration passes**

Run: `npm test`

Expected: PASS for all tests.

---

### Task 4: Discord Notification And CLI

**Files:**
- Modify: `steam-free-games-monitor.js`
- Modify: `steam-free-games-monitor.test.js`

**Interfaces:**
- Consumes: `runMonitor(options)`
- Produces: `sendDiscordNotification({ added, removed, currentCount, webhookUrl, fetchImpl }): Promise<void>`
- Produces: direct execution behavior for `node steam-free-games-monitor.js`

- [ ] **Step 1: Write failing Discord payload tests**

Add tests that assert added games are clickable Markdown links, removed games are plain names, missing webhook throws only when notification is attempted, and Discord non-2xx responses throw.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because full notification validation is incomplete.

- [ ] **Step 3: Implement Discord notification and CLI entrypoint**

Implement `sendDiscordNotification` with Discord embed payload. Add entrypoint detection using `fileURLToPath(import.meta.url) === path.resolve(process.argv[1])`, log useful progress, and set `process.exitCode = 1` in the top-level catch.

- [ ] **Step 4: Run tests to verify all unit tests pass**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Run real monitor once**

Run: `npm start`

Expected: If Steam returns promotional games, `steam-free-games.json` is created and no Discord notification is sent. If Steam returns zero parseable games or blocks the request, the command fails without creating/updating the snapshot.

---

## Self-Review

- Spec coverage: setup, scraping, normalization, snapshot behavior, Discord ordering, zero-game safety, environment variable configuration, tests, and manual verification are covered.
- Placeholder scan: no placeholder steps remain.
- Type consistency: `Game`, `parseFreeGames`, `compareGames`, `runMonitor`, `readPreviousSnapshot`, `saveSnapshot`, and `sendDiscordNotification` are consistently named across tasks.
