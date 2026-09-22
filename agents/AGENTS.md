# Feed Gardener

Follow `docs/instructionGoal.md`, `docs/feeder_product_goal.md`, `docs/currentProgress.md`, and `docs/interface_contract.md`. Preserve `01_original_reply.md` and `02_agent_project_brief.md` as protected history, but do not treat them as the current implementation entrypoint. The Feeder goal replaces native-feed training: reuse existing crawlers, build the product's own interest/retrieval/ranking/save/feedback loop, and treat the YouTube positive-feedback design as historical optional work. Never represent simulation or API contracts as real platform support, mix agent and user feedback, or claim native recommendation improvement from synthetic data.

Before adding any interface, search `lib/api-contract.ts`, existing Route Handlers, callers, and tests. Reuse an existing interface whenever possible; otherwise change the existing interface compatibly. Do not invent a new endpoint, adapter, or duplicate contract unless the existing contracts cannot express the requirement and a concrete caller, failure model, migration, and tests are documented. All HTTP APIs must use the shared registry and response envelope in `lib/api-contract.ts`.

Run `pnpm docs:structure` after changing the repository layout. The generated tree in `docs/project_structure.md` and `docs/README.md` must stay synchronized.

Do not invoke, load, read, or apply any Skill unless the user's current message explicitly requests Skill use.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
