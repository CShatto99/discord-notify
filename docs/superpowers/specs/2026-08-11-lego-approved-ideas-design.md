# LEGO Approved Ideas Notifier Design

## Goal

Add a notifier that monitors newly approved LEGO Ideas projects from the LEGO Ideas approved milestone API and posts to Discord when a project appears that was not present in the previous snapshot.

The notifier should only alert for new approvals. Removals from the approved list and metadata-only changes should not trigger Discord messages.

## Existing Architecture

The repository already provides a notifier framework:

- `src/lib/runner.js` creates first-run baselines without Discord.
- Changed runs send Discord before writing the new snapshot.
- Unchanged runs leave snapshots untouched.
- Notifier modules own fetching current state, comparing snapshots, building Discord payloads, and schedule metadata.
- Enabled notifiers are registered in `src/notifiers/index.js`.

The LEGO notifier should follow this pattern and require no framework changes.

## Data Source

Use the LEGO Ideas API endpoint:

```text
https://ideas.lego.com/api/product_ideas?limit=48&offset=0&sort=-most_recent&phases=approved
```

The endpoint currently returns JSON with a `productIdeas` array and `totalProductIdeas`. Each item includes a stable project UUID in `id` and `attributes.uuid`, plus title, creator alias, support count, publish timestamp, update timestamp, state, and attachments.

The notifier will fetch the API directly instead of scraping the public page because structured JSON is less brittle than HTML parsing.

## Normalized State

Store each approved idea as:

```js
{
  uuid,
  title,
  creator,
  supportCount,
  publishedAt,
  updatedAt,
  url,
}
```

Use `idea.attributes.uuid` when available and fall back to `idea.id`. Use `https://ideas.lego.com/projects/${uuid}` as the project URL.

Sort normalized ideas by UUID so reordered API responses do not change snapshot order.

If the API response is not successful, if JSON parsing fails, if `productIdeas` is not an array, or if normalization yields zero ideas, throw an error. The zero-result guard prevents transient API or response-shape failures from overwriting a valid snapshot as an empty approved list.

## Change Detection

Compare previous and current snapshots by `uuid`.

Return only:

```js
{ added: [...] }
```

Ignore removed projects and metadata-only updates. This matches the requested behavior: notify only when a new project is approved.

## Discord Message

When new approvals exist, build one Discord payload:

- `username`: `LEGO Approved Ideas`
- Embed title: `New LEGO Ideas Approved`
- Embed URL: `https://ideas.lego.com/product-ideas?milestones=approved`
- Description: mention the count of currently approved ideas.
- Field name: `Newly Approved`
- Field value: Markdown links to the added project URLs, including creator alias and support count when available.
- Footer: `LEGO Ideas Monitor`
- Timestamp: current ISO timestamp.

## Notifier Metadata

Add `src/notifiers/lego-approved-ideas.js` with:

```js
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

Register it in `src/notifiers/index.js` so `npm start` runs both notifiers and `npm start -- lego-approved-ideas` runs only this notifier.

## Testing

Add tests using injected `fetchImpl` and temp snapshot files, consistent with existing tests:

- Normalize LEGO API JSON into stable idea records sorted by UUID.
- Reject zero normalized ideas.
- Compare reports only additions by UUID.
- Compare ignores removals and metadata-only changes.
- `getCurrentState` rejects non-success responses.
- `runNotifier` preserves the old snapshot when LEGO normalization yields zero ideas.
- Discord payload includes the expected username, embed title, count, and newly approved field.

Run verification with `npm test`.

## Documentation

Update `README.md` to mention:

- `npm start -- lego-approved-ideas`
- The LEGO notifier runs daily at 10:00 AM Central Time.
- The LEGO notifier refuses to save a zero-idea API result.
