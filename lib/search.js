function tokenize(query) {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
}

// Prefix-match every token, OR'd together for recall ("plain keyword search").
function buildMatchExpression(tokens) {
  return tokens.map((t) => `"${t}"*`).join(" OR ");
}

function search(db, query, limit = 10) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const matchExpr = buildMatchExpression(tokens);

  return db
    .prepare(
      `SELECT
         passages.document_id AS documentId,
         passages.content AS content,
         documents.title AS title,
         documents.category AS category,
         documents.author AS author
       FROM passages
       JOIN documents ON documents.id = passages.document_id
       WHERE passages MATCH ?
       ORDER BY rank
       LIMIT ?`
    )
    .all(matchExpr, limit);
}

module.exports = { search, tokenize };
