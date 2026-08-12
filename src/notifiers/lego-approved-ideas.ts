import type { DiscordMessage, FetchImpl, Notifier, NotifierChanges } from '../types.js';

export interface LegoIdea {
  uuid: string;
  title: string;
  creator: string;
  supportCount: number | null;
  publishedAt: string | null;
  updatedAt: string | null;
  url: string;
}

export interface LegoIdeaChanges extends NotifierChanges {
  added: LegoIdea[];
}

interface LegoIdeaApiRecord {
  id?: unknown;
  attributes?: {
    uuid?: unknown;
    title?: unknown;
    creator?: {
      attributes?: {
        alias?: unknown;
      };
    };
    support_count?: unknown;
    published_at?: unknown;
    updated_at?: unknown;
  };
}

export const LEGO_APPROVED_IDEAS_API_URL =
  'https://ideas.lego.com/api/product_ideas?limit=48&offset=0&sort=-most_recent&phases=approved';
export const LEGO_APPROVED_IDEAS_PAGE_URL =
  'https://ideas.lego.com/product-ideas?milestones=approved';

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeIdeasResponse(payload: unknown): LegoIdea[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { productIdeas?: unknown }).productIdeas)
  ) {
    throw new Error('LEGO Ideas response did not include a productIdeas array.');
  }

  const productIdeas = (payload as { productIdeas: LegoIdeaApiRecord[] }).productIdeas;
  const ideasByUuid = new Map<string, LegoIdea>();

  for (const idea of productIdeas) {
    const attributes = idea?.attributes ?? {};
    const uuid = asStringOrNull(attributes.uuid) ?? asStringOrNull(idea?.id);
    const title = asStringOrNull(attributes.title);

    if (!uuid || !title) {
      continue;
    }

    if (!ideasByUuid.has(uuid)) {
      ideasByUuid.set(uuid, {
        uuid,
        title,
        creator:
          asStringOrNull(attributes.creator?.attributes?.alias) ?? 'Unknown creator',
        supportCount: asNumberOrNull(attributes.support_count),
        publishedAt: asStringOrNull(attributes.published_at),
        updatedAt: asStringOrNull(attributes.updated_at),
        url: `https://ideas.lego.com/projects/${uuid}`,
      });
    }
  }

  const ideas = [...ideasByUuid.values()].sort((left, right) =>
    left.uuid.localeCompare(right.uuid),
  );

  if (ideas.length === 0) {
    throw new Error(
      'LEGO Ideas returned zero approved ideas. Refusing to overwrite the existing snapshot.',
    );
  }

  return ideas;
}

export function compareIdeas(
  previous: LegoIdea[],
  current: LegoIdea[],
): LegoIdeaChanges {
  const previousUuids = new Set(previous.map(idea => idea.uuid));

  return {
    added: current.filter(idea => !previousUuids.has(idea.uuid)),
  };
}

function formatIdeaForDiscord(idea: LegoIdea): string {
  const supportText = idea.supportCount !== null && Number.isFinite(idea.supportCount)
    ? ` - ${idea.supportCount.toLocaleString('en-US')} supporters`
    : '';

  return `[${idea.title}](${idea.url}) by ${idea.creator}${supportText}`;
}

export async function getCurrentState({
  fetchImpl = fetch,
}: { fetchImpl?: FetchImpl | undefined } = {}): Promise<LegoIdea[]> {
  const response = await fetchImpl(LEGO_APPROVED_IDEAS_API_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LegoApprovedIdeasMonitor/1.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `LEGO Ideas request failed: ${response.status} ${response.statusText}`,
    );
  }

  return normalizeIdeasResponse(await response.json());
}

export function buildDiscordMessage({
  changes,
  currentState,
}: {
  changes: LegoIdeaChanges;
  currentState: LegoIdea[];
}): DiscordMessage {
  return {
    username: 'LEGO Approved Ideas',
    embeds: [
      {
        title: 'New LEGO Ideas Approved',
        url: LEGO_APPROVED_IDEAS_PAGE_URL,
        description:
          `The LEGO Ideas approved list changed. ` +
          `There are currently **${currentState.length}** approved ideas.`,
        fields: [
          {
            name: 'Newly Approved',
            value: changes.added
              .map(formatIdeaForDiscord)
              .join('\n')
              .slice(0, 1024),
          },
        ],
        footer: {
          text: 'LEGO Ideas Monitor',
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

const legoApprovedIdeasNotifier: Notifier<LegoIdea[], LegoIdeaChanges> = {
  id: 'lego-approved-ideas',
  name: 'LEGO Approved Ideas',
  schedule: '0 10 * * *',
  timezone: 'America/Chicago',
  snapshotFile: 'snapshots/lego-approved-ideas.json',
  getCurrentState,
  compare: compareIdeas,
  buildDiscordMessage,
};

export default legoApprovedIdeasNotifier;
