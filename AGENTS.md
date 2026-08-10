# AGENTS.md

## Commands

- Install with `npm install`; this repo uses `package-lock.json`, not pnpm/yarn.
- Run all enabled notifiers once with `npm start`.
- Run one notifier once with `npm start -- steam-free-games`.
- Keep scheduled runs alive with `npm run schedule`; this is an in-process `node-cron` scheduler, not an OS service.
- Run tests with `npm test` (`node --test`). There is no lint, formatter, or typecheck script.

## Runtime Configuration

- Requires Node.js 18+ and native `fetch`.
- Load Discord config from `.env`; `.env.example` only defines `DISCORD_WEBHOOK_URL`.
- Missing `DISCORD_WEBHOOK_URL` is only fatal when a Discord notification is actually needed; first-run baselines and unchanged runs should not require it.
- Runtime snapshots live in `snapshots/` and are ignored by Git. Do not commit `.env`, `steam-free-games.json`, or `snapshots/`.

## Architecture

- `src/index.js` is the one-shot entrypoint and supports optional notifier id selection from `process.argv[2]`.
- `src/scheduler.js` registers each notifier's `schedule` and `timezone` with `node-cron` and must keep running.
- `src/lib/runner.js` owns baseline creation, change detection, Discord-before-snapshot ordering, and status results.
- `src/notifiers/index.js` is the enabled notifier registry; adding a notifier requires registering it there.
- Notifier modules own `getCurrentState`, `compare`, and `buildDiscordMessage`, plus `id`, `name`, `schedule`, `timezone`, and `snapshotFile`.

## Safety Invariants

- First runs create a baseline snapshot and send no Discord message.
- Changed runs must send Discord first, then update the snapshot only after Discord succeeds.
- Unchanged runs leave the existing snapshot untouched.
- Steam parsing must throw on zero parsed games so scrape failures do not overwrite snapshots as mass removals.
- Prefer `src/index.js` for one-shot runs and `src/notifiers/steam-free-games.js` for Steam-specific work; do not add per-notifier root entrypoint wrappers.

## Testing Notes

- Tests live under `test/` and use Node's built-in `node:test` plus `node:assert/strict`.
- Tests avoid real Steam/Discord calls by injecting `fetchImpl` and use temp snapshot files under the OS temp directory.
