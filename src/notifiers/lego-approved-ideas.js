export const LEGO_APPROVED_IDEAS_API_URL =
  'https://ideas.lego.com/api/product_ideas?limit=48&offset=0&sort=-most_recent&phases=approved';
export const LEGO_APPROVED_IDEAS_PAGE_URL =
  'https://ideas.lego.com/product-ideas?milestones=approved';

export function normalizeIdeasResponse(payload) {
  if (!Array.isArray(payload?.productIdeas)) {
    throw new Error('LEGO Ideas response did not include a productIdeas array.');
  }

  const ideasByUuid = new Map();

  for (const idea of payload.productIdeas) {
    const attributes = idea?.attributes ?? {};
    const uuid = attributes.uuid ?? idea?.id;
    const title = attributes.title;

    if (!uuid || !title) {
      continue;
    }

    if (!ideasByUuid.has(uuid)) {
      ideasByUuid.set(uuid, {
        uuid,
        title,
        creator: attributes.creator?.attributes?.alias ?? 'Unknown creator',
        supportCount: attributes.support_count ?? null,
        publishedAt: attributes.published_at ?? null,
        updatedAt: attributes.updated_at ?? null,
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

export function compareIdeas(previous, current) {
  const previousUuids = new Set(previous.map(idea => idea.uuid));

  return {
    added: current.filter(idea => !previousUuids.has(idea.uuid)),
  };
}

function formatIdeaForDiscord(idea) {
  const supportText = Number.isFinite(idea.supportCount)
    ? ` - ${idea.supportCount.toLocaleString('en-US')} supporters`
    : '';

  return `[${idea.title}](${idea.url}) by ${idea.creator}${supportText}`;
}

export async function getCurrentState({ fetchImpl = fetch } = {}) {
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

export function buildDiscordMessage({ changes, currentState }) {
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

export default {
  id: 'lego-approved-ideas',
  name: 'LEGO Approved Ideas',
  schedule: '0 10 * * *',
  timezone: 'America/Chicago',
  snapshotFile: 'snapshots/lego-approved-ideas.json',
  getCurrentState,
  compare: compareIdeas,
  buildDiscordMessage,
};
