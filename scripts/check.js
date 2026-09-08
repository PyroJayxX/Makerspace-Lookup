const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const questions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "check-questions.json"), "utf8")
);

async function runOne({ question, expectedDocumentId }) {
  const url = `${BASE_URL}/api/search?q=${encodeURIComponent(question)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { question, pass: false, reason: `HTTP ${res.status}` };

    const body = await res.json();
    const ids = (body.results || []).map((r) => r.documentId);

    if (expectedDocumentId === null) {
      const pass = ids.length === 0;
      return { question, pass, reason: pass ? undefined : `expected no results, got ${ids.length}` };
    }

    const pass = ids.includes(expectedDocumentId);
    return {
      question,
      pass,
      reason: pass ? undefined : `expected "${expectedDocumentId}", got [${ids.join(", ")}]`,
    };
  } catch (err) {
    return { question, pass: false, reason: err.message };
  }
}

async function main() {
  console.log(`Running ${questions.length} check questions against ${BASE_URL}\n`);

  let passed = 0;
  for (const q of questions) {
    const result = await runOne(q);
    console.log(`[${result.pass ? "PASS" : "FAIL"}] ${result.question}`);
    if (!result.pass) console.log(`       ${result.reason}`);
    if (result.pass) passed++;
  }

  console.log(`\n${passed}/${questions.length} passed`);
  process.exitCode = passed === questions.length ? 0 : 1;
}

main();
