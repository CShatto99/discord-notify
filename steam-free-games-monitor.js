import 'dotenv/config';

import { runNotifier } from './src/lib/runner.js';
import steamFreeGames from './src/notifiers/steam-free-games.js';

runNotifier(steamFreeGames).catch(error => {
  console.error('Steam monitor failed:');
  console.error(error);
  process.exitCode = 1;
});
