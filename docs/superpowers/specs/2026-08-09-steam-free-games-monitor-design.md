# Steam Free Games Monitor Design

## Goal

Build a small Node.js application that checks Steam's free promotional games page, stores a local snapshot, and sends a Discord webhook only when games are added or removed.

## Architecture

The project is a Node 18+ ES module application. The entrypoint is `steam-free-games-monitor.js`. It runs the monitor when executed directly and exports pure helper functions so behavior can be tested without calling Steam or Discord.

Runtime state is stored in `steam-free-games.json` next to the script. The snapshot is generated data and is ignored by Git. Dependencies are intentionally minimal: `cheerio` for HTML parsing and Node built-ins for tests, filesystem access, and fetch.

## Configuration

The Discord webhook URL comes from `process.env.DISCORD_WEBHOOK_URL`. This avoids committing a secret and keeps the notification code independent of where the secret comes from.

Missing webhook configuration is only an error when a notification is required. First-run baselines and unchanged runs can complete without a webhook.

## Data Flow

1. Fetch `https://store.steampowered.com/search/?hwtype=0&maxprice=free&category1=998&specials=1&ndl=1` with a browser-like user agent.
2. Parse `a.search_result_row` elements with Cheerio.
3. Normalize each game to `{ appId, name, url }`.
4. Strip URL query parameters and use the Steam app ID as the primary identity when available.
5. Dedupe and sort games by `appId` for stable snapshots.
6. Refuse to continue if the parsed list is empty.
7. If no previous snapshot exists, write the baseline and send no Discord message.
8. If a snapshot exists, compare previous and current games by `appId`.
9. If nothing changed, exit without updating the snapshot.
10. If games changed, send a Discord embed first, then overwrite the snapshot only after Discord succeeds.

## Error Handling

The application exits with a non-zero exit code by setting `process.exitCode = 1` when Steam fails, no games are parsed, snapshot JSON is invalid, Discord fails, or snapshot reads/writes fail.

The snapshot is never overwritten after a zero-game scrape or a failed Discord notification. This prevents false removals and preserves pending changes for the next scheduled run.

## Testing

Use Node's built-in test runner. Tests cover parsing and normalization, comparison by app ID, stable comparisons across reordering, first-run baseline behavior, unchanged-run behavior, Discord-failure snapshot preservation, and zero-game scrape protection.

Manual verification runs `npm start`. A real notification requires `DISCORD_WEBHOOK_URL` to be set and a changed snapshot.

## Scheduling

The app is intended to run daily from Windows Task Scheduler at 8:00 PM Central Time. Scheduling is outside the codebase; the script only needs to be runnable with `npm start` or `node steam-free-games-monitor.js`.
