import { sendDiscordMessage } from './discord.js';
import { readSnapshot, writeSnapshot } from './snapshots.js';

export function hasChanges(changes) {
  return Object.values(changes).some(value => Array.isArray(value) && value.length > 0);
}

export async function runNotifier(notifier, {
  fetchImpl = fetch,
  logger = console,
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
} = {}) {
  logger?.log(`[${new Date().toISOString()}] Running ${notifier.name}...`);

  const currentState = await notifier.getCurrentState({ fetchImpl });
  const previousState = await readSnapshot(notifier.snapshotFile);

  if (!previousState) {
    await writeSnapshot(notifier.snapshotFile, currentState);
    logger?.log(`${notifier.name}: baseline saved.`);
    return { status: 'baseline-created', notifierId: notifier.id, currentState };
  }

  const changes = notifier.compare(previousState, currentState);

  if (!hasChanges(changes)) {
    logger?.log(`${notifier.name}: no changes detected.`);
    return { status: 'unchanged', notifierId: notifier.id, currentState, changes };
  }

  const message = notifier.buildDiscordMessage({ changes, currentState, previousState });

  await sendDiscordMessage({ fetchImpl, message, webhookUrl });
  await writeSnapshot(notifier.snapshotFile, currentState);
  logger?.log(`${notifier.name}: notification sent and snapshot updated.`);

  return {
    status: 'changed',
    notifierId: notifier.id,
    currentState,
    changes,
    ...changes,
  };
}
