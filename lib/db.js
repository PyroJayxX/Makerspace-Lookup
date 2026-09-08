const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

let db;

function getDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT,
      category TEXT,
      author TEXT,
      updated TEXT,
      content_hash TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS passages USING fts5(
      document_id UNINDEXED,
      ordinal UNINDEXED,
      content
    );
  `);

  return db;
}

module.exports = { getDb };
