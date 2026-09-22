import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { closeScoreCache, readScore, scoreCacheKey, writeScore } from './score-cache.ts';

test('title scores persist without storing raw titles or tags and expire', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'feeder-score-'));
  const previousPath = process.env.FEEDER_SCORE_DB;
  const file = join(directory, 'scores.db');
  process.env.FEEDER_SCORE_DB = file;
  t.after(() => {
    closeScoreCache();
    if (previousPath === undefined) delete process.env.FEEDER_SCORE_DB;
    else process.env.FEEDER_SCORE_DB = previousPath;
    rmSync(directory, { recursive: true, force: true });
  });

  const key = scoreCacheKey('A private title', ['Rust', 'AI'], 'jev-latest');
  assert.equal(key, scoreCacheKey('A private title', ['ai', 'Rust', 'AI'], 'jev-latest'));
  assert.notEqual(key, scoreCacheKey('A different title', ['Rust', 'AI'], 'jev-latest'));
  assert.notEqual(key, scoreCacheKey('A private title', ['Rust', 'AI'], 'jev-next'));
  writeScore(key, { score: 8.4, confidence: 0.78, model: 'jev-1.13.0' }, 1_000_000_000);
  closeScoreCache();
  assert.deepEqual(readScore(key, 1_000_000_001), {
    score: 8.4,
    confidence: 0.78,
    model: 'jev-1.13.0',
  });
  assert.equal(readScore(key, 1_000_000_000 + 6 * 60 * 60_000 + 1), null);
  const bytes = readFileSync(file);
  assert.equal(bytes.includes(Buffer.from('A private title')), false);
  assert.equal(bytes.includes(Buffer.from('Rust')), false);
});
