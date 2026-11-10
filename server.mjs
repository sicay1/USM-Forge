import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ensure, settings, cueText, parseCueText, loopRange, cuePair, rescaleCuePair, Queue } from './lib/model.mjs';
import * as media from './lib/media.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const maxUpload = Number(process.env.MAX_UPLOAD_MB || 512) * 1024 * 1024;
const projects = new Map(), queue = new Queue(1), previews = new Queue(1);
const port = Number(process.env.PORT || 3210), host = process.env.HOST || '127.0.0.1';
await mkdir(data, { recursive: true });
for (const id of await readdir(data)) {
  if (!/^[a-f0-9-]{36}$/.test(id)) continue;
  try {
    const p = JSON.parse(await readFile(path.join(data, id, 'project.json'), 'utf8'));
    if (p.totalFrames) Object.assign(p, cuePair(p.cues || [], p.totalFrames, p.loop));
    if (p.job && ['queued', 'running'].includes(p.job.status)) p.job = { ...p.job, status: 'failed', phase: 'Bị gián đoạn do máy chủ khởi động lại', error: 'Hãy chạy lại thao tác.' };
    projects.set(id, p);
  } catch { /* Interrupted upload has no project metadata. */ }
}
const dir = id => path.join(data, id);
const masterDir = p => path.join(dir(p.id), p.build);
async function save(p) {
  const file = path.join(dir(p.id), 'project.json');
  const temp = file + '.' + randomUUID() + '.tmp';
  p.updated = new Date().toISOString();
  await writeFile(temp, JSON.stringify(p, null, 2));
  await rename(temp, file);
}
function get(id) { const p = projects.get(id); ensure(p, 'Không tìm thấy dự án.', 404); return p; }
function idle(p) { ensure(!p.job || !['queued', 'running'].includes(p.job.status), 'Dự án đang xử lý, vui lòng đợi.', 409); }
function ready(p) { ensure(p.build && p.totalFrames, 'Video chưa sẵn sàng.', 409); }
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; ensure(size <= 256000, 'Dữ liệu yêu cầu quá lớn.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw Object.assign(new Error('JSON không hợp lệ.'), { status: 400 }); }
}
async function file(req, res, target, { download, type } = {}) {
  let info; try { info = await stat(target); } catch { throw Object.assign(new Error('File chưa tồn tại.'), { status: 404 }); }
  const ext = path.extname(target);
  const headers = { 'Content-Type': type || ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.usm': 'application/octet-stream' }[ext] || 'application/octet-stream'), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (download) headers['Content-Disposition'] = `attachment; filename="${download}"`;
  let start = 0, end = info.size - 1, status = 200;
  if (req.headers.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!m || (!m[1] && !m[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
    if (!m[1]) start = Math.max(0, info.size - Number(m[2]));
    else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
    if (start > end || start >= info.size || !Number.isSafeInteger(start)) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  }
  headers['Content-Length'] = Math.max(0, end - start + 1);
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  await pipeline(createReadStream(target, { start, end }), res);
}

async function job(p, type, task) {
  idle(p);
  const current = { id: randomUUID(), type, status: 'queued', phase: 'Đang chờ xử lý', progress: 0, started: new Date().toISOString() };
  p.job = current; await save(p);
  queue.add(async () => {
    current.status = 'running'; await save(p);
    try {
      await task((phase, progress) => { current.phase = phase; current.progress = Math.round(progress); }, current.id);
      current.status = 'done'; current.phase = 'Hoàn tất'; current.progress = 100;
    } catch (error) {
      current.status = 'failed'; current.phase = 'Không hoàn tất'; current.error = error.message;
      console.error(`[${type}] ${p.id}: ${error.message}`);
    }
    await save(p);
  }).catch(error => { current.status = 'failed'; current.error = error.message; console.error(error); });
  return current;
}

async function build(p, s, update, id) {
  const buildName = `build-${id}`;
  const target = path.join(dir(p.id), buildName);
  try {
    const result = await media.prepare(path.join(dir(p.id), 'source'), target, s, p.meta, update);
    const pair = rescaleCuePair(p, result.totalFrames, s.fps);
    // Keep prior builds until the user deletes the project; in-flight frame requests stay valid.
    Object.assign(p, result, { build: buildName, settings: s, ...pair });
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    const method = req.method;
    if (!['GET', 'HEAD'].includes(method)) {
      if (req.headers.origin) ensure(new URL(req.headers.origin).host === req.headers.host, 'Yêu cầu khác nguồn bị từ chối.', 403);
      if (url.pathname !== '/api/projects') ensure((req.headers['content-type'] || '').startsWith('application/json'), 'Yêu cầu cần dùng JSON.', 415);
    }
    if (url.pathname === '/api/health' && method === 'GET') { const encoder=await media.encoderStatus(); return json(res, { name:'USM Forge',version:'0.2.0',encoder:encoder.available,encoderInfo:encoder,platform:process.platform,maxUploadMB:maxUpload/1024/1024,queue:queue.pending.length,active:queue.active }); }
    if (url.pathname === '/api/projects' && method === 'GET') return json(res, [...projects.values()].sort((a, b) => b.updated.localeCompare(a.updated)));
    if (url.pathname === '/api/projects' && method === 'POST') {
      ensure((req.headers['content-type'] || '').startsWith('application/octet-stream'), 'Upload cần là luồng file video.', 415);
      ensure(Number(req.headers['content-length'] || 0) <= maxUpload, 'File vượt giới hạn dung lượng.', 413);
      ensure(queue.pending.length < 10, 'Hàng đợi đầy, hãy thử lại sau.', 429);
      let name; try { name = decodeURIComponent(req.headers['x-file-name'] || 'video'); } catch { name = 'video'; }
      name = name.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 150);
      const id = randomUUID(); await mkdir(dir(id), { recursive: true });
      let bytes = 0;
      try {
        await pipeline(req, new Transform({ transform(chunk, enc, done) { bytes += chunk.length; done(bytes > maxUpload ? new Error('File vượt giới hạn dung lượng.') : null, chunk); } }), createWriteStream(path.join(dir(id), 'source'), { flags: 'wx' }));
        ensure(bytes > 0, 'File rỗng.');
        const p = { id, name, created: new Date().toISOString(), updated: new Date().toISOString(), exports: [] };
        projects.set(id, p); await save(p);
        await job(p, 'prepare', async (update, jobId) => {
          update('Đọc thông tin video', 2);
          p.meta = await media.inspect(path.join(dir(id), 'source'));
          const ratio = Math.min(1, 1920 / p.meta.width, 1080 / p.meta.height);
          const s = settings({ width: Math.max(64, Math.round(p.meta.width * ratio / 2) * 2), height: Math.max(64, Math.round(p.meta.height * ratio / 2) * 2), fps: 30 });
          await build(p, s, update, jobId);
        });
        return json(res, p, 202);
      } catch (error) { if (!projects.has(id)) await rm(dir(id), { recursive: true, force: true }); throw error; }
    }
    const match = /^\/api\/projects\/([a-f0-9-]{36})(?:\/(.*))?$/.exec(url.pathname);
    if (match) {
      const p = get(match[1]), action = match[2] || '';
      if (!action && method === 'GET') return json(res, p);
      if (!action && method === 'DELETE') {
        idle(p);
        ensure(previews.active === 0 && previews.pending.length === 0, 'Đợi tải frame xong rồi xóa dự án.', 409);
        const target = path.resolve(dir(p.id));
        ensure(path.dirname(target) === data && /^[a-f0-9-]{36}$/.test(path.basename(target)), 'Đường dẫn dự án không hợp lệ.', 500);
        await rm(target, { recursive: true, force: true });
        projects.delete(p.id);
        return json(res, { deleted: true });
      }
      if (action === 'prepare' && method === 'POST') {
        idle(p); const s = settings(await body(req));
        ensure(p.meta, 'Video nguồn chưa được đọc thành công. Hãy tải lại video.');
        ensure(!s.audio || p.meta.audio, 'Video không có âm thanh.');
        await job(p, 'prepare', (update, id) => build(p, s, update, id)); return json(res, p, 202);
      }
      if (action === 'cues' && method === 'PUT') {
        idle(p); ready(p); const value = await body(req);
        const { cues: list, loop } = cuePair(value.text !== undefined ? parseCueText(value.text, p.settings.fps, p.totalFrames) : value.cues, p.totalFrames);
        const s = settings({ ...p.settings, bitrate: value.bitrate ?? p.settings.bitrate, audio: value.audio ?? p.settings.audio });
        ensure(!s.audio || p.meta.audio, 'Video không có âm thanh.');
        p.cues = list; p.loop = loop; p.settings = s; await save(p); return json(res, p);
      }
      if (action === 'restore' && method === 'POST') {
        idle(p); ready(p); const value = await body(req);
        ensure(value.schema === 'usm-studio/v1', 'File dự án không được hỗ trợ.');
        const s = settings(value.settings);
        ensure(s.width === p.settings.width && s.height === p.settings.height && s.fps === p.settings.fps && value.totalFrames === p.totalFrames, 'Hãy áp dụng cùng kích thước và FPS của dự án đã lưu trước khi nhập.');
        ensure(!s.audio || p.meta.audio, 'Video không có âm thanh.');
        const { cues: list, loop } = cuePair(value.cues, p.totalFrames, value.loop);
        p.cues = list; p.loop = loop; p.settings = s; await save(p); return json(res, p);
      }
      if (action === 'project.json' && method === 'GET') {
        ready(p); res.setHeader('Content-Disposition', 'attachment; filename="project.json"');
        return json(res, { schema: 'usm-studio/v1', name: p.name, settings: p.settings, totalFrames: p.totalFrames, cues: p.cues, loop: p.loop });
      }
      if (action === 'cue_point.txt' && method === 'GET') {
        ready(p); res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="cue_point.txt"' }); return res.end(cueText(p.cues, p.settings.fps));
      }
      if (action === 'frame' && method === 'GET') {
        ready(p); const n = Number(url.searchParams.get('n'));
        ensure(Number.isInteger(n) && n >= 0 && n < p.totalFrames, 'Frame không hợp lệ.');
        ensure(previews.pending.length < 8, 'Đang tải nhiều frame, hãy thử lại.', 429);
        const buildDir = masterDir(p);
        const target = await previews.add(() => media.frame(buildDir, n));
        return await file(req, res, target);
      }
      if (action === 'seam' && method === 'POST') {
        idle(p); ready(p); const range = loopRange(await body(req), p.totalFrames);
        await job(p, 'seam', async (update) => { update('Ghép đoạn nối B → A', 25); await media.seam(masterDir(p), range.a, range.b, p.settings.fps); p.seam = { ...range, build: p.build, url: `/api/projects/${p.id}/media/seam-${range.a}-${range.b}.mp4?v=${p.build}` }; });
        return json(res, p, 202);
      }
      if (action.startsWith('media/') && ['GET', 'HEAD'].includes(method)) {
        ready(p); const name = action.slice(6);
        ensure(/^(preview\.mp4|thumbs\.jpg|seam-\d+-\d+\.mp4)$/.test(name), 'Không tìm thấy file.', 404);
        return await file(req, res, path.join(masterDir(p), name));
      }
      if (action === 'export' && method === 'POST') {
        idle(p); ready(p); const value = await body(req);
        const encoder=await media.encoderStatus(); ensure(encoder.available,encoder.error || 'Encoder chưa được cấu hình.',503);
        const s = settings({ ...p.settings, bitrate: value.bitrate ?? p.settings.bitrate, audio: value.audio ?? p.settings.audio });
        ensure(!s.audio || p.meta.audio, 'Video không có âm thanh.');
        const { cues: list, loop } = cuePair(value.cues ?? p.cues, p.totalFrames);
        p.cues = list; p.loop = loop; p.settings = s;
        const snapshot = { schema: 'usm-studio/v1', name: p.name, settings: s, cues: list, loop, meta: p.meta, totalFrames: p.totalFrames, duration: p.duration };
        await job(p, 'export', async (update, id) => {
          const result = await media.encode(masterDir(p), path.join(dir(p.id), 'exports', id), snapshot, update);
          p.exports.unshift({ id, date: new Date().toISOString(), ...result, settings: s });
        });
        return json(res, p, 202);
      }
      const download = /^exports\/([a-f0-9-]{36})\/(video\.usm|cue_point\.txt|project\.json|verification\.json)$/.exec(action);
      if (download && ['GET', 'HEAD'].includes(method)) {
        ensure(p.exports.some(e => e.id === download[1]), 'Bản xuất chưa hoàn tất.', 404);
        return await file(req, res, path.join(dir(p.id), 'exports', download[1], download[2]), { download: download[2] === 'video.usm' ? 'video.usm' : download[2] });
      }
    }
    const brandAsset = /^\/icons\/film-u-(?:16|32|48|64|128|180|512)\.png$/.test(url.pathname);
    if (['GET', 'HEAD'].includes(method) && (brandAsset || ['/', '/app.js', '/i18n.js', '/style.css', '/editor.css', '/favicon.ico'].includes(url.pathname))) return await file(req, res, path.join(root, 'public', url.pathname === '/' ? 'index.html' : url.pathname.slice(1)));
    json(res, { error: 'Không tìm thấy.' }, 404);
  } catch (error) {
    if (res.headersSent || res.destroyed) return;
    json(res, { error: error.message || 'Lỗi máy chủ.' }, error.status || 500);
  }
});
server.requestTimeout = 15 * 60000;
server.listen(port, host, () => console.log(`USM Forge: http://${host}:${port}\nData: ${data}\nEncoder backend: ${media.backend}`));
