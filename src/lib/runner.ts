import { sendDiscordMessage } from './discord.js';
import { readSnapshot, writeSnapshot } from './snapshots.js';
import type {
  FetchImpl,
  Notifier,
  NotifierChanges,
  RunNotifierResult,
} from '../types.js';

export function hasChanges(changes: NotifierChanges): boolean {
  return Object.values(changes).some(value => Array.isArray(value) && value.length > 0);
}

export async function runNotifier<State, Changes extends NotifierChanges>(
  notifier: Notifier<State, Changes>,
  {
    fetchImpl = fetch,
    webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  }: {
    fetchImpl?: FetchImpl | undefined;
    webhookUrl?: string | undefined;
  } = {},
): Promise<RunNotifierResult<State, Changes>> {
  console.log(`[${new Date().toISOString()}] Running ${notifier.name}...`);

  const currentState = await notifier.getCurrentState({ fetchImpl });
  const previousState = await readSnapshot<State>(notifier.snapshotFile);

  if (!previousState) {
    const baselinePreviousState = [] as State;
    const changes = notifier.compare(baselinePreviousState, currentState);
    const message = notifier.buildDiscordMessage({
      changes,
      currentState,
      previousState: baselinePreviousState,
    });

    await sendDiscordMessage({ fetchImpl, message, webhookUrl });
    await writeSnapshot(notifier.snapshotFile, currentState);
    console.log(`${notifier.name}: baseline notification sent and snapshot saved.`);
    return { status: 'baseline-created', notifierId: notifier.id, currentState };
  }

  const changes = notifier.compare(previousState, currentState);

  if (!hasChanges(changes)) {
    console.log(`${notifier.name}: no changes detected.`);
    return { status: 'unchanged', notifierId: notifier.id, currentState, changes };
  }

  const message = notifier.buildDiscordMessage({ changes, currentState, previousState });

  await sendDiscordMessage({ fetchImpl, message, webhookUrl });
  await writeSnapshot(notifier.snapshotFile, currentState);
  console.log(`${notifier.name}: notification sent and snapshot updated.`);

  return {
    status: 'changed',
    notifierId: notifier.id,
    currentState,
    changes,
    ...changes,
  };
}
