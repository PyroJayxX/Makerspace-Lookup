 // Without this, OR-ing every word together means common words like "the"
// or "what" match nearly every passage in the corpus, drowning out the
// actual content words and making "no results" nearly impossible to reach.
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "so",
  "of", "to", "in", "on", "at", "for", "with", "as", "by", "from", "about",
  "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "can", "could", "should", "would", "will", "shall",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "i", "you", "he", "she", "it", "we", "they",
  "my", "your", "his", "her", "its", "our", "their",
  "this", "that", "these", "those", "there", "here",
  "not", "no", "yes",
]);

function tokenize(query) {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

// Prefix-match every token, OR'd together for recall ("plain keyword search").
function buildMatchExpression(tokens) {
  return tokens.map((t) => `"${t}"*`).join(" OR ");
}

// No result cap: the corpus is small enough (a few dozen passages) that
// returning every ranked match costs nothing, so there's nothing to
// truncate or paginate around.
function search(db, query) {
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
       ORDER BY rank`
    )
    .all(matchExpr);
}

module.exports = { search, tokenize };
