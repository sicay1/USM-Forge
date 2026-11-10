import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequestGuard } from '../lib/http-security.mjs';

const guard = createRequestGuard();
const request = (headers, method = 'GET', rawHeaders = []) => ({ headers, method, rawHeaders });
const forbidden = error => error.status === 403;

test('trusted loopback hosts accept mapped ports and local CLI requests', () => {
  for (const host of ['localhost', 'LOCALHOST:3213', '127.0.0.1:3214', '[::1]:3213']) {
    for (const method of ['GET', 'HEAD', 'POST']) assert.doesNotThrow(() => guard(request({ host }, method)));
  }
  assert.doesNotThrow(() => guard(request({ host:'localhost:80', origin:'http://localhost' }, 'PUT')));
  assert.doesNotThrow(() => guard(request({ host:'localhost', origin:'http://localhost:80' }, 'PUT')));
  assert.doesNotThrow(() => guard(request({ host:'LOCALHOST:3213', origin:'http://localhost:3213' }, 'PUT')));
});

test('untrusted, missing and malformed Host values are rejected before all routes', () => {
  const hosts = [undefined, '', 'audit.invalid:3213', 'localhost.attacker.invalid', 'localhost.', '0.0.0.0',
    '127.1', '2130706433', '0177.0.0.1', '[::ffff:127.0.0.1]', 'localhost:0', 'localhost:65536',
    'localhost:999999', 'localhost:abc', 'http://localhost', 'user@localhost', 'localhost/path',
    'localhost?query', 'localhost#fragment', 'local%68ost', 'localhost\\evil', ' localhost', 'localhost,evil'];
  for (const host of hosts) for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS']) {
    assert.throws(() => guard(request({ host }, method)), forbidden, `${method} ${host}`);
  }
});

test('foreign, null, malformed and cross-port Origins are rejected for reads and writes', () => {
  const origins = ['http://audit.invalid:3213', 'http://127.0.0.1:3213', 'http://localhost:3214',
    'https://localhost:3213', 'null', '', 'http://localhost:3213/', 'http://localhost:3213/path',
    'http://user@localhost:3213', 'http://localhost:3213?query', 'http://localhost:3213#fragment',
    'http://localhost:3213 http://audit.invalid', ['http://localhost:3213']];
  for (const origin of origins) for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    assert.throws(() => guard(request({ host:'localhost:3213', origin }, method)), forbidden);
  }
});

test('matching attacker Host and Origin cannot bypass trust; forwarded headers are ignored', () => {
  assert.throws(() => guard(request({host:'audit.invalid:3213',origin:'http://audit.invalid:3213',
    'x-forwarded-host':'localhost:3213','x-forwarded-proto':'http'}, 'DELETE')), forbidden);
  assert.throws(() => guard(request({host:'localhost:3213',origin:'https://localhost:3213',
    'x-forwarded-proto':'https'}, 'PUT')), forbidden);
});

test('duplicate security headers and cross-site browser mutations are rejected', () => {
  assert.throws(() => guard(request({host:'localhost'}, 'GET', ['Host','localhost','hOsT','audit.invalid'])), forbidden);
  assert.throws(() => guard(request({host:'localhost',origin:'http://localhost'}, 'POST',
    ['Origin','http://localhost','origin','http://audit.invalid'])), forbidden);
  assert.throws(() => guard(request({host:'localhost','sec-fetch-site':'cross-site'}, 'POST')), forbidden);
  // Opening the editor from a documentation link remains possible.
  assert.doesNotThrow(() => guard(request({host:'localhost','sec-fetch-site':'cross-site'}, 'GET')));
});

test('custom hostname trust is explicit, exact and rejects unsafe configuration', () => {
  const custom = createRequestGuard('localhost,studio.test');
  assert.doesNotThrow(() => custom(request({host:'studio.test:3213',origin:'http://studio.test:3213'}, 'POST')));
  assert.throws(() => custom(request({host:'sub.studio.test:3213'})), forbidden);
  assert.throws(() => custom(request({host:'127.0.0.1:3213'})), forbidden);
  for (const value of ['', '*', '*.test', 'http://studio.test', 'studio.test:3213', 'localhost,', 'studio.test.']) {
    assert.throws(() => createRequestGuard(value));
  }
});

function send(port, method, url, headers = {}, body) {
  return new Promise((resolve, reject) => {
    if (body !== undefined) headers = {...headers, 'Content-Length':Buffer.byteLength(body)};
    const req = http.request({hostname:'127.0.0.1',port,method,path:url,headers}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status:res.statusCode, body:Buffer.concat(chunks).toString()}));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('HTTP test timed out')));
    req.end(body);
  });
}

test('real HTTP server blocks rebinding reads/mutations while local project editing works', {timeout:30000}, async () => {
  const tempRoot = path.resolve(tmpdir());
  const data = await mkdtemp(path.join(tempRoot, 'usm-forge-security-'));
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const projectDir = path.join(data, id);
  const file = path.join(projectDir, 'project.json');
  let child, closed;
  try {
    await mkdir(path.join(projectDir, 'build-test'), {recursive:true});
    const project = {id,name:'synthetic-test',updated:'2026-01-01T00:00:00Z',build:'build-test',totalFrames:90,
      settings:{width:64,height:64,fps:30,bitrate:1000000,audio:false},meta:{audio:false},exports:[],
      cues:[{name:'A',id:1,frame:0},{name:'B',id:2,frame:90}]};
    await writeFile(file, JSON.stringify(project));
    await writeFile(path.join(projectDir,'build-test','preview.mp4'), 'synthetic media');
    const root = fileURLToPath(new URL('../', import.meta.url));
    child = spawn(process.execPath, ['server.mjs'], {cwd:root,windowsHide:true,
      env:{...process.env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:data,ALLOWED_HOSTS:'localhost,127.0.0.1,[::1]',USM_BACKEND:'disabled-for-test'},
      stdio:['ignore','pipe','pipe']});
    closed = once(child, 'close');
    const port = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => finish(new Error('Test server startup timed out')), 10000);
      function finish(error, port) { clearTimeout(timer); error ? reject(error) : resolve(port); }
      child.once('error', error => finish(error));
      child.once('exit', code => finish(new Error(`Test server exited (${code}): ${output}`)));
      child.stdout.on('data', chunk => { output += chunk; const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output); if (match) finish(null, Number(match[1])); });
      child.stderr.on('data', chunk => { output += chunk; });
    });
    const local = `127.0.0.1:${port}`, foreign = `audit.invalid:${port}`;
    const prefix = `/api/projects/${id}`;
    const body = JSON.stringify({cues:[{name:'A',id:1,frame:5},{name:'B',id:2,frame:80}]});
    assert.equal((await send(port,'GET','/api/projects')).status,200);
    for (const url of ['/', '/api/health', '/api/projects', `${prefix}/media/preview.mp4`]) {
      assert.equal((await send(port,'GET',url,{Host:foreign})).status,403);
    }
    assert.equal((await send(port,'GET','/api/projects',{Origin:`http://${foreign}`})).status,403);
    for (const [method,url] of [['POST','/api/projects'],['PUT',`${prefix}/cues`],['DELETE',prefix]]) {
      assert.equal((await send(port,method,url,{Host:foreign,Origin:`http://${foreign}`,'Content-Type':'application/json'},body)).status,403);
    }
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')).cues,project.cues);
    assert.equal((await send(port,'PUT',`${prefix}/cues`,{Origin:'null','Content-Type':'application/json'},body)).status,403);
    assert.equal((await send(port,'PUT',`${prefix}/cues`,{Host:local,Origin:`http://${local}`,'Content-Type':'application/json'},body)).status,200);
    assert.equal(JSON.parse(await readFile(file,'utf8')).cues[0].frame,5);
    assert.equal((await send(port,'GET',`${prefix}/media/preview.mp4`)).body,'synthetic media');
    assert.equal((await send(port,'GET','/.git/config')).status,404);
    assert.equal((await send(port,'DELETE',prefix,{'Content-Type':'application/json'},'{}')).status,200);
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (closed) await closed;
    assert.equal(path.dirname(data),tempRoot);
    assert.ok(path.basename(data).startsWith('usm-forge-security-'));
    await rm(data,{recursive:true,force:true});
  }
});
