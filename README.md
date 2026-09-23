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

## Illustrated walkthrough: from tags to a fetched feed

The screenshots below come from a local run on September 23, 2026. They show one reproducible path through the interface. Public-source results and Jev scores can change between runs; the counts below describe this run only. A fresh browser profile opens the three-step introduction. If you already have local preferences, use **Manage interests** from Discover to edit the same tags instead.

1. **Open the app.** Run `pnpm dev`, visit `http://localhost:3000`, and choose **Let's find your world**. This introduces the local feed setup.

   ![First-run welcome screen](docs/images/discovery-walkthrough/01-welcome.jpg)

2. **Choose an interest area.** The world picker lists broad areas. Open **Technology**; it reveals narrower groups such as **AI infrastructure** and **Developer tools**.

   <img src="docs/images/discovery-walkthrough/02-choose-world.jpg" alt="Choose a world screen with Technology among the available areas" width="350"> <img src="docs/images/discovery-walkthrough/03-technology-groups.jpg" alt="Technology interest groups" width="350">

3. **Select specific tags.** Expand **AI infrastructure**, select **Local inference** and **Agents**, and confirm that the footer says **2 interests picked**. These tags become the feed's selected interests. Continue with **Next: less of this**.

   ![Local inference and Agents selected](docs/images/discovery-walkthrough/04-tags-selected.jpg)

4. **Set an exclusion.** The last onboarding screen is optional. For this run, search for “Gaming,” select the **Game reviews** topic, and choose **Enter my feed**. The selected interests and the exclusion are different settings: an excluded topic remains a hard boundary even when an item otherwise matches an interest.

   <img src="docs/images/discovery-walkthrough/05-exclusion-step.jpg" alt="Optional exclusion search" width="350"> <img src="docs/images/discovery-walkthrough/06-exclusion-selected.jpg" alt="Game reviews excluded" width="350">

5. **Inspect Discovery before changing its controls.** The **For you** view shows the chosen tags. Before fetching, the Jev average is blank and the feed prompts you to fetch public sources.

   ![Discovery before tuning](docs/images/discovery-walkthrough/07-before-configuration.jpg)

6. **Tune the feed, then capture the before state.** Turn on **Include any selected topic** and set **Choose target average** to **7**. Leave **Include all selected topics** and **Exclude unselected topics** off for this example. The first control accepts an item matching either selected topic; the target is the minimum average title-relevance score requested for displayed items. The screenshot still shows **0 of 0 candidates scored** because no fetch has started.

   ![Configured Discovery before fetching public sources](docs/images/discovery-walkthrough/08-before-harvest.jpg)

7. **Fetch and compare.** Click **Fetch public sources** and wait for the button to become **Refresh sources** and for scoring to finish. In this run the interface reported **103 fetched items**, **30** in the prioritized scoring batch, **30 of 30 scored**, **8 shown**, and **22 low-confidence results excluded**. The displayed feed's Jev average was **8.16/10**, so the target of **7** was reached. The full after screenshot includes the resulting cards; the closer view makes the counters readable.

   | Before fetch | After fetch |
   | --- | --- |
   | ![Before fetch: no candidates or score](docs/images/discovery-walkthrough/08-before-harvest.jpg) | ![After fetch: scored feed and content cards](docs/images/discovery-walkthrough/09-after-harvest.jpg) |

   ![After fetch: score and candidate counters](docs/images/discovery-walkthrough/10-after-harvest-summary.jpg)

8. **Inspect the result.** Each displayed card has its source link, a Jev title-relevance score, confidence, and a **Why this is here** disclosure. The example below shows a matched **Agents** interest and recency signal. The score describes Feeder's assessment of the title; it is not a source-platform score or a claim about the full article's quality.

   <img src="docs/images/discovery-walkthrough/11-after-harvest-items.jpg" alt="Fetched cards with source links and title scores" width="350"> <img src="docs/images/discovery-walkthrough/12-why-this-item.jpg" alt="Expanded recommendation explanation" width="350">

9. **Check where items came from.** Switch to **Sources** to see the source boards. This run showed **14 items ready** in **Research frontier** and **16 items ready** in **Open-source community** after the current matching rules. Opening **Research frontier** and selecting **arXiv** shows individual public items and their source links. Social radar remained at **0 items ready**: TikTok and X require individual public URL imports, while Instagram and YouTube require their documented connections.

   <img src="docs/images/discovery-walkthrough/13-source-overview.jpg" alt="Source boards and ready-item counts" width="350"> <img src="docs/images/discovery-walkthrough/14-arxiv-source.jpg" alt="arXiv source with fetched public items" width="350">

This walkthrough is a local UI run. It does not modify recommendations or activity on the source platforms. Browser preferences and feedback stay local; the CLI has separate state.

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
