const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const matter = require("gray-matter");

// regex for removing markdown syntax from passages (removes headings and bold text)
function stripMarkdownSyntax(text) {
  return text.replace(/^#+\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "$1");
}

function splitPassages(body) {
  return body
    .split(/\n\s*\n+/)
    .map((s) => stripMarkdownSyntax(s).trim())
    .filter((s) => s.length > 0);
}

// Drops passages that are just the document's own title with nothing
// else (a lone "# Title" line before the first section, split off as
// its own block). It's pure duplication of metadata already shown
// alongside every result, not real content.
function dropTitleOnlyPassage(passages, title) {
  if (!title) return passages;
  const normalizedTitle = title.trim().toLowerCase();
  return passages.filter((p) => p.trim().toLowerCase() !== normalizedTitle);
}

// gray-matter's YAML parser turns bare dates like "2026-05-02" into Date objects.
function normalizeMetaValue(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function readCorpusFiles(corpusDir) {
  return fs
    .readdirSync(corpusDir)
    .filter((f) => f.endsWith(".md"))
    .map((filename) => {
      const raw = fs.readFileSync(path.join(corpusDir, filename), "utf8");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      return { filename, raw, hash };
    });
}

// When multiple files hash identically, keep only the alphabetically-first
// filename as canonical. Deterministic and reproducible run-to-run.
function dedupeByContent(files) {
  const byHash = new Map();
  for (const file of files) {
    if (!byHash.has(file.hash)) byHash.set(file.hash, []);
    byHash.get(file.hash).push(file);
  }

  const canonical = [];
  const skippedDuplicates = [];
  for (const group of byHash.values()) {
    // Plain lexicographic comparison, not localeCompare: locale-aware
    // collation isn't guaranteed stable across environments and treats
    // punctuation inconsistently, which would make the canonical choice
    // depend on which machine ingestion runs on.
    const sorted = [...group].sort((a, b) =>
      a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0
    );
    canonical.push(sorted[0]);
    for (const dup of sorted.slice(1)) {
      skippedDuplicates.push({ kept: sorted[0].filename, skipped: dup.filename });
    }
  }
  return { canonical, skippedDuplicates };
}

function ingestCorpus(corpusDir, db) {
  const files = readCorpusFiles(corpusDir);
  const { canonical, skippedDuplicates } = dedupeByContent(files);
  const canonicalIds = new Set(canonical.map((f) => f.filename));

  const getDoc = db.prepare("SELECT content_hash FROM documents WHERE id = ?");
  const insertDoc = db.prepare(
    "INSERT INTO documents (id, title, category, author, updated, content_hash) VALUES (@id, @title, @category, @author, @updated, @content_hash)"
  );
  const updateDoc = db.prepare(
    "UPDATE documents SET title=@title, category=@category, author=@author, updated=@updated, content_hash=@content_hash WHERE id=@id"
  );
  const deletePassages = db.prepare("DELETE FROM passages WHERE document_id = ?");
  const deleteDocument = db.prepare("DELETE FROM documents WHERE id = ?");
  const insertPassage = db.prepare(
    "INSERT INTO passages (document_id, ordinal, content, title_context) VALUES (?, ?, ?, ?)"
  );

  const counts = { added: 0, updated: 0, unchanged: 0, removed: 0 };

  const upsertOne = db.transaction((file) => {
    const parsed = matter(file.raw);
    const meta = parsed.data || {};
    const docRow = {
      id: file.filename,
      title: normalizeMetaValue(meta.title),
      category: normalizeMetaValue(meta.category),
      author: normalizeMetaValue(meta.author),
      updated: normalizeMetaValue(meta.updated),
      content_hash: file.hash,
    };

    const existing = getDoc.get(file.filename);
    if (!existing) {
      insertDoc.run(docRow);
      dropTitleOnlyPassage(splitPassages(parsed.content), docRow.title).forEach(
        (content, ordinal) => insertPassage.run(file.filename, ordinal, content, docRow.title || "")
      );
      counts.added++;
    } else if (existing.content_hash === file.hash) {
      counts.unchanged++;
    } else {
      updateDoc.run(docRow);
      deletePassages.run(file.filename);
      dropTitleOnlyPassage(splitPassages(parsed.content), docRow.title).forEach(
        (content, ordinal) => insertPassage.run(file.filename, ordinal, content, docRow.title || "")
      );
      counts.updated++;
    }
  });

  for (const file of canonical) upsertOne(file);

  // Reconcile deletions: anything in the DB no longer among this run's
  // canonical files (removed from disk, or newly demoted as a duplicate).
  const removeOne = db.transaction((id) => {
    deletePassages.run(id);
    deleteDocument.run(id);
  });

  const existingIds = db.prepare("SELECT id FROM documents").all().map((r) => r.id);
  for (const id of existingIds) {
    if (!canonicalIds.has(id)) {
      removeOne(id);
      counts.removed++;
    }
  }

  return { ...counts, skippedDuplicates };
}

module.exports = { ingestCorpus, splitPassages };
