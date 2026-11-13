import { ensure } from './model.mjs';

const loopbackHosts = 'localhost,127.0.0.1,[::1]';
const authority = /^(\[[0-9a-f:]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i;

export function contentType(req) {
  return (req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
}

function parseHost(value, protocol = 'http:') {
  ensure(typeof value === 'string', 'Host không hợp lệ.', 403);
  const match = authority.exec(value);
  ensure(match && (!match[2] || (Number(match[2]) > 0 && Number(match[2]) <= 65535)), 'Host không hợp lệ.', 403);
  let url;
  try { url = new URL(`${protocol}//${value}`); } catch { /* Reject invalid IPv6 and host syntax. */ }
  ensure(url, 'Host không hợp lệ.', 403);
  // Do not accept alternative IP encodings, escaped names, or a trailing DNS dot.
  ensure(url.hostname === match[1].toLowerCase(), 'Host không hợp lệ.', 403);
  return url;
}

export function createRequestGuard(allowedHosts = loopbackHosts) {
  const hosts = new Set(String(allowedHosts).split(',').map(value => {
    const name = value.trim();
    const parsed = parseHost(name);
    ensure(name.toLowerCase() === parsed.hostname, 'ALLOWED_HOSTS cần chứa tên host, không có cổng hoặc URL.', 500);
    return parsed.hostname;
  }));

  return req => {
    const raw = req.rawHeaders || [];
    for (const name of ['host', 'origin']) {
      const count = raw.filter((value, index) => index % 2 === 0 && value.toLowerCase() === name).length;
      ensure(count <= 1, 'Header yêu cầu bị trùng.', 403);
    }
    const protocol = req.socket?.encrypted ? 'https:' : 'http:';
    const target = parseHost(req.headers.host, protocol);
    ensure(hosts.has(target.hostname), 'Host không được phép.', 403);

    if (req.headers.origin !== undefined) {
      const origin = req.headers.origin;
      // Browser Origin headers contain only scheme + authority, never paths or credentials.
      const match = typeof origin === 'string' && /^(https?):\/\/([^/]+)$/.exec(origin);
      ensure(match, 'Yêu cầu khác nguồn bị từ chối.', 403);
      const source = parseHost(match[2], `${match[1]}:`);
      ensure(source.origin === target.origin, 'Yêu cầu khác nguồn bị từ chối.', 403);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      ensure(req.headers['sec-fetch-site'] !== 'cross-site', 'Yêu cầu khác nguồn bị từ chối.', 403);
    }
    // Forwarded headers are intentionally ignored: they are not a source of trust.
  };
}
