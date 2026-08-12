import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runNotifier } from './lib/runner.js';
import { notifiers } from './notifiers/index.js';

export function selectNotifiers(availableNotifiers, notifierId) {
  if (!notifierId) {
    return availableNotifiers;
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
  logger = console,
} = {}) {
  const selectedNotifiers = selectNotifiers(availableNotifiers, notifierId);
  const results = [];

  for (const notifier of selectedNotifiers) {
    try {
      results.push(await runNotifier(notifier, { logger }));
    } catch (error) {
      logger?.error(`${notifier.name} failed:`);
      logger?.error(error);
      results.push({ status: 'failed', notifierId: notifier.id, error });
    }
  }

  return results;
}

export function isDirectExecution(moduleUrl, argvPath) {
  if (!argvPath) {
    return false;
  }

  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argvPath);
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  runSelectedNotifiers({ notifierId: process.argv[2] }).catch(error => {
    console.error('Notifier run failed:');
    console.error(error);
    process.exitCode = 1;
  });
}
