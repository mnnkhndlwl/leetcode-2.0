/**
 * Cheap keyword preprocessing for problem search — not NLP.
 *
 * Extracts structured difficulty filters, strips filler words that dilute
 * tsvector AND-queries, and leaves topic terms for FTS / tag matching.
 */

const DIFFICULTY_RE = /\b(easy|medium|hard)\b/gi;

const DIFFICULTY_MAP = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

/** Words that add noise to topic queries like "problems on substring". */
const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "on",
  "in",
  "for",
  "to",
  "with",
  "about",
  "and",
  "or",
  "problem",
  "problems",
  "question",
  "questions",
  "challenge",
  "challenges",
  "leetcode",
  "find",
  "show",
  "list",
  "all",
  "me",
  "some",
  "any",
]);

/**
 * @param {string | undefined | null} rawQuery
 * @returns {{
 *   difficulty: "Easy" | "Medium" | "Hard" | null,
 *   text: string,
 *   terms: string[],
 * }}
 */
export function parseSearchQuery(rawQuery) {
  const raw = (rawQuery ?? "").trim();
  if (!raw) {
    return { difficulty: null, text: "", terms: [] };
  }

  let difficulty = null;
  const withoutDifficulty = raw.replace(DIFFICULTY_RE, (match) => {
    const mapped = DIFFICULTY_MAP[match.toLowerCase()];
    if (mapped) difficulty = mapped;
    return " ";
  });

  const terms = withoutDifficulty
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !FILLER_WORDS.has(t));

  // De-dupe while preserving order
  const seen = new Set();
  const unique = [];
  for (const t of terms) {
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }

  return {
    difficulty,
    text: unique.join(" "),
    terms: unique,
  };
}
