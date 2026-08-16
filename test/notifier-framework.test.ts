import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  compareGames,
  default as steamFreeGamesNotifier,
  parseFreeGames,
  type SteamGame,
} from '../src/notifiers/steam-free-games.js';
import {
  buildDiscordMessage as buildLegoDiscordMessage,
  compareIdeas,
  default as legoApprovedIdeasNotifier,
  normalizeIdeasResponse,
  type LegoIdea,
} from '../src/notifiers/lego-approved-ideas.js';
import { runNotifier } from '../src/lib/runner.js';
import { sendDiscordMessage } from '../src/lib/discord.js';
import { runSelectedNotifiers, selectNotifiers } from '../src/index.js';
import { notifiers } from '../src/notifiers/index.js';
import type { DiscordMessage, FetchImpl } from '../src/types.js';

type DiscordEmbedWithFooter = DiscordMessage['embeds'][number] & {
  footer?: unknown;
};

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

const LEGO_API_RESPONSE = {
  productIdeas: [
    {
      id: 'beta-uuid',
      attributes: {
        uuid: 'beta-uuid',
        title: 'Beta Build',
        creator: { attributes: { alias: 'BetaBuilder' } },
        support_count: 10001,
        published_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-02T00:00:00.000Z',
      },
    },
    {
      id: 'alpha-uuid',
      attributes: {
        title: 'Alpha Build',
        creator: { attributes: { alias: 'AlphaBuilder' } },
        support_count: 10000,
        published_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    },
  ],
};

function htmlFetch(html: string): FetchImpl {
  return async () => new Response(html, { status: 200, statusText: 'OK' });
}

function jsonFetch(payload: unknown): FetchImpl {
  return async () => Response.json(payload, { status: 200, statusText: 'OK' });
}

async function tempSnapshotFile(): Promise<{
  directory: string;
  snapshotFile: string;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'steam-monitor-'));
  return {
    directory,
    snapshotFile: path.join(directory, 'steam-free-games.json'),
  };
}

async function tempLegoSnapshotFile(): Promise<{
  directory: string;
  snapshotFile: string;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-ideas-monitor-'));
  return {
    directory,
    snapshotFile: path.join(directory, 'lego-approved-ideas.json'),
  };
}

function steamNotifierForTest(snapshotFile: string) {
  return {
    ...steamFreeGamesNotifier,
    snapshotFile,
  };
}

function legoNotifierForTest(snapshotFile: string) {
  return {
    ...legoApprovedIdeasNotifier,
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
  const previous: SteamGame[] = [
    { appId: '100', name: 'Alpha Game', url: 'https://example.com/alpha' },
    { appId: '200', name: 'Beta Game', url: 'https://example.com/beta' },
  ];
  const current: SteamGame[] = [
    { appId: '200', name: 'Beta Game', url: 'https://example.com/beta-new' },
    { appId: '300', name: 'Gamma Game', url: 'https://example.com/gamma' },
  ];

  assert.deepEqual(compareGames(previous, current), {
    added: [current[1]],
    removed: [previous[0]],
  });
});

test('compareGames ignores reordered games', () => {
  const previous: SteamGame[] = [
    { appId: '100', name: 'Alpha Game', url: 'https://example.com/alpha' },
    { appId: '200', name: 'Beta Game', url: 'https://example.com/beta' },
  ];
  const current = [previous[1]!, previous[0]!];

  assert.deepEqual(compareGames(previous, current), {
    added: [],
    removed: [],
  });
});

test('normalizeIdeasResponse extracts stable LEGO idea records sorted by uuid', () => {
  assert.deepEqual(normalizeIdeasResponse(LEGO_API_RESPONSE), [
    {
      uuid: 'alpha-uuid',
      title: 'Alpha Build',
      creator: 'AlphaBuilder',
      supportCount: 10000,
      publishedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      url: 'https://ideas.lego.com/projects/alpha-uuid',
    },
    {
      uuid: 'beta-uuid',
      title: 'Beta Build',
      creator: 'BetaBuilder',
      supportCount: 10001,
      publishedAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-02T00:00:00.000Z',
      url: 'https://ideas.lego.com/projects/beta-uuid',
    },
  ]);
});

test('normalizeIdeasResponse refuses an empty LEGO result', () => {
  assert.throws(
    () => normalizeIdeasResponse({ productIdeas: [] }),
    /LEGO Ideas returned zero approved ideas/,
  );
});

test('compareIdeas reports only newly approved ideas by uuid', () => {
  const previous: LegoIdea[] = [
    {
      uuid: 'alpha-uuid',
      title: 'Alpha Build',
      creator: 'AlphaBuilder',
      supportCount: null,
      publishedAt: null,
      updatedAt: null,
      url: 'https://ideas.lego.com/projects/alpha-uuid',
    },
    {
      uuid: 'removed-uuid',
      title: 'Removed Build',
      creator: 'RemovedBuilder',
      supportCount: null,
      publishedAt: null,
      updatedAt: null,
      url: 'https://ideas.lego.com/projects/removed-uuid',
    },
  ];
  const current: LegoIdea[] = [
    {
      uuid: 'alpha-uuid',
      title: 'Alpha Build Updated',
      creator: 'AlphaBuilder',
      supportCount: null,
      publishedAt: null,
      updatedAt: null,
      url: 'https://ideas.lego.com/projects/alpha-uuid',
    },
    {
      uuid: 'beta-uuid',
      title: 'Beta Build',
      creator: 'BetaBuilder',
      supportCount: null,
      publishedAt: null,
      updatedAt: null,
      url: 'https://ideas.lego.com/projects/beta-uuid',
    },
  ];

  assert.deepEqual(compareIdeas(previous, current), {
    added: [current[1]],
  });
});

test('LEGO getCurrentState rejects non-success responses', async () => {
  await assert.rejects(
    legoApprovedIdeasNotifier.getCurrentState({
      fetchImpl: async () => new Response('', { status: 503, statusText: 'Unavailable' }),
    }),
    /LEGO Ideas request failed: 503 Unavailable/,
  );
});

test('runNotifier preserves the old snapshot when LEGO returns zero ideas', async () => {
  const { directory, snapshotFile } = await tempLegoSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const previousContents = JSON.stringify([
    {
      uuid: 'alpha-uuid',
      title: 'Alpha Build',
      creator: 'AlphaBuilder',
      supportCount: 10000,
      publishedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      url: 'https://ideas.lego.com/projects/alpha-uuid',
    },
  ], null, 2);
  await fs.writeFile(snapshotFile, previousContents, 'utf8');

  await assert.rejects(
    runNotifier(legoNotifierForTest(snapshotFile), {
      fetchImpl: jsonFetch({ productIdeas: [] }),
      webhookUrl: 'https://discord.example/webhook',
    }),
    /LEGO Ideas returned zero approved ideas/,
  );
  assert.equal(await fs.readFile(snapshotFile, 'utf8'), previousContents);
});

test('buildLegoDiscordMessage includes newly approved ideas', () => {
  const message = buildLegoDiscordMessage({
    changes: {
      added: [
        {
          uuid: 'beta-uuid',
          title: 'Beta Build',
          creator: 'BetaBuilder',
          supportCount: 10001,
          publishedAt: null,
          updatedAt: null,
          url: 'https://ideas.lego.com/projects/beta-uuid',
        },
      ],
    },
    currentState: normalizeIdeasResponse(LEGO_API_RESPONSE),
  });

  assert.equal(message.username, 'LEGO Approved Ideas');
  assert.equal(message.content, '@everyone');
  assert.deepEqual(message.allowed_mentions, { parse: ['everyone'] });
  assert.equal(message.embeds[0]?.title, 'New LEGO Ideas Approved');
  assert.match(message.embeds[0]?.description ?? '', /currently \*\*2\*\* approved ideas/);
  assert.equal((message.embeds[0] as DiscordEmbedWithFooter | undefined)?.footer, undefined);
  assert.deepEqual(message.embeds[0]?.fields, [
    {
      name: 'Newly Approved',
      value: '[Beta Build](https://ideas.lego.com/projects/beta-uuid) by BetaBuilder - 10,001 supporters',
    },
  ]);
});

test('buildLegoDiscordMessage uses singular approved idea text', () => {
  const currentState = [normalizeIdeasResponse(LEGO_API_RESPONSE)[0]!];
  const message = buildLegoDiscordMessage({
    changes: { added: currentState },
    currentState,
  });

  assert.match(message.embeds[0]?.description ?? '', /currently \*\*1\*\* approved idea\./);
  assert.doesNotMatch(message.embeds[0]?.description ?? '', /1\*\* approved ideas/);
});

test('runNotifier sends Discord before creating a baseline snapshot', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const events: string[] = [];
  let payload: DiscordMessage | undefined;
  const fetchImpl: FetchImpl = async (url, options) => {
    if (String(url).startsWith('https://discord.example/webhook')) {
      events.push('discord');
      payload = JSON.parse(String(options?.body)) as DiscordMessage;
      await assert.rejects(fs.access(snapshotFile), /ENOENT/);
      return new Response(null, { status: 204 });
    }

    return htmlFetch(ALPHA_HTML)(url, options);
  };

  const result = await runNotifier(steamNotifierForTest(snapshotFile), {
    fetchImpl,
    webhookUrl: 'https://discord.example/webhook',
  });

  assert.equal(result.status, 'baseline-created');
  assert.deepEqual(events, ['discord']);
  assert.equal(payload?.username, 'Steam Free Games');
  assert.equal(payload?.content, '@everyone');
  assert.deepEqual(payload?.allowed_mentions, { parse: ['everyone'] });
  assert.equal(payload?.embeds[0]?.title, 'Steam Free Games Changed');
  assert.deepEqual(payload?.embeds[0]?.fields, [
    {
      name: 'Newly Free',
      value: '[Alpha Game](https://store.steampowered.com/app/100/Alpha_Game/)',
    },
  ]);
  assert.deepEqual(JSON.parse(await fs.readFile(snapshotFile, 'utf8')), [
    {
      appId: '100',
      name: 'Alpha Game',
      url: 'https://store.steampowered.com/app/100/Alpha_Game/',
    },
  ]);
});

test('runNotifier does not create a baseline snapshot when Discord fails', async () => {
  const { directory, snapshotFile } = await tempSnapshotFile();
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const fetchImpl: FetchImpl = async (url, options) => {
    if (String(url).startsWith('https://discord.example/webhook')) {
      await assert.rejects(fs.access(snapshotFile), /ENOENT/);
      return new Response('server error', { status: 500 });
    }

    return htmlFetch(ALPHA_HTML)(url, options);
  };

  await assert.rejects(
    runNotifier(steamNotifierForTest(snapshotFile), {
      fetchImpl,
      webhookUrl: 'https://discord.example/webhook',
    }),
    /Discord webhook failed: 500 server error/,
  );
  await assert.rejects(fs.access(snapshotFile), /ENOENT/);
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
  const requestedUrls: string[] = [];
  const fetchImpl: FetchImpl = async url => {
    requestedUrls.push(String(url));
    if (String(url).startsWith('https://discord.example/webhook')) {
      return new Response(null, { status: 204 });
    }
    return htmlFetch(ALPHA_BETA_HTML)(url);
  };

  const result = await runNotifier(steamNotifierForTest(snapshotFile), {
    fetchImpl,
    webhookUrl: 'https://discord.example/webhook',
  });

  assert.equal(result.status, 'changed');
  assert.deepEqual(result.added.map(game => game.appId), ['200']);
  assert.equal(requestedUrls.at(-1), 'https://discord.example/webhook');
  assert.deepEqual(
    JSON.parse(await fs.readFile(snapshotFile, 'utf8')).map((game: SteamGame) => game.appId),
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
  const fetchImpl: FetchImpl = async url => {
    if (String(url).startsWith('https://discord.example/webhook')) {
      return new Response('server error', { status: 500 });
    }
    return htmlFetch(ALPHA_BETA_HTML)(url);
  };

  await assert.rejects(
    runNotifier(steamNotifierForTest(snapshotFile), {
      fetchImpl,
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
      webhookUrl: 'https://discord.example/webhook',
    }),
    /Steam returned zero games/,
  );
  assert.equal(await fs.readFile(snapshotFile, 'utf8'), previousContents);
});

test('sendDiscordMessage posts a notifier-built Discord payload', async () => {
  let payload: DiscordMessage | undefined;
  const fetchImpl: FetchImpl = async (_url, options) => {
    payload = JSON.parse(String(options?.body)) as DiscordMessage;
    return new Response(null, { status: 204 });
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
      previousState: [],
    }),
    webhookUrl: 'https://discord.example/webhook',
  });

  assert.equal(payload?.username, 'Steam Free Games');
  assert.equal(payload?.content, '@everyone');
  assert.deepEqual(payload?.allowed_mentions, { parse: ['everyone'] });
  assert.equal(payload?.embeds[0]?.title, 'Steam Free Games Changed');
  assert.match(payload?.embeds[0]?.description ?? '', /currently \*\*2\*\* games/);
  assert.equal((payload?.embeds[0] as DiscordEmbedWithFooter | undefined)?.footer, undefined);
  assert.deepEqual(payload?.embeds[0]?.fields, [
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

test('buildSteamDiscordMessage uses singular game text', () => {
  const currentState = [
    { appId: '100', name: 'Alpha Game', url: 'https://store.steampowered.com/app/100/Alpha_Game/' },
  ];
  const message = steamFreeGamesNotifier.buildDiscordMessage({
    changes: { added: currentState, removed: [] },
    currentState,
    previousState: [],
  });

  assert.match(message.embeds[0]?.description ?? '', /currently \*\*1\*\* game on the page\./);
  assert.doesNotMatch(message.embeds[0]?.description ?? '', /1\*\* games/);
});

test('sendDiscordMessage rejects missing webhook configuration', async () => {
  await assert.rejects(
    sendDiscordMessage({
      fetchImpl: async () => new Response(null, { status: 204 }),
      message: { username: 'Test', embeds: [] },
      webhookUrl: '',
    }),
    /Discord webhook URL has not been configured/,
  );
});

test('sendDiscordMessage rejects Discord non-success responses', async () => {
  await assert.rejects(
    sendDiscordMessage({
      fetchImpl: async () => new Response('rate limited', { status: 429 }),
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

test('runSelectedNotifiers continues after a notifier returns a non-ideal result', async () => {
  const calls: string[] = [];
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'selected-notifiers-'));
  test.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const originalWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const originalFetch = globalThis.fetch;
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
  globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
  test.after(() => {
    if (originalWebhookUrl === undefined) {
      delete process.env.DISCORD_WEBHOOK_URL;
    } else {
      process.env.DISCORD_WEBHOOK_URL = originalWebhookUrl;
    }
    globalThis.fetch = originalFetch;
  });
  const first = {
    id: 'first-notifier',
    name: 'First Notifier',
    async getCurrentState() {
      calls.push('first');
      throw new Error('external page returned no results');
    },
  };
  const second = {
    id: 'second-notifier',
    name: 'Second Notifier',
    schedule: '0 10 * * *',
    timezone: 'America/Chicago',
    snapshotFile: path.join(directory, 'second.json'),
    async getCurrentState() {
      calls.push('second');
      return [{ id: 'baseline' }];
    },
    compare() {
      return { added: [] };
    },
    buildDiscordMessage() {
      return { username: 'Second Notifier', embeds: [] };
    },
  };

  const results = await runSelectedNotifiers({
    availableNotifiers: [first, second],
  });

  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(results[0]?.status, 'failed');
  assert.equal(results[0]?.notifierId, 'first-notifier');
  assert.match(String(results[0]?.error instanceof Error ? results[0].error.message : ''), /external page returned no results/);
  assert.equal(results[1]?.status, 'baseline-created');
});

test('runSelectedNotifiers does not send Discord for failed notifier results', async () => {
  const failingNotifier = {
    id: 'failing-notifier',
    name: 'Failing Notifier',
    async getCurrentState() {
      throw new Error('zero results');
    },
  };
  const originalWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.example/webhook';
  test.after(() => {
    if (originalWebhookUrl === undefined) {
      delete process.env.DISCORD_WEBHOOK_URL;
    } else {
      process.env.DISCORD_WEBHOOK_URL = originalWebhookUrl;
    }
  });

  const results = await runSelectedNotifiers({
    availableNotifiers: [failingNotifier],
  });

  assert.equal(results[0]?.status, 'failed');
  assert.equal(results[0]?.error instanceof Error ? results[0].error.message : '', 'zero results');
});

test('all registered notifiers run daily at 10 AM Central Time', () => {
  assert.deepEqual(
    notifiers.map(notifier => ({
      id: notifier.id,
      schedule: notifier.schedule,
      timezone: notifier.timezone,
    })),
    [
      {
        id: 'steam-free-games',
        schedule: '0 10 * * *',
        timezone: 'America/Chicago',
      },
      {
        id: 'lego-approved-ideas',
        schedule: '0 10 * * *',
        timezone: 'America/Chicago',
      },
    ],
  );
});

test('package entrypoint points at the compiled notifier framework', async () => {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { main: string };

  assert.equal(packageJson.main, 'dist/src/index.js');
});
