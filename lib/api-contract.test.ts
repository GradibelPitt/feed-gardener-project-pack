import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  API_CONTRACT_VERSION,
  API_INTERFACES,
  ApiResponseError,
  apiError,
  apiSuccess,
  readApiData,
} from './api-contract.ts';

test('API registry keeps unique method and path pairs', () => {
  const signatures = Object.values(API_INTERFACES).map(({ method, path }) => `${method} ${path}`);
  assert.equal(new Set(signatures).size, signatures.length);
});

test('every Route Handler method and path is present in the API registry', () => {
  const apiRoot = path.resolve('app/api');
  const routeFiles: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name === 'route.ts') routeFiles.push(file);
    }
  };
  visit(apiRoot);

  const implemented = routeFiles.flatMap((file) => {
    const routePath = `/api/${path.relative(apiRoot, path.dirname(file)).split(path.sep).join('/')}`;
    const methods = [
      ...readFileSync(file, 'utf8').matchAll(
        /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g,
      ),
    ].map((match) => match[1]);
    return methods.map((method) => `${method} ${routePath}`);
  });
  const registered = Object.values(API_INTERFACES).map(
    ({ method, path: routePath }) => `${method} ${routePath}`,
  );

  assert.deepEqual(implemented.sort(), registered.sort());
});

test('apiSuccess returns the shared envelope and contract header', async () => {
  const response = apiSuccess({ value: 7 }, { status: 201 });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('X-Feed-Gardener-Contract'), API_CONTRACT_VERSION);
  assert.deepEqual(await response.json(), {
    data: { value: 7 },
    meta: { contractVersion: API_CONTRACT_VERSION },
  });
});

test('apiError returns the shared error shape', async () => {
  const response = apiError(422, 'INVALID_INPUT', 'Input is invalid.');
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: { code: 'INVALID_INPUT', message: 'Input is invalid.', retryable: false },
    meta: { contractVersion: API_CONTRACT_VERSION },
  });
});

test('readApiData unwraps success and preserves structured failures', async () => {
  assert.deepEqual(await readApiData<{ ok: boolean }>(apiSuccess({ ok: true })), { ok: true });
  await assert.rejects(
    () => readApiData(apiError(503, 'UPSTREAM_ERROR', 'Try later.', true)),
    (error: unknown) =>
      error instanceof ApiResponseError &&
      error.code === 'UPSTREAM_ERROR' &&
      error.retryable &&
      error.status === 503,
  );
});
