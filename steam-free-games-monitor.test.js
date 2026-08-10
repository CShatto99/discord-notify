import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compareGames,
  default as steamFreeGamesNotifier,
  parseFreeGames,
} from './src/notifiers/steam-free-games.js';
import { runNotifier } from './src/lib/runner.js';
import { sendDiscordMessage } from './src/lib/discord.js';
import { selectNotifiers } from './src/index.js';

const SEARCH_HTML = `
  <a class="search_result_row" href="https://store.steampowered.com/app/200/Beta_Game/?snr=1_7_7_151_150_1">
    <span class="title">Beta Game</span>
  </a>
  <a class="search_result_row" href="https://store.steampowered.com/app/100/Alpha_Game/?utm_source=test">
    <span class="title">Alpha Game</span>
  </a>
  <a class="search_result_row" href="https://store.steampowered.com/app/100/Alpha_Game/?duplicate=true">
    <span class="title">Alpha Game Duplicate Row</span>
  </a>
  <a class="search_result_row" href="https://store.steampowered.com/sub/300/?snr=1">
    <span class="title">Bundle Deal</span>
  </a>
`;

const ALPHA_HTML = `
  <a class="search_result_row" href="https://store.steampowered.com/app/100/Alpha_Game/?snr=1">
    <span class="title">Alpha Game</span>
  </a>
`;

const ALPHA_BETA_HTML = `
  <a class="search_result_row" href="https://store.steampowered.com/app/100/Alpha_Game/?snr=1">
    <span class="title">Alpha Game</span>
  </a>
  <a class="search_result_row" href="https://store.steampowered.com/app/200/Beta_Game/?snr=1">
    <span class="title">Beta Game</span>
  </a>
`;

function htmlFetch(html) {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => html,
  });
}

async function tempSnapshotFile() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'steam-monitor-'));
  return {
    directory,
    snapshotFile: path.join(directory, 'steam-free-games.json'),
  };
}

function steamNotifierForTest(snapshotFile) {
  return {
    ...steamFreeGamesNotifier,
    snapshotFile,
  };
}

test('parseFreeGames extracts normalized games sorted by stable id', () => {
  const games = parseFreeGames(SEARCH_HTML);

  assert.deepEqual(games, [
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
    {
      appId: '200',
      name: 'Beta Game',
      url: 'https://store.steampowered.com/app/200/Beta_Game/',
    },
    {
      appId: 'https://store.steampowered.com/sub/300/',
      name: 'Bundle Deal',
      url: 'https://store.steampowered.com/sub/300/',
    },
  ]);
});

test('parseFreeGames refuses an empty parsed result', () => {
  assert.throws(
    () => parseFreeGames('<html><body>No search rows</body></html>'),
    /Steam returned zero games/,
  );
});

test('compareGames reports additions and removals by app id', () => {
  const previous = [
    { appId: '100', name: 'Alpha Game', url: 'https://example.com/alpha' },
    { appId: '200', name: 'Beta Game', url: 'https://example.com/beta' },
  ];
  const current = [
    { appId: '200', name: 'Beta Game', url: 'https://example.com/beta-new' },
    { appId: '300', name: 'Gamma Game', url: 'https://example.com/gamma' },
  ];

  assert.deepEqual(compareGames(previous, current), {
    added: [current[1]],
    removed: [previous[0]],
  });
});

test('compareGames ignores reordered games', () => {
  const previous = [
    { appId: '100', name: 'Alpha Game', url: 'https://example.com/alpha' },
    { appId: '200', name: 'Beta Game', url: 'https://example.com/beta' },
  ];
  const current = [previous[1], previous[0]];

  assert.deepEqual(compareGames(previous, current), {
    added: [],
    removed: [],
  });
});

test('runNotifier creates a baseline without requiring Discord', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));

  const result = await runNotifier(steamNotifierForTest(snapshotFile), {
    fetchImpl: htmlFetch(ALPHA_HTML),
    logger: null,
    snapshotFile,
  });

  assert.equal(result.status, 'baseline-created');
  assert.deepEqual(JSON.parse(await fs.readFile(snapshotFile, 'utf8')), [
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
  ]);
});

test('runNotifier leaves an unchanged snapshot untouched and does not require Discord', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const previousContents = JSON.stringify([
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
  ], null, 2);
  await fs.writeFile(snapshotFile, previousContents, 'utf8');

  const result = await runNotifier(steamNotifierForTest(snapshotFile), {
    fetchImpl: htmlFetch(ALPHA_HTML),
    logger: null,
    snapshotFile,
  });

  assert.equal(result.status, 'unchanged');
  assert.equal(await fs.readFile(snapshotFile, 'utf8'), previousContents);
});

test('runNotifier updates the snapshot after a successful Discord notification', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(snapshotFile, JSON.stringify([
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
  ]), 'utf8');
  const requestedUrls = [];
  const fetchImpl = async url => {
    requestedUrls.push(String(url));
    if (String(url).startsWith('https://discord.example/webhook')) {
      return { ok: true, status: 204, text: async () => '' };
    }
    return htmlFetch(ALPHA_BETA_HTML)();
  };

  const result = await runNotifier(steamNotifierForTest(snapshotFile), {
    fetchImpl,
    logger: null,
    snapshotFile,
    webhookUrl: 'https://discord.example/webhook',
  });

  assert.equal(result.status, 'changed');
  assert.deepEqual(result.added.map(game => game.appId), ['200']);
  assert.equal(requestedUrls.at(-1), 'https://discord.example/webhook');
  assert.deepEqual(
    JSON.parse(await fs.readFile(snapshotFile, 'utf8')).map(game => game.appId),
    ['100', '200'],
  );
});

test('runNotifier preserves the old snapshot when Discord fails', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const previousContents = JSON.stringify([
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
  ], null, 2);
  await fs.writeFile(snapshotFile, previousContents, 'utf8');
  const fetchImpl = async url => {
    if (String(url).startsWith('https://discord.example/webhook')) {
      return { ok: false, status: 500, text: async () => 'server error' };
    }
    return htmlFetch(ALPHA_BETA_HTML)();
  };

  await assert.rejects(
    runNotifier(steamNotifierForTest(snapshotFile), {
      fetchImpl,
      logger: null,
      snapshotFile,
      webhookUrl: 'https://discord.example/webhook',
    }),
    /Discord webhook failed: 500 server error/,
  );
  assert.equal(await fs.readFile(snapshotFile, 'utf8'), previousContents);
});

test('runNotifier preserves the old snapshot when Steam parses zero games', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const previousContents = JSON.stringify([
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
  ], null, 2);
  await fs.writeFile(snapshotFile, previousContents, 'utf8');

  await assert.rejects(
    runNotifier(steamNotifierForTest(snapshotFile), {
      fetchImpl: htmlFetch('<html><body>No games here</body></html>'),
      logger: null,
      snapshotFile,
      webhookUrl: 'https://discord.example/webhook',
    }),
    /Steam returned zero games/,
  );
  assert.equal(await fs.readFile(snapshotFile, 'utf8'), previousContents);
});

test('sendDiscordMessage posts a notifier-built Discord payload', async () => {
  let payload;
  const fetchImpl = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, status: 204, text: async () => '' };
  };

  await sendDiscordMessage({
    fetchImpl,
    message: steamFreeGamesNotifier.buildDiscordMessage({
      changes: {
        added: [
          {
            appId: '200',
            name: 'Beta Game',
            url: 'https://store.steampowered.com/app/200/Beta_Game/',
          },
        ],
        removed: [
          {
            appId: '100',
            name: 'Alpha Game',
            url: 'https://store.steampowered.com/app/100/Alpha_Game/',
          },
        ],
      },
      currentState: [
        { appId: '100', name: 'Alpha Game', url: 'https://store.steampowered.com/app/100/Alpha_Game/' },
        { appId: '200', name: 'Beta Game', url: 'https://store.steampowered.com/app/200/Beta_Game/' },
      ],
    }),
    webhookUrl: 'https://discord.example/webhook',
  });

  assert.equal(payload.username, 'Steam Free Games');
  assert.equal(payload.embeds[0].title, 'Steam Free Games Changed');
  assert.match(payload.embeds[0].description, /currently \*\*2\*\* games/);
  assert.deepEqual(payload.embeds[0].fields, [
    {
      name: 'Newly Free',
      value: '[Beta Game](https://store.steampowered.com/app/200/Beta_Game/)',
    },
    {
      name: 'No Longer Free',
      value: 'Alpha Game',
    },
  ]);
});

test('sendDiscordMessage rejects missing webhook configuration', async () => {
  await assert.rejects(
    sendDiscordMessage({
      fetchImpl: async () => ({ ok: true, status: 204, text: async () => '' }),
      message: { username: 'Test', embeds: [] },
      webhookUrl: '',
    }),
    /Discord webhook URL has not been configured/,
  );
});

test('sendDiscordMessage rejects Discord non-success responses', async () => {
  await assert.rejects(
    sendDiscordMessage({
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'rate limited' }),
      message: { username: 'Test', embeds: [] },
      webhookUrl: 'https://discord.example/webhook',
    }),
    /Discord webhook failed: 429 rate limited/,
  );
});

test('selectNotifiers returns all notifiers when no id is provided', () => {
  const notifiers = [
    { id: 'steam-free-games' },
    { id: 'another-notifier' },
  ];

  assert.deepEqual(selectNotifiers(notifiers), notifiers);
});

test('selectNotifiers returns only the requested notifier id', () => {
  const steam = { id: 'steam-free-games' };
  const other = { id: 'another-notifier' };

  assert.deepEqual(selectNotifiers([steam, other], 'steam-free-games'), [steam]);
});

test('selectNotifiers rejects an unknown notifier id', () => {
  assert.throws(
    () => selectNotifiers([{ id: 'steam-free-games' }], 'missing'),
    /Unknown notifier: missing/,
  );
});
