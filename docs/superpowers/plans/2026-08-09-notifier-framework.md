# Notifier Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the single Steam monitor into a small framework where adding a notifier means adding one module.

**Architecture:** Shared runner code handles snapshots, first-run behavior, Discord delivery, and failure ordering. Each notifier module owns fetching current state, comparing state, and building a Discord message. Entrypoints run all notifiers once or schedule all notifiers in-process.

**Tech Stack:** Node.js 18+, ES modules, native `fetch`, `cheerio`, `dotenv`, `node-cron`, `node:test`, `node:assert/strict`.

## Global Constraints

- `npm start` runs all enabled notifiers once.
- `npm start -- <notifier-id>` runs one notifier once.
- `npm run schedule` keeps the process alive and schedules all enabled notifiers.
- All notifiers use the shared `DISCORD_WEBHOOK_URL` by default.
- Runtime snapshots live under `snapshots/` and are ignored by Git.
- Snapshot updates happen only after Discord succeeds.
- First run creates a baseline and sends no Discord notification.
- Missing Discord webhook configuration is only fatal when a notification is required.
- Steam zero-game parsing remains a hard failure and must not overwrite snapshots.

---

## File Structure

- Create `src/index.js`: loads `.env`, selects notifiers, runs them once.
- Create `src/scheduler.js`: loads `.env`, registers each notifier schedule with `node-cron`.
- Create `src/notifiers/index.js`: registry of enabled notifiers.
- Create `src/notifiers/steam-free-games.js`: Steam-specific fetching, parsing, comparison, Discord message building.
- Create `src/lib/runner.js`: shared notifier orchestration.
- Create `src/lib/discord.js`: shared Discord webhook POST.
- Create `src/lib/snapshots.js`: JSON snapshot read/write helpers.
- Replace root `steam-free-games-monitor.js` with a compatibility wrapper that runs the Steam notifier once.
- Update tests to exercise the new module boundaries.

---

### Task 1: Dependencies And Scripts

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Generated: `package-lock.json`

**Interfaces:**
- Produces: `npm start`, `npm run schedule`, `npm test`.

- [ ] Update dependencies to include `dotenv` and `node-cron`.
- [ ] Update `start` to `node src/index.js`.
- [ ] Add `schedule` as `node src/scheduler.js`.
- [ ] Ignore `snapshots/`.
- [ ] Run `npm install`.

---

### Task 2: Steam Notifier Module

**Files:**
- Create: `src/notifiers/steam-free-games.js`
- Modify: `steam-free-games-monitor.test.js`

**Interfaces:**
- Produces: default notifier object with `id`, `name`, `schedule`, `timezone`, `snapshotFile`, `getCurrentState`, `compare`, `buildDiscordMessage`.
- Produces named exports: `parseFreeGames`, `compareGames`, `normalizeSteamUrl`, `getGameId`, `STEAM_URL`.

- [ ] Write failing tests for parsing/comparison imports from the new notifier module.
- [ ] Move Steam-specific logic into `src/notifiers/steam-free-games.js`.
- [ ] Run tests and fix imports.

---

### Task 3: Shared Runner And Discord

**Files:**
- Create: `src/lib/runner.js`
- Create: `src/lib/discord.js`
- Create: `src/lib/snapshots.js`
- Modify: `steam-free-games-monitor.test.js`

**Interfaces:**
- Produces: `runNotifier(notifier, options): Promise<object>`.
- Produces: `sendDiscordMessage({ webhookUrl, message, fetchImpl }): Promise<void>`.
- Produces: `readSnapshot(snapshotFile)`, `writeSnapshot(snapshotFile, state)`.

- [ ] Write failing runner tests for baseline, unchanged, changed, Discord failure preservation, and zero-state preservation.
- [ ] Write failing Discord payload tests.
- [ ] Implement shared modules minimally.
- [ ] Run tests.

---

### Task 4: Entrypoints And Scheduling

**Files:**
- Create: `src/index.js`
- Create: `src/scheduler.js`
- Create: `src/notifiers/index.js`
- Modify: `steam-free-games-monitor.js`
- Modify: `.env.example`
- Create: `README.md`

**Interfaces:**
- Produces: `runSelectedNotifiers({ notifierId, notifiers, ...options })`.
- Produces: root wrapper `steam-free-games-monitor.js` for backward-compatible one-shot Steam runs.

- [ ] Write failing tests for selecting all notifiers vs one notifier.
- [ ] Implement notifier registry and one-shot entrypoint.
- [ ] Implement scheduler entrypoint using `node-cron` with notifier `schedule` and `timezone`.
- [ ] Document install, `.env`, one-shot run, scheduled run, and adding another notifier.
- [ ] Run `npm test` and `npm start`.

---

## Self-Review

- Spec coverage: all-notifier start, single-notifier start, shared Discord channel, per-notifier snapshots, Steam safety behavior, and scheduler mode are covered.
- Placeholder scan: no placeholder steps remain.
- Type consistency: notifier contract, runner, Discord, and snapshot helper names are consistent across tasks.
