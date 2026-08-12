# Discord Notify

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
npm start -- lego-approved-ideas
```

## Run On A Schedule

The included GitHub Actions workflow runs all notifiers daily with `npm start` and commits changed `snapshots/` files back to the repository.

To enable the workflow:

1. Add a repository secret named `DISCORD_WEBHOOK_URL` with your Discord webhook URL.
2. Set Actions workflow permissions to `Read and write permissions` so the workflow can commit snapshots.
3. Run the `Notifiers` workflow manually once from GitHub's Actions tab to create baseline snapshots.

The first successful run creates baseline snapshots and usually sends no Discord messages. Later runs compare against committed snapshots and notify only on changes.

The workflow is scheduled with `0 15 * * *` in UTC. This is 10:00 AM Central during daylight saving time and 9:00 AM Central during standard time. Use the manual `workflow_dispatch` trigger from GitHub's Actions tab when you want to run it on demand.

## Run Locally On A Schedule

Keep the process alive and run each notifier on its configured schedule:

```bash
npm run schedule
```

The Steam and LEGO Ideas notifiers run daily at 10:00 AM Central Time using the `America/Chicago` timezone.

This is OS-agnostic, but the process must stay running and the machine must stay awake. For unattended machines, prefer the GitHub Actions workflow above or use your preferred process manager, service runner, Docker restart policy, or host startup mechanism.

## Add A Notifier

Create a file in `src/notifiers/` that exports a notifier object:

```js
export default {
  id: 'example-notifier',
  name: 'Example Notifier',
  schedule: '0 10 * * *',
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

The Steam notifier refuses to save a zero-game result so a scrape failure does not look like every game was removed. The LEGO Ideas notifier similarly refuses to save a zero-idea API result.
