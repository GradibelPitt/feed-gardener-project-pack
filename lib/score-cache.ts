import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// The key contains no title or raw interest tags. Changing the scoring rubric
// requires a new version so an old score cannot silently change the feed.
const RUBRIC_VERSION = 2;
const TTL_MS = 6 * 60 * 60_000;

export type CachedScore = {
  score: number;
  confidence: number;
  model?: string;
};

let database: DatabaseSync | null = null;
let databasePath = '';

function pathForCache(): string {
  const configured = process.env.FEEDER_SCORE_DB?.trim();
  return configured === ':memory:'
    ? configured
    : resolve(/* turbopackIgnore: true */ configured || '.data/scores.db');
}

function open(): DatabaseSync {
  const path = pathForCache();
  if (database && databasePath === path) return database;
  if (database) database.close();
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  database = new DatabaseSync(path);
  databasePath = path;
  database.exec(`
    CREATE TABLE IF NOT EXISTS title_scores (
      score_key TEXT PRIMARY KEY,
      score REAL NOT NULL,
      confidence REAL NOT NULL,
      model TEXT,
      scored_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS title_scores_by_age ON title_scores(scored_at);
  `);
  return database;
}

export function scoreCacheKey(title: string, tags: readonly string[], model: string): string {
  const normalizedTags = [...new Set(tags.map((tag) => tag.trim().toLowerCase()))].sort();
  return createHash('sha256')
    .update(JSON.stringify([RUBRIC_VERSION, title.trim(), normalizedTags, model]))
    .digest('hex');
}

export function readScore(key: string, now = Date.now()): CachedScore | null {
  const row = open()
    .prepare(
      'SELECT score, confidence, model FROM title_scores WHERE score_key = ? AND scored_at > ?',
    )
    .get(key, now - TTL_MS) as
    { score: number; confidence: number; model: string | null } | undefined;
  if (!row) return null;
  if (
    !Number.isFinite(row.score) ||
    row.score < 1 ||
    row.score > 10 ||
    !Number.isFinite(row.confidence) ||
    row.confidence < 0 ||
    row.confidence > 1
  )
    return null;
  return {
    score: row.score,
    confidence: row.confidence,
    ...(row.model ? { model: row.model } : {}),
  };
}

export function writeScore(key: string, rating: CachedScore, now = Date.now()): void {
  const connection = open();
  connection
    .prepare(
      `INSERT INTO title_scores (score_key, score, confidence, model, scored_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(score_key) DO UPDATE SET
         score = excluded.score,
         confidence = excluded.confidence,
         model = excluded.model,
         scored_at = excluded.scored_at`,
    )
    .run(key, rating.score, rating.confidence, rating.model ?? null, now);
  connection.prepare('DELETE FROM title_scores WHERE scored_at <= ?').run(now - TTL_MS);
}

export function closeScoreCache(): void {
  database?.close();
  database = null;
  databasePath = '';
}
