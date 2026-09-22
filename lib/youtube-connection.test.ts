import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  assertYouTubeOrigin,
  createYouTubeConnectionService,
  newYouTubeStore,
  youtubeConfig,
  YouTubeConnectionError,
} from './youtube-connection.ts';

const config = youtubeConfig({
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
});
const scope = 'https://www.googleapis.com/auth/youtube.readonly';
const token = {
  access_token: 'private-access-token',
  token_type: 'Bearer',
  scope,
  expires_in: 3600,
  refresh_token: 'must-not-store',
};
const channel = { items: [{ id: 'channel-1', snippet: { title: 'Test channel' } }] };
const response = (body: unknown, status = 200) => Response.json(body, { status });
const rejected = (code: string) => (error: unknown) =>
  error instanceof YouTubeConnectionError && error.code === code;

test('YouTube config reports missing credentials without values and rejects unsafe redirects', async () => {
  const service = createYouTubeConnectionService(newYouTubeStore(), youtubeConfig({}));
  assert.equal((await service.status()).status, 'configuration_required');
  assert.throws(() => service.start(), rejected('YOUTUBE_OAUTH_NOT_CONFIGURED'));
  for (const redirect of [
    'http://evil.example/api/connections/youtube/callback',
    'https://example.com/wrong',
    'https://user:secret@example.com/api/connections/youtube/callback',
  ]) {
    assert.ok(
      youtubeConfig({ GOOGLE_OAUTH_REDIRECT_URI: redirect }).missing.includes(
        'GOOGLE_OAUTH_REDIRECT_URI',
      ),
    );
  }
});

test('connection writes require same-origin and configured callback origin', () => {
  assert.doesNotThrow(() =>
    assertYouTubeOrigin(
      new Request('http://localhost:3000/api/connections/youtube', {
        headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
      }),
      config,
    ),
  );
  for (const origin of [null, 'https://evil.example', 'null']) {
    assert.throws(
      () =>
        assertYouTubeOrigin(
          new Request('http://127.0.0.1:3000/api/connections/youtube', {
            headers: origin ? { origin } : {},
          }),
          config,
        ),
      rejected('ORIGIN_MISMATCH'),
    );
  }
  assert.throws(
    () =>
      assertYouTubeOrigin(
        new Request('http://localhost:3000/api/connections/youtube', {
          headers: { origin: 'http://localhost:3000' },
        }),
        config,
      ),
    rejected('REDIRECT_ORIGIN_MISMATCH'),
  );
});

test('OAuth start is read-only, uses PKCE, binds callback and never leaks secret', () => {
  const store = newYouTubeStore();
  const service = createYouTubeConnectionService(store, config);
  const start = service.start();
  const url = new URL(start.authorizationUrl);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), scope);
  assert.equal(url.searchParams.get('access_type'), 'online');
  assert.equal(url.searchParams.get('redirect_uri'), config.redirectUri);
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(store.pending.get(start.state)!.verifier).digest('base64url'),
  );
  assert.equal(start.authorizationUrl.includes('test-secret'), false);
  service.start(start.state);
  assert.equal(store.pending.has(start.state), false);
});

test('missing browser state, mismatched state, expiry and callback replay cannot create a connection', async () => {
  let now = 0;
  const store = newYouTubeStore();
  const service = createYouTubeConnectionService(
    store,
    config,
    async () => {
      throw new Error('Must not fetch');
    },
    () => now,
  );
  const start = service.start();
  const params = new URLSearchParams({ state: start.state, code: 'test-code' });
  await assert.rejects(() => service.complete(params), rejected('YOUTUBE_STATE_INVALID'));
  await assert.rejects(
    () => service.complete(new URLSearchParams({ state: 'bad' }), start.state),
    rejected('YOUTUBE_STATE_INVALID'),
  );
  await assert.rejects(
    () =>
      service.complete(
        new URLSearchParams({ state: start.state, error: 'access_denied' }),
        start.state,
      ),
    rejected('YOUTUBE_ACCESS_DENIED'),
  );
  await assert.rejects(
    () => service.complete(params, start.state),
    rejected('YOUTUBE_STATE_INVALID'),
  );
  const expired = service.start();
  now = 600001;
  await assert.rejects(
    () =>
      service.complete(new URLSearchParams({ state: expired.state, code: 'code' }), expired.state),
    rejected('YOUTUBE_STATE_INVALID'),
  );
  assert.equal(store.sessions.size, 0);
});

test('valid OAuth exchanges PKCE and verifies channel; status/export never contain tokens', async () => {
  let now = 0;
  const store = newYouTubeStore();
  let verifier = '';
  const fetcher: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/token')) {
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('client_secret'), 'test-secret');
      assert.equal(body.get('code_verifier'), verifier);
      return response(token);
    }
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${token.access_token}`);
    return response(channel);
  };
  const service = createYouTubeConnectionService(store, config, fetcher, () => now);
  const start = service.start();
  verifier = store.pending.get(start.state)!.verifier;
  const result = await service.complete(
    new URLSearchParams({ state: start.state, code: 'code' }),
    start.state,
  );
  const status = await service.status(result.sessionId);
  assert.equal(status.status, 'connected');
  assert.deepEqual(status.channel, { id: 'channel-1', title: 'Test channel' });
  assert.equal(JSON.stringify(status).includes('private-access-token'), false);
  assert.equal(JSON.stringify([...store.sessions.values()]).includes('must-not-store'), false);
  await assert.rejects(
    () => service.complete(new URLSearchParams({ state: start.state, code: 'code' }), start.state),
    rejected('YOUTUBE_STATE_INVALID'),
  );
  now = 3600001;
  assert.equal((await service.status(result.sessionId)).status, 'expired');
  assert.equal(store.sessions.size, 0);
});

test('missing scope and missing channel revoke the token without connecting', async () => {
  for (const missingScope of [true, false]) {
    const store = newYouTubeStore();
    let revoked = false;
    const service = createYouTubeConnectionService(store, config, async (url) => {
      if (String(url).endsWith('/token'))
        return response({ ...token, scope: missingScope ? 'other' : scope });
      if (String(url).endsWith('/revoke')) {
        revoked = true;
        return new Response(null);
      }
      return response({ items: [] });
    });
    const start = service.start();
    await assert.rejects(
      () =>
        service.complete(new URLSearchParams({ state: start.state, code: 'code' }), start.state),
      rejected(missingScope ? 'YOUTUBE_SCOPE_MISSING' : 'YOUTUBE_CHANNEL_REQUIRED'),
    );
    assert.equal(revoked, true);
    assert.equal(store.sessions.size, 0);
  }
});

test('revoked auth expires the session; transient verification errors do not claim connection success', async () => {
  for (const status of [401, 503]) {
    const store = newYouTubeStore();
    store.sessions.set('session', {
      token: 'private',
      expires: Date.now() + 60000,
      channel: { id: 'channel-1', title: 'Channel' },
    });
    const service = createYouTubeConnectionService(store, config, async () => response({}, status));
    if (status === 401) assert.equal((await service.status('session')).status, 'expired');
    else
      await assert.rejects(
        () => service.status('session'),
        rejected('YOUTUBE_CHANNEL_UNAVAILABLE'),
      );
  }
});

test('disconnect always removes local session, reports revocation failure honestly', async () => {
  for (const ok of [true, false]) {
    const store = newYouTubeStore();
    store.sessions.set('session', {
      token: 'private',
      expires: Date.now() + 60000,
      channel: { id: 'channel-1', title: 'Channel' },
    });
    const service = createYouTubeConnectionService(store, config, async (url, init) => {
      assert.equal(url, 'https://oauth2.googleapis.com/revoke');
      assert.equal(new URLSearchParams(String(init?.body)).get('token'), 'private');
      return new Response(null, { status: ok ? 200 : 503 });
    });
    const result = await service.disconnect('session');
    assert.equal(store.sessions.size, 0);
    assert.equal(result.revoked, ok);
  }
});
