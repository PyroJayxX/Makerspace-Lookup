const path = require("path");
const { getDb } = require("../lib/db");
const { ingestCorpus } = require("../lib/ingest");

const corpusDir = process.env.CORPUS_DIR || path.join(process.cwd(), "corpus");
const db = getDb();

const result = ingestCorpus(corpusDir, db);

console.log(`Ingested from ${corpusDir}`);
console.log(`  added:     ${result.added}`);
console.log(`  updated:   ${result.updated}`);
console.log(`  unchanged: ${result.unchanged}`);
console.log(`  removed:   ${result.removed}`);

if (result.skippedDuplicates.length > 0) {
  console.log("  duplicate content skipped:");
  for (const dup of result.skippedDuplicates) {
    console.log(`    kept "${dup.kept}", skipped "${dup.skipped}" (identical content)`);
  }
}
