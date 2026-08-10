import 'dotenv/config';
import cron from 'node-cron';

import { runNotifier } from './lib/runner.js';
import { notifiers } from './notifiers/index.js';

export function scheduleNotifiers({
  availableNotifiers = notifiers,
  cronImpl = cron,
  logger = console,
} = {}) {
  for (const notifier of availableNotifiers) {
    cronImpl.schedule(
      notifier.schedule,
      () => {
        runNotifier(notifier, { logger }).catch(error => {
          logger?.error(`${notifier.name} scheduled run failed:`);
          logger?.error(error);
        });
      },
      { timezone: notifier.timezone },
    );

    logger?.log(
      `Scheduled ${notifier.name} with ${notifier.schedule} (${notifier.timezone}).`,
    );
  }
}

scheduleNotifiers();
