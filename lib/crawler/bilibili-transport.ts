import { connect } from 'node:tls';
import { gunzipSync, inflateSync } from 'node:zlib';

const ALLOWED_HOSTS = new Set(['api.bilibili.com', 'app.bilibili.com']);
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 12_000;

function decodeChunked(body: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < body.length) {
    const lineEnd = body.indexOf('\r\n', offset);
    if (lineEnd < 0) throw new Error('Incomplete Bilibili chunked response');
    const size = Number.parseInt(body.toString('ascii', offset, lineEnd).split(';')[0], 16);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid Bilibili response chunk');
    offset = lineEnd + 2;
    if (size === 0) return Buffer.concat(chunks);
    if (
      offset + size + 2 > body.length ||
      body.toString('ascii', offset + size, offset + size + 2) !== '\r\n'
    )
      throw new Error('Incomplete Bilibili response chunk');
    chunks.push(body.subarray(offset, offset + size));
    offset += size + 2;
  }
  throw new Error('Incomplete Bilibili chunked response');
}

function parseHttpResponse(raw: Buffer): Response {
  const separator = raw.indexOf('\r\n\r\n');
  if (separator < 0) throw new Error('Invalid Bilibili HTTP response');
  const [statusLine, ...headerLines] = raw.toString('latin1', 0, separator).split('\r\n');
  const status = Number(statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)?.[1]);
  if (!Number.isInteger(status)) throw new Error('Invalid Bilibili HTTP status');
  const headers = new Headers();
  for (const line of headerLines) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  let body = raw.subarray(separator + 4);
  if (headers.get('transfer-encoding')?.toLowerCase().includes('chunked'))
    body = decodeChunked(body);
  else if (headers.has('content-length')) {
    const length = Number(headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length < 0 || body.length < length)
      throw new Error('Incomplete Bilibili HTTP response');
    body = body.subarray(0, length);
  }
  const encoding = headers.get('content-encoding')?.toLowerCase();
  if (encoding === 'gzip') body = gunzipSync(body);
  if (encoding === 'deflate') body = inflateSync(body);
  return new Response(new Uint8Array(body), { status });
}

/** Fixed-host TLS fallback for Bilibili when the Worker fetch transport gets HTTP 412. */
export function fetchBilibiliViaTls(input: string): Promise<Response> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.port)
    throw new Error('Unsupported Bilibili endpoint');
  return new Promise((resolve, reject) => {
    const socket = connect({ host: url.hostname, port: 443, servername: url.hostname });
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(
      () => finish(new Error('Bilibili connection timed out')),
      REQUEST_TIMEOUT_MS,
    );
    function finish(error?: Error, response?: Response) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(response!);
    }
    socket.on('secureConnect', () => {
      socket.write(
        `GET ${url.pathname}${url.search} HTTP/1.1\r\n` +
          `Host: ${url.hostname}\r\n` +
          'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36\r\n' +
          'Accept: application/json\r\n' +
          'Accept-Encoding: identity\r\n' +
          'Referer: https://www.bilibili.com/\r\n' +
          'Connection: close\r\n\r\n',
      );
    });
    socket.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) return finish(new Error('Bilibili response too large'));
      chunks.push(chunk);
    });
    socket.on('end', () => {
      if (settled) return;
      try {
        finish(undefined, parseHttpResponse(Buffer.concat(chunks)));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on('error', (error) => finish(error));
  });
}
