# Makerspace Knowledge Base

A small search app over a makerspace's accumulated machine manuals, safety guides, FAQs, and policies. Staff type a question or keywords and get back the most relevant passages with their source document.

Built for a take-home assessment. Stack, database, ingestion design, docker approach was discussed and explicitly chosen/approved by me; implementation was done with AI assistance (Claude Code). Full breakdown in [AI usage](#ai-usage) once the build is complete.

## Stack

- **Next.js (App Router) + TypeScript** - one process serves both the frontend and the API, which keeps run-ability to a single command.
- **SQLite via `better-sqlite3` (FTS5 for full-text search)** - no separate DB server, so "survives a restart" is just one file on a volume, and no second service in Docker. Not Node's built-in `node:sqlite`: confirmed it ships without FTS5, so it can't do full-text search.
- **Ingestion/check scripts as plain CommonJS JavaScript**, not TypeScript - they run with plain `node`, no `tsx`/`ts-node` needed in or out of Docker.
- **Docker: multi-stage, without Next's `output: 'standalone'`.** Standalone's file-tracing can miss native addons like `better-sqlite3`'s compiled binary. Simpler than working around that: skip it, and have the final stage run its own normal `pnpm install --prod` instead.

## Setup and run

**Local (pnpm):**
```bash
pnpm install
node scripts/ingest.js   # ingest corpus/ into ./data/app.db
pnpm dev                 # http://localhost:3000
node scripts/check.js    # run the search check questions
```

**Docker:** _(instructions to follow once the Docker setup is written and tested)_

## The Corpus

The provided 14-document corpus is deliberately mixed quality:

- **Duplicate content under different filenames** - `woodworking_manual.md` and `woodworking_manual_final_v2.md` are byte-identical. The ingestion pipeline detects this by content hash and keeps only the alphabetically-first filename as the canonical document; the other is skipped and logged, so search doesn't return the same passage twice under two different source names.
- **Missing metadata** - `kiln_firing_guide.md` and `cnc_router_notes.md` have no YAML frontmatter at all (no title/category/author). The frontmatter parser (`gray-matter`) tolerates this and just returns an empty object, so these documents get `NULL` metadata fields in the database rather than failing ingestion. The frontend renders `NULL` as "N/A" instead of breaking.

Per the brief, the corpus files themselves are untouched — all of this is handled in the ingestion pipeline, not by editing the source markdown.

## Idempotency 

Ingestion (`lib/ingest.js`) reconciles the database to match whatever is currently in `corpus/`, using a hash of each file's raw content:

1. Every file is hashed. Files with identical hashes under different names are deduped (see above), keeping one canonical filename.
2. For each canonical file, compare its hash against what's stored for that filename in the database:
   - Not present yet → insert the document and its passages.
   - Present with the same hash → do nothing.
   - Present with a different hash → delete its old passages, re-insert fresh ones, update the stored hash.
3. Any document in the database whose filename is no longer among the current canonical files (deleted from disk, or newly demoted as a duplicate) is deleted along with its passages.

This one rule handles all three required scenarios with a single mechanism: running ingestion twice in a row changes nothing (every file's hash already matches what's stored, so every file hits the "do nothing" branch); deleting a source file and re-ingesting removes it (step 3); and adding a new file just falls into the "not present yet" branch. There's no separate "first run" vs. "later run" code path, every run does the same reconcile-to-match-disk pass.

## Search check results

_(to follow once `scripts/check.js` has been run against the finished app)_

## What I cut and why

_(to follow: will reflect what's actually cut once the build is closer to done)_

## AI usage

_(to follow: full breakdown of tools, what for, and what I wrote/reworked myself, once the build is complete)_