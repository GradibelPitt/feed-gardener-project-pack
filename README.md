# Feeder

Feeder is a local-first discovery and read-later workspace that helps you build a feed around your own interests. It collects public content from multiple sources, applies your explicit filters, and uses optional Jev title scoring to shape the feed you asked for.

Your interests and feedback belong to Feeder. The app does not train or modify another platform's recommendation system.

## What it does

- **Discover across sources.** Fetch public candidates from arXiv, GitHub, Hacker News, and configured YouTube search. Public TikTok and X links can be imported individually.
- **Control relevance.** Choose a target average from 1 to 10. Feeder scores eligible titles in batches, shows the actual average, and reports when the target cannot be reached.
- **Set hard boundaries.** Selected interests guide discovery; blocked topics and sources stay excluded.
- **Understand each recommendation.** Every item can explain which interests, source, and freshness signals placed it in the feed.
- **Keep and refine.** Save items for later, hide them, mark them as not interesting, and undo feedback. These actions affect only your Feeder experience.
- **Manage a local library.** Save discovered items or any HTTP(S) link with a type, note, and reading status.

## How it works

```text
Choose interests and exclusions
        ↓
Fetch public candidates on demand
        ↓
Normalize, deduplicate, and apply hard filters
        ↓
Rank the eligible titles and build the requested feed
        ↓
Open, save, hide, or reject items to refine the next feed
```

Jev scores title relevance only. A score is not proof that the full content is relevant or high quality. Feeder shows missing scores, low confidence, source failures, and insufficient candidates instead of inventing results.

## Run locally

Requirements: Node.js 22.13 or newer and pnpm 11.19.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). On macOS, you can also double-click `Launch.command`.

The core local experience works without an account or database. Optional Jev, YouTube Search, Instagram oEmbed, and read-only YouTube connection settings are documented in [`.env.example`](.env.example).

## Command line

The CLI uses the same domain logic and stores its data separately from the browser app.

```sh
pnpm cli -- help
```

## Project status

Feeder is a local prototype. arXiv, GitHub, and Hacker News collection, local preferences, title-based feed assembly, reversible feedback, saved items, and the resource library are implemented. YouTube search and Jev scoring require their respective API keys. Recommendation quality has not yet been validated with a real-user study.

Feeder does not read platform cookies, autoplay content, write likes or subscriptions, or claim to improve native recommendations on YouTube, TikTok, or other services.

## Documentation

- [Product goal and architecture](docs/feeder_product_goal.md)
- [API contract](docs/interface_contract.md)
- [Project structure](docs/project_structure.md)

## Development checks

```sh
pnpm typecheck
pnpm test
pnpm build
```
