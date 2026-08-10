# Notifybox

Code-first Node.js notifier framework for scheduled checks that post changes to one Discord channel.

## Setup

Requires Node.js 18 or newer.

```bash
npm install
```

Create `.env` from `.env.example` and set your shared Discord webhook:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

## Run Once

Run all enabled notifiers once:

```bash
npm start
```

Run one notifier by id:

```bash
npm start -- steam-free-games
```

## Run On A Schedule

Keep the process alive and run each notifier on its configured schedule:

```bash
npm run schedule
```

The Steam notifier runs daily at 8:00 PM Central Time using the `America/Chicago` timezone.

This is OS-agnostic, but the process must stay running. For unattended machines, use your preferred process manager, service runner, Docker restart policy, or host startup mechanism.

## Add A Notifier

Create a file in `src/notifiers/` that exports a notifier object:

```js
export default {
  id: 'example-notifier',
  name: 'Example Notifier',
  schedule: '0 20 * * *',
  timezone: 'America/Chicago',
  snapshotFile: 'snapshots/example-notifier.json',

  async getCurrentState({ fetchImpl }) {
    return [];
  },

  compare(previousState, currentState) {
    return { added: [], removed: [] };
  },

  buildDiscordMessage({ changes, currentState }) {
    return {
      username: 'Example Notifier',
      embeds: [
        {
          title: 'Example Changed',
          description: `Current item count: ${currentState.length}`,
          fields: [],
          timestamp: new Date().toISOString(),
        },
      ],
    };
  },
};
```

Then register it in `src/notifiers/index.js`.

## Snapshot Safety

Snapshots are stored under `snapshots/` and ignored by Git. First runs create a baseline and send no Discord message. Changed runs send Discord first and update the snapshot only after Discord succeeds.

The Steam notifier refuses to save a zero-game result so a scrape failure does not look like every game was removed.
