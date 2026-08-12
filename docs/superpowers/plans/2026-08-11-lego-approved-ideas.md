# LEGO Approved Ideas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LEGO Ideas notifier that sends Discord messages only when newly approved ideas appear in the approved milestone API.

**Architecture:** Add one focused notifier module that fetches the LEGO JSON API, normalizes approved ideas, compares snapshots by UUID, and builds Discord payloads. Register the notifier in the existing registry and rely on `src/lib/runner.js` for baseline and snapshot safety.

**Tech Stack:** Node.js 18+, native `fetch`, ESM modules, Node built-in `node:test`, existing Discord notifier framework.

## Global Constraints

- Use `https://ideas.lego.com/api/product_ideas?limit=48&offset=0&sort=-most_recent&phases=approved` as the data source.
- Notify only for new approvals; ignore removals and metadata-only changes.
- First runs create a baseline snapshot and send no Discord message.
- Changed runs send Discord first, then update the snapshot only after Discord succeeds.
- Unchanged runs leave the existing snapshot untouched.
- Refuse to save a zero-idea API result.
- Use `snapshots/lego-approved-ideas.json` for runtime state.
- Register the notifier id as `lego-approved-ideas`.

---

## File Structure

- Create `src/notifiers/lego-approved-ideas.js`: LEGO API constants, normalization, comparison, Discord message builder, and default notifier export.
- Modify `src/notifiers/index.js`: import and register the LEGO notifier.
- Modify `test/notifier-framework.test.js`: add LEGO tests beside the existing Steam/framework tests.
- Modify `README.md`: document running the LEGO notifier and its schedule/safety behavior.

---

### Task 1: LEGO Notifier Core

**Files:**
- Create: `src/notifiers/lego-approved-ideas.js`
- Test: `test/notifier-framework.test.js`

**Interfaces:**
- Consumes: `runNotifier(notifier, options)` from `src/lib/runner.js` later in tests.
- Produces: `LEGO_APPROVED_IDEAS_API_URL`, `LEGO_APPROVED_IDEAS_PAGE_URL`, `normalizeIdeasResponse(payload)`, `compareIdeas(previous, current)`, `getCurrentState({ fetchImpl })`, `buildDiscordMessage({ changes, currentState })`, default notifier export.

- [ ] **Step 1: Add failing normalization and comparison tests**

Add imports:

```js
import {
  buildDiscordMessage as buildLegoDiscordMessage,
  compareIdeas,
  default as legoApprovedIdeasNotifier,
  normalizeIdeasResponse,
} from '../src/notifiers/lego-approved-ideas.js';
```

Add sample payload and tests:

```js
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
  const previous = [
    { uuid: 'alpha-uuid', title: 'Alpha Build' },
    { uuid: 'removed-uuid', title: 'Removed Build' },
  ];
  const current = [
    { uuid: 'alpha-uuid', title: 'Alpha Build Updated' },
    { uuid: 'beta-uuid', title: 'Beta Build' },
  ];

  assert.deepEqual(compareIdeas(previous, current), {
    added: [current[1]],
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because `src/notifiers/lego-approved-ideas.js` does not exist.

- [ ] **Step 3: Implement LEGO notifier core**

Create `src/notifiers/lego-approved-ideas.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify core passes**

Run: `npm test`

Expected: PASS for new normalization and comparison tests; any later-task tests are not added yet.

---

### Task 2: Fetching, Discord Message, and Snapshot Safety Tests

**Files:**
- Modify: `src/notifiers/lego-approved-ideas.js`
- Modify: `test/notifier-framework.test.js`

**Interfaces:**
- Consumes: `normalizeIdeasResponse(payload)`, `compareIdeas(previous, current)`.
- Produces: `getCurrentState({ fetchImpl = fetch } = {})`, `buildDiscordMessage({ changes, currentState })`, default notifier export.

- [ ] **Step 1: Add failing fetch/message/runner tests**

Add helpers:

```js
function jsonFetch(payload) {
  return async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  });
}

async function tempLegoSnapshotFile() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lego-ideas-monitor-'));
  return {
    directory,
    snapshotFile: path.join(directory, 'lego-approved-ideas.json'),
  };
}

function legoNotifierForTest(snapshotFile) {
  return {
    ...legoApprovedIdeasNotifier,
    snapshotFile,
  };
}
```

Add tests:

```js
test('LEGO getCurrentState rejects non-success responses', async () => {
  await assert.rejects(
    legoApprovedIdeasNotifier.getCurrentState({
      fetchImpl: async () => ({ ok: false, status: 503, statusText: 'Unavailable' }),
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
      logger: null,
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
          url: 'https://ideas.lego.com/projects/beta-uuid',
        },
      ],
    },
    currentState: normalizeIdeasResponse(LEGO_API_RESPONSE),
  });

  assert.equal(message.username, 'LEGO Approved Ideas');
  assert.equal(message.embeds[0].title, 'New LEGO Ideas Approved');
  assert.match(message.embeds[0].description, /currently \*\*2\*\* approved ideas/);
  assert.deepEqual(message.embeds[0].fields, [
    {
      name: 'Newly Approved',
      value: '[Beta Build](https://ideas.lego.com/projects/beta-uuid) by BetaBuilder - 10,001 supporters',
    },
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: FAIL because `getCurrentState`, `buildDiscordMessage`, or default export are incomplete.

- [ ] **Step 3: Implement fetching, message builder, and default export**

Append to `src/notifiers/lego-approved-ideas.js`:

```js
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test`

Expected: PASS.

---

### Task 3: Registry and Documentation

**Files:**
- Modify: `src/notifiers/index.js`
- Modify: `README.md`
- Test: `test/notifier-framework.test.js`

**Interfaces:**
- Consumes: default export from `src/notifiers/lego-approved-ideas.js`.
- Produces: enabled `notifiers` array containing Steam and LEGO notifiers.

- [ ] **Step 1: Register the notifier**

Change `src/notifiers/index.js` to:

```js
import legoApprovedIdeas from './lego-approved-ideas.js';
import steamFreeGames from './steam-free-games.js';

export const notifiers = [steamFreeGames, legoApprovedIdeas];
```

- [ ] **Step 2: Update README**

Add `npm start -- lego-approved-ideas` to the one-notifier examples. Update the schedule section to say Steam and LEGO both run daily at 10:00 AM Central Time. Update snapshot safety to mention Steam zero-game and LEGO zero-idea guards.

- [ ] **Step 3: Run all tests**

Run: `npm test`

Expected: PASS.

---

## Self-Review

- Spec coverage: Data source, normalization, UUID-only additions, Discord copy, registration, README, and tests are covered by Tasks 1-3.
- Placeholder scan: No placeholders remain.
- Type consistency: `uuid`, `title`, `creator`, `supportCount`, `publishedAt`, `updatedAt`, and `url` are consistent across tests, implementation, and Discord formatting.
