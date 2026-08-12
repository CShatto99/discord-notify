import 'dotenv/config';
import cron from 'node-cron';

import { runNotifier } from './lib/runner.js';
import { notifiers } from './notifiers/index.js';
import type { Notifier, NotifierChanges } from './types.js';

interface CronLike {
  schedule: (
    expression: string,
    task: () => void,
    options: { timezone: string },
  ) => unknown;
}

export function scheduleNotifiers({
  availableNotifiers = notifiers,
  cronImpl = cron,
}: {
  availableNotifiers?: readonly Notifier<unknown, NotifierChanges>[];
  cronImpl?: CronLike | undefined;
} = {}): void {
  for (const notifier of availableNotifiers) {
    cronImpl.schedule(
      notifier.schedule,
      () => {
        runNotifier(notifier).catch(error => {
          console.error(`${notifier.name} scheduled run failed:`);
          console.error(error);
        });
      },
      { timezone: notifier.timezone },
    );

    console.log(`Scheduled ${notifier.name} with ${notifier.schedule} (${notifier.timezone}).`);
  }
}

scheduleNotifiers();
