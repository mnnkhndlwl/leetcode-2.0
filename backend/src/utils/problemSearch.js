import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { parseSearchQuery } from "./parseSearchQuery.js";

/**
 * word_similarity threshold for title typos ("susbtring" vs long titles).
 * word_similarity compares against the best-matching word in the string.
 */
const TITLE_WORD_SIM_THRESHOLD = 0.4;

/** Tag name fuzzy match threshold for typo fallback. */
const TAG_TRGM_THRESHOLD = 0.45;

/**
 * Layered problem search:
 *   1. Keyword extract difficulty → structured filter
 *   2. tsvector FTS on title/description OR exact/contains match on curated tags
 *   3. If too few hits, trigram / word_similarity fallback (typos)
 *
 * @param {string | undefined | null} rawQuery
 * @param {{ limit?: number }} [opts]
 */
export async function searchProblems(rawQuery, { limit = 50 } = {}) {
  const { difficulty, text, terms } = parseSearchQuery(rawQuery);

  if (!difficulty && terms.length === 0) {
    return listPublicProblems(limit);
  }

  if (terms.length === 0) {
    return filterByDifficulty(difficulty, limit);
  }

  const ftsRows = await runFtsAndTagSearch({ difficulty, text, terms, limit });
  // Typo path: only when FTS + exact tag match miss entirely.
  // Don't expand sparse-but-real hits (e.g. "substring" → String-tag fuzz).
  if (ftsRows.length > 0) {
    return ftsRows;
  }

  return runTrigramFallback({ difficulty, text, terms, limit });
}

function termsArraySql(terms) {
  return sql`ARRAY[${sql.join(
    terms.map((t) => sql`${t}`),
    sql`, `,
  )}]::text[]`;
}

async function listPublicProblems(limit) {
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.title,
      p.difficulty,
      p.slug,
      p."totalSubmissions",
      p."totalAccepted"
    FROM problems p
    WHERE p.visibility = 'PUBLIC'
    ORDER BY p."createdAt" ASC
    LIMIT ${limit}
  `);
  return result.rows;
}

async function filterByDifficulty(difficulty, limit) {
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.title,
      p.difficulty,
      p.slug,
      p."totalSubmissions",
      p."totalAccepted"
    FROM problems p
    WHERE p.visibility = 'PUBLIC'
      AND p.difficulty = ${difficulty}
    ORDER BY p."createdAt" ASC
    LIMIT ${limit}
  `);
  return result.rows;
}

/**
 * Primary path: tsvector @@ plainto_tsquery, plus exact/contains tag match.
 * Deliberately no trigram here — "substring" must not fuzzy-hit the "String" tag.
 */
async function runFtsAndTagSearch({ difficulty, text, terms, limit }) {
  const difficultyClause = difficulty
    ? sql`AND p.difficulty = ${difficulty}`
    : sql``;
  const termsArr = termsArraySql(terms);

  const result = await db.execute(sql`
    SELECT
      p.id,
      p.title,
      p.difficulty,
      p.slug,
      p."totalSubmissions",
      p."totalAccepted",
      ts_rank_cd(p."searchVector", plainto_tsquery('english', ${text})) AS rank
    FROM problems p
    WHERE p.visibility = 'PUBLIC'
      ${difficultyClause}
      AND (
        p."searchVector" @@ plainto_tsquery('english', ${text})
        OR EXISTS (
          SELECT 1
          FROM "problemTags" pt
          JOIN tags t ON t.id = pt."tagId"
          WHERE pt."problemId" = p.id
            AND (
              lower(t.name) = ANY(${termsArr})
              OR lower(replace(t.name, ' ', '-')) = ANY(${termsArr})
              OR EXISTS (
                SELECT 1 FROM unnest(${termsArr}) AS term
                WHERE lower(t.name) LIKE '%' || term || '%'
                   OR lower(t.slug) LIKE '%' || term || '%'
              )
            )
        )
      )
    ORDER BY rank DESC, p."createdAt" ASC
    LIMIT ${limit}
  `);
  return stripScore(result.rows);
}

/**
 * Fallback when FTS is too sparse — typo tolerance via pg_trgm.
 * Uses word_similarity on titles so long titles still match a mistyped word.
 */
async function runTrigramFallback({ difficulty, text, terms, limit }) {
  const difficultyClause = difficulty
    ? sql`AND p.difficulty = ${difficulty}`
    : sql``;
  const termsArr = termsArraySql(terms);

  const result = await db.execute(sql`
    SELECT
      p.id,
      p.title,
      p.difficulty,
      p.slug,
      p."totalSubmissions",
      p."totalAccepted",
      GREATEST(
        word_similarity(lower(${text}), lower(p.title)),
        COALESCE((
          SELECT max(
            GREATEST(
              similarity(lower(t.name), term),
              word_similarity(term, lower(t.name))
            )
          )
          FROM "problemTags" pt
          JOIN tags t ON t.id = pt."tagId"
          CROSS JOIN unnest(${termsArr}) AS term
          WHERE pt."problemId" = p.id
        ), 0)
      ) AS sim
    FROM problems p
    WHERE p.visibility = 'PUBLIC'
      ${difficultyClause}
      AND (
        word_similarity(lower(${text}), lower(p.title)) >= ${TITLE_WORD_SIM_THRESHOLD}
        OR EXISTS (
          SELECT 1
          FROM "problemTags" pt
          JOIN tags t ON t.id = pt."tagId"
          CROSS JOIN unnest(${termsArr}) AS term
          WHERE pt."problemId" = p.id
            AND (
              similarity(lower(t.name), term) >= ${TAG_TRGM_THRESHOLD}
              OR word_similarity(term, lower(t.name)) >= ${TAG_TRGM_THRESHOLD}
            )
        )
      )
    ORDER BY sim DESC, p."createdAt" ASC
    LIMIT ${limit}
  `);
  return stripScore(result.rows);
}

function stripScore(rows) {
  return rows.map(({ rank, sim, ...row }) => row);
}
