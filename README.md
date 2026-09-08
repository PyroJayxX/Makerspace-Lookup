# Makerspace Knowledge Base

A small search app over a makerspace's accumulated machine manuals, safety guides, FAQs, and policies. Staff type a question or keywords and get back the most relevant passages with their source document.

Built for a take-home assessment. Stack, database, ingestion design, and docker approach was explicitly chosen and approved by me; implementation was done with AI assistance (Claude Code). [See AI Usage](#ai-usage)

## Stack

- **Next.js (App Router) + TypeScript** - one process serves both the frontend and the API, which keeps run-ability to a single command.
- **SQLite via `better-sqlite3` (FTS5 for full-text search)** - no separate DB server, so "survives a restart" is just one file on a volume, and no second service in Docker. Not Node's built-in `node:sqlite`: confirmed it ships without FTS5, so it can't do full-text search.
- **Ingestion/check scripts as plain CommonJS JavaScript**, not TypeScript - they run with plain `node`, no `tsx`/`ts-node` needed in or out of Docker.
- **Docker: multi-stage, without Next's `output: 'standalone'`.** Standalone's file-tracing can miss native addons like `better-sqlite3`'s compiled binary. Simpler than working around that: skip it, and have the final stage run its own normal `pnpm install --prod` instead.

## Setup and run

**Docker:**
```bash
docker compose up --build   # ingests automatically, then serves on http://localhost:3000
node scripts/check.js       # from the host, run the search check questions against it
```
The database (`./data`) and corpus (`./corpus`, read-only) are bind-mounted into the container, so the database survives a restart and editing/deleting a corpus file on disk is picked up by re-running ingestion (`docker compose exec app node scripts/ingest.js`) without rebuilding the image.

**Local Development:**
```bash
pnpm install
node scripts/ingest.js   # ingest corpus/ into ./data/app.db
pnpm dev                 # http://localhost:3000
node scripts/check.js    # run the search check questions
```

## The Corpus

The provided 14-document corpus is deliberately mixed quality:

- **Duplicate content under different filenames** - `woodworking_manual.md` and `woodworking_manual_final_v2.md` are byte-identical. The ingestion pipeline detects this by content hash and keeps only the alphabetically-first filename as the canonical document; the other is skipped and logged, so search doesn't return the same passage twice under two different source names.
- **Missing metadata** - `kiln_firing_guide.md` and `cnc_router_notes.md` have no YAML frontmatter at all (no title/category/author). The frontmatter parser (`gray-matter`) tolerates this and just returns an empty object, so these documents get `NULL` metadata fields in the database rather than failing ingestion. The frontend renders `NULL` as "N/A" instead of breaking.
- **Messy informal notes** - `cnc_router_notes.md` and `dust_collection_maintenance.md` are written as casual shorthand (lowercase, "w/", run-on sentences, "??", ALL-CAPS warnings) rather than clean prose. No special handling needed: ingestion splits body text into passages the same way regardless of formality.

## Idempotency 

Ingestion (`lib/ingest.js`) reconciles the database to match whatever is currently in `corpus/`, using a hash of each file's raw content:

1. Every file is hashed. Files with identical hashes under different names are deduped (see above), keeping one canonical filename.
2. For each canonical file, compare its hash against what's stored for that filename in the database:
   - Not present yet - insert the document and its passages.
   - Present with the same hash - do nothing.
   - Present with a different hash - delete its old passages, re-insert fresh ones, update the stored hash.
3. Any document in the database whose filename is no longer among the current canonical files (deleted from disk, or newly demoted as a duplicate) is deleted along with its passages.

This one rule handles all three required scenarios with a single mechanism: running ingestion twice in a row changes nothing (every file's hash already matches what's stored, so every file hits the "do nothing" branch); deleting a source file and re-ingesting removes it (step 3); and adding a new file just falls into the "not present yet" branch. There's no separate "first run" vs. "later run" code path, every run does the same reconcile-to-match-disk pass.

The corpus is also pinned to LF line endings via `.gitattributes`. Without it, Windows' default `core.autocrlf` behavior could check the same files out with CRLF on a different machine, silently changing the hash this whole mechanism depends on.

## Search

`lib/search.js` builds an FTS5 query: each query word becomes a prefix match, OR'd together, ranked by FTS5's built-in relevance score.

Common words (the, is, what, for, ...) are filtered out before matching. Without this, OR-ing every word together meant "the"/"what" alone matched 68-71 of the corpus's 82 total passages regardless of the actual question, making honest "no results" responses nearly unreachable. Verified empirically before and after the fix.

## Search check results

All 7 questions pass (`node scripts/check.js` against the running app):

```
[PASS] What materials are forbidden on the laser cutter?
[PASS] What temperature should I set my soldering iron to?
[PASS] How many hours per week can I book a single machine?
[PASS] What should I do for a chemical splash in the eye?
[PASS] What is the maximum wall thickness allowed for kiln firing?
[PASS] Are push sticks mandatory for narrow rip cuts on the table saw?
[PASS] What is the wifi password for the makerspace?

7/7 passed
```

## What I cut and why

- **Click-through to view the full source document.** The brief only asks for passage + title + category in the results list. Adding this would mean a new route, safely mapping an id back to a file without a path-traversal risk, and a rendering choice.
- **"Integration hooks" for the bigger system.** Considered adding placeholder click handlers/fields anticipating future extension, but that means guessing at requirements that don't exist yet. Kept the code simple and well-separated instead, which is what actually makes it easy to extend later.
- **Full markdown rendering.** The corpus only ever uses two markdown constructs (headings, bold). Rather than pull in a markdown renderer, `lib/ingest.js` strips both with a small regex at ingestion time.
- **Multi-page / paginated results.** Not needed: the corpus is small enough (82 passages total) that returning every ranked match costs nothing, so there's no truncation to paginate around.
- **Custom re-ranking.** Not asked for, and explicitly earns no extra credit per the brief, FTS5's own ranking already covers it.

## AI usage

Claude Code (Sonnet 5) was used for most of the code and feature implementation, as I was directing every architecture decision through discussion rather than accepting defaults: stack choice (Next.js vs Express), database choice (SQLite vs Postgres/MySQL, and specifically why FTS5), the ingestion idempotency/reconciliation design, and the Docker approach (multi-stage, and specifically why not Next's `output: 'standalone'`).

Testing the running app, not just reading the code, caught two real bugs before submission: a stopword-matching bug that made "no results" nearly unreachable, and a `localeCompare`-based duplicate-file bug that made canonical-filename selection non-deterministic across environments (both covered above). I reviewed and adjusted the generated code throughout rather than accepting it as-is.