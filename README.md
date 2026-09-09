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

## The Corpus

The provided 14-document corpus is deliberately mixed quality:

- **Duplicate content under different filenames** - `woodworking_manual.md` and `woodworking_manual_final_v2.md` are byte-identical. The ingestion pipeline detects this by content hash and keeps only the alphabetically-first filename as the canonical document; the other is skipped and logged, so search doesn't return the same passage twice under two different source names.
- **Missing metadata** - `kiln_firing_guide.md` and `cnc_router_notes.md` have no YAML frontmatter at all (no title/category/author). The frontmatter parser (`gray-matter`) tolerates this and just returns an empty object, so these documents get `NULL` metadata fields in the database rather than failing ingestion. The frontend renders `NULL` as "N/A" instead of breaking.
- **Messy informal notes** - `cnc_router_notes.md` and `dust_collection_maintenance.md` are written as casual shorthand (lowercase, "w/", run-on sentences, "??", ALL-CAPS warnings) rather than clean prose. No special handling needed: ingestion splits body text into passages the same way regardless of formality.

## Idempotency 

To achieve idempotency, the ingestion script checks each file in the `corpus/` folder and matches its hash to what's currently stored in the Database (SQLite file).

The flow is as follows:
1. The ingestion script hashes each file, and files with identical hashes under different names are dropped (see above), to ensure no dupes.
2. For each file, its hash is compared against what's already stored for that filename in the database and acts accordingly on different cases:
  - A. Filename is not present yet: Insert the document and its passages.
  - B. Filename is already present and stored with the same hash: Do nothing
  - C. Filename is already present but with a different hash: Delete the old passages, re-insert the new ones, and update the stored hash.
3. Any document in the database whose filename is no longer among the current files (deleted from disk, or newly demoted as a duplicate) is deleted along with its passages.

This way, reingesting multiple times in a row does not create duplicated passages because of rule 2B, and any filename that is no longer in the `corpus/` folder is gone upon reingestion due to rule 3; therefore satisfying the critical requirements.

### Making this deterministic across machines

- Picking the canonical file (step 1) uses plain string comparison, not `localeCompare`: an earlier version used `localeCompare`, which led to a logic error that picks `woodworking_manual_final_v2.md` over the plain filename, confirmed via `"woodworking_manual.md".localeCompare("woodworking_manual_final_v2.md")` returning `1` instead of the expected `-1`.
- The corpus is also pinned to LF line endings via `.gitattributes`. Without it, Windows' default `core.autocrlf` behavior could check the same files out with CRLF on a different machine, silently changing the hash this whole mechanism depends on.

## Search

- **Query matching**: `lib/search.js` builds an FTS5 prefix-match query; each content word OR'd together, ranked by FTS5's built-in relevance score. Common words ("the," "what," etc.) are filtered out first to avoid matching with every single passages.
- **Title as search context**: passages can also be found by words in their document's title, not just their own text. A passage like "Forbidden materials..." doesn't contain "laser" or "cutter" itself, but its document's title does ("Laser Cutter Safety and Materials"), so it's still found by those words, without the title text being repeated in what's shown to the user.
- **Title-only passages excluded**: a passage that's just a document's title with no content is dropped from indexing entirely, since it's pure duplication of metadata already shown in the UI, not real content.

Verified against a real query: "what materials are forbidden on the laser cutter?" ranked the correct passage 4th before the last two fixes above, 1st after.

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

Before the stopword fix described in [Search](#search) above, the last question "What is the wifi password..." returned 68 results instead of the expected zero.

## What I cut and why

- **Click-through to view the full source document.** The brief only asks for passage + title + category in the results list. Adding this would mean a new route, safely mapping an id back to a file without a path-traversal risk, and a rendering choice.
- **"Integration hooks" for the bigger system.** Considered adding placeholder click handlers/fields anticipating future extension, but that means guessing at requirements that don't exist yet. Kept the code simple and well-separated instead, which is what actually makes it easy to extend later.
- **Full markdown rendering.** The corpus only ever uses two markdown constructs (headings, bold). Rather than pull in a markdown renderer, `lib/ingest.js` strips both with a small regex at ingestion time.
- **Multi-page / paginated results.** Not needed: the corpus is small enough (82 passages total) that returning every ranked match costs nothing, so there's no truncation to paginate around.
- **Custom re-ranking.** Not asked for, and explicitly earns no extra credit per the brief, FTS5's own ranking already covers it.
- **Live deployed link (optional per the brief).** Tried Vercel, but its read-only serverless filesystem doesn't fit SQLite. The proper fix (Turso) means rewriting the already tested data layer to an async client, which risks surfacing data-critical bugs.

## AI usage

Claude Code (Sonnet 5) was used for most of the code and feature implementation, as I was directing every architecture decision through discussion rather than accepting defaults: stack choice (Next.js vs Express), database choice (SQLite vs Postgres/MySQL, and specifically why FTS5), the ingestion idempotency/reconciliation design, and the Docker approach (multi-stage, and specifically why not Next's `output: 'standalone'`).

Testing the running app revealed several real issues that were fixed:

- A stopword bug that made "no results" almost unreachable
- A non-deterministic duplicate-file bug (`localeCompare` picking a 
  different "canonical" file depending on environment)
- A ranking bug where passages lost context once split apart

(the duplicate-file bug is detailed in [Idempotency](#idempotency) above; the stopword and ranking bugs are detailed in [Search](#search) above)

I made Claude Re-read the brief closely and it caught one more gap: it requires the API to 
clearly say "no match," and mine only implied that with an empty array; 
so I fixed it to return an explicit message.

I also thought about whether the idempotency approach would hold up on a 
different machine, which isn't something the brief asks about directly. 
That's how I caught a cross-machine line-ending risk (CRLF vs LF) that 
could silently change the content hash the whole approach depends on.

I reviewed and adjusted the generated code throughout rather than 
accepting it as-is.