import * as cheerio from 'cheerio';
import type { DiscordMessage, FetchImpl, Notifier, NotifierChanges } from '../types.js';

export interface SteamGame {
  appId: string;
  name: string;
  url: string;
}

export interface SteamGameChanges extends NotifierChanges {
  added: SteamGame[];
  removed: SteamGame[];
}

export const STEAM_URL =
  'https://store.steampowered.com/search/?hwtype=0&maxprice=free&category1=998&specials=1&ndl=1';

export function normalizeSteamUrl(rawUrl: string): string {
  return rawUrl.split('?')[0] ?? rawUrl;
}

export function getGameId(url: string): string {
  const appIdMatch = url.match(/store\.steampowered\.com\/app\/(\d+)/);
  return appIdMatch?.[1] ?? url;
}

export function parseFreeGames(html: string): SteamGame[] {
  const $ = cheerio.load(html);
  const gamesById = new Map<string, SteamGame>();

  $('a.search_result_row').each((_, element) => {
    const row = $(element);
    const name = row.find('.title').text().trim();
    const rawUrl = row.attr('href');

    if (!name || !rawUrl) {
      return;
    }

    const url = normalizeSteamUrl(rawUrl);
    const appId = getGameId(url);

    if (!gamesById.has(appId)) {
      gamesById.set(appId, { appId, name, url });
    }
  });

  const games = [...gamesById.values()].sort((left, right) =>
    left.appId.localeCompare(right.appId),
  );

  if (games.length === 0) {
    throw new Error(
      'Steam returned zero games. Refusing to overwrite the existing snapshot.',
    );
  }

  return games;
}

export function compareGames(
  previous: SteamGame[],
  current: SteamGame[],
): SteamGameChanges {
  const previousIds = new Set(previous.map(game => game.appId));
  const currentIds = new Set(current.map(game => game.appId));

  return {
    added: current.filter(game => !previousIds.has(game.appId)),
    removed: previous.filter(game => !currentIds.has(game.appId)),
  };
}

export async function getCurrentState({
  fetchImpl = fetch,
}: { fetchImpl?: FetchImpl | undefined } = {}): Promise<SteamGame[]> {
  const response = await fetchImpl(STEAM_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SteamFreeGamesMonitor/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Steam request failed: ${response.status} ${response.statusText}`);
  }

  return parseFreeGames(await response.text());
}

export function buildDiscordMessage({
  changes,
  currentState,
}: {
  changes: SteamGameChanges;
  currentState: SteamGame[];
}): DiscordMessage {
  const fields = [];
  const gameText = currentState.length === 1 ? 'game' : 'games';

  if (changes.added.length > 0) {
    fields.push({
      name: 'Newly Free',
      value: changes.added
        .map(game => `[${game.name}](${game.url})`)
        .join('\n')
        .slice(0, 1024),
    });
  }

  if (changes.removed.length > 0) {
    fields.push({
      name: 'No Longer Free',
      value: changes.removed
        .map(game => game.name)
        .join('\n')
        .slice(0, 1024),
    });
  }

  return {
    username: 'Steam Free Games',
    content: '@everyone',
    allowed_mentions: {
      parse: ['everyone'],
    },
    embeds: [
      {
        title: 'Steam Free Games Changed',
        url: STEAM_URL,
        description:
          `Steam's free-game promotion list changed. ` +
          `There are currently **${currentState.length}** ${gameText} on the page.`,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

const steamFreeGamesNotifier: Notifier<SteamGame[], SteamGameChanges> = {
  id: 'steam-free-games',
  name: 'Steam Free Games',
  schedule: '0 10 * * *',
  timezone: 'America/Chicago',
  snapshotFile: 'snapshots/steam-free-games.json',
  getCurrentState,
  compare: compareGames,
  buildDiscordMessage,
};

export default steamFreeGamesNotifier;
