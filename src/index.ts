import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runNotifier } from './lib/runner.js';
import { notifiers } from './notifiers/index.js';
import type {
  FailedNotifierResult,
  Notifier,
  NotifierChanges,
  RunNotifierResult,
} from './types.js';

type AnyNotifier = Notifier<unknown, NotifierChanges>;
type RunnableNotifier = Pick<AnyNotifier, 'id' | 'name' | 'getCurrentState'> &
  Partial<Omit<AnyNotifier, 'id' | 'name' | 'getCurrentState'>>;

export function selectNotifiers<AvailableNotifier extends { id: string }>(
  availableNotifiers: readonly AvailableNotifier[],
  notifierId?: string,
): AvailableNotifier[] {
  if (!notifierId) {
    return [...availableNotifiers];
  }

  const notifier = availableNotifiers.find(candidate => candidate.id === notifierId);

  if (!notifier) {
    throw new Error(`Unknown notifier: ${notifierId}`);
  }

  return [notifier];
}

export async function runSelectedNotifiers({
  notifierId,
  availableNotifiers = notifiers,
}: {
  notifierId?: string | undefined;
  availableNotifiers?: readonly RunnableNotifier[];
} = {}): Promise<Array<RunNotifierResult<unknown, NotifierChanges> | FailedNotifierResult>> {
  const selectedNotifiers = selectNotifiers(availableNotifiers, notifierId);
  const results: Array<RunNotifierResult<unknown, NotifierChanges> | FailedNotifierResult> = [];

  for (const notifier of selectedNotifiers) {
    try {
      results.push(await runNotifier(notifier as AnyNotifier));
    } catch (error) {
      console.error(`${notifier.name} failed:`);
      console.error(error);
      results.push({ status: 'failed', notifierId: notifier.id, error });
    }
  }

  return results;
}

export function isDirectExecution(moduleUrl: string, argvPath?: string): boolean {
  if (!argvPath) {
    return false;
  }

  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argvPath);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  const notifierId = process.argv[2];
  runSelectedNotifiers(notifierId ? { notifierId } : {}).catch(error => {
    console.error('Notifier run failed:');
    console.error(error);
    process.exitCode = 1;
  });
}
