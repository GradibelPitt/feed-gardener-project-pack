import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const entry = fileURLToPath(new URL('./main.ts', import.meta.url));

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'feed-gardener-cli-'));
  const data = join(folder, 'state.json');
  const run = (...args: string[]) => {
    const output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', entry, '--data', data, '--json', ...args],
      { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: '' } },
    );
    return JSON.parse(output);
  };
  return { folder, data, run };
}

test('CLI keeps preferences, demo discovery, saved items, and private library across processes', () => {
  const { data, run } = fixture();
  assert.equal(run('status').platformExecution, 'blocked_external');
  assert.equal(
    run('catalog', 'tags', '--domain', 'developer-tools').some(
      (item: { id: string }) => item.id === 'cli',
    ),
    true,
  );
  run('prefs', 'add-tag', 'databases');
  run('prefs', 'block-tag', 'cli');
  run('prefs', 'set', 'only-selected', 'on');
  run('feed', 'weight', 'agents', '0.85');
  const preferences = run('prefs', 'show');
  assert.equal(preferences.tags.includes('databases'), true);
  assert.equal(preferences.tags.includes('cli'), false);
  assert.equal(preferences.blockedTags.includes('cli'), true);
  assert.equal(preferences.domains.includes('backend-systems'), true);
  assert.equal(preferences.tagJev.agents, 0.85);
  const discovery = run('discover', '--limit', '10');
  assert.equal(discovery.provenance, 'bundled_demo_fixture');
  assert.ok(discovery.items.length > 0);
  const id = discovery.items[0].id;
  run('saved', 'add', id);
  assert.equal(run('saved', 'list').items[0].id, id);
  const resource = run('library', 'add', 'https://example.org/post#part', '--title', 'My link');
  assert.equal(resource.title, 'My link');
  assert.equal(run('library', 'list').length, 1);
  run('library', 'note', resource.id, 'To read');
  run('library', 'state', resource.id, 'reviewing');
  assert.equal(run('library', 'show', resource.id).note, 'To read');
  assert.equal(run('library', 'show', resource.id).knowledgeState, 'reviewing');
  const duplicate = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      entry,
      '--data',
      data,
      'library',
      'add',
      'https://www.example.org/post',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already in the library/);
  assert.equal(JSON.parse(readFileSync(data, 'utf8')).resources.length, 1);
});

test('CLI simulator advances across invocations and Agent previews keep external actions blocked', () => {
  const { run } = fixture();
  assert.equal(run('agent', 'plan', '--platform', 'youtube').executionStatus, 'policy_blocked');
  const decision = run(
    'agent',
    'decision',
    '--title',
    'A local AI tutorial',
    '--provider',
    'deterministic',
  );
  assert.equal(decision.decision.executionAuthorization, 'none');
  assert.equal(decision.decision.relevanceScore, null);
  assert.equal(run('simulator', 'plan').status, 'ready');
  assert.equal(run('simulator', 'consent', 'yes').consent, true);
  assert.equal(run('simulator', 'start').status, 'running');
  assert.equal(run('simulator', 'tick', '2').step, 2);
  assert.equal(run('simulator', 'pause').status, 'paused');
  assert.equal(run('simulator', 'resume').status, 'running');
  assert.equal(run('simulator', 'tick', '20').status, 'finished');
  assert.equal(run('simulator', 'status').simulationOnly, true);
});

test('CLI import, export, and observed-feed evaluation use explicit files', () => {
  const { folder, run } = fixture();
  const exported = join(folder, 'export.json');
  run('state', 'export', '--file', exported);
  run('prefs', 'block-tag', 'cli');
  run('state', 'import', '--file', exported, '--replace');
  assert.equal(run('prefs', 'show').blockedTags.includes('cli'), false);
  const browser = join(folder, 'browser.json');
  writeFileSync(
    browser,
    JSON.stringify({
      schema: 'feed-gardener-demo/1',
      preferences: {
        tags: ['agents'],
        domains: ['ai-infrastructure'],
        onlySelectedTags: true,
        version: 2,
        customTags: [
          {
            id: 'live:github:sample',
            label: 'Sample',
            labelEn: 'Sample',
            evidenceUrl: 'https://github.com/example/sample',
          },
        ],
      },
      saved: [],
      hidden: [],
      resources: [
        {
          id: 'browser-link',
          title: 'Imported',
          url: 'https://example.org/imported',
          source: 'example.org',
        },
      ],
    }),
  );
  run('state', 'import-browser', '--file', browser, '--replace');
  assert.deepEqual(run('prefs', 'show').tags, ['agents']);
  assert.equal(run('prefs', 'show').customTags[0].id, 'live:github:sample');
  assert.equal(run('library', 'list')[0].id, 'browser-link');
  const observations = join(folder, 'runs.json');
  writeFileSync(
    observations,
    JSON.stringify([
      {
        runId: 'sample',
        platform: 'simulator',
        targetTags: ['agents'],
        baseline: { entries: [{ rank: 1, tags: ['other'] }] },
        followup: { entries: [{ rank: 1, tags: ['agents'] }] },
      },
    ]),
  );
  const evaluation = run('agent', 'evaluate', '--input', observations);
  assert.equal(evaluation.report.aggregate.status, 'insufficient_runs');
  assert.match(evaluation.boundary, /provenance is not verified/);
});
