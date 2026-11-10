import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import {inspectUsm} from '../lib/usm.mjs';
const base = process.env.BASE_URL || 'http://127.0.0.1:3213';
const source = process.env.SMOKE_VIDEO || 'test-output/test-video.webm';
const reuse = process.env.SMOKE_PROJECT_ID;
if (!source && !reuse) throw new Error('Set SMOKE_VIDEO to a test video path.');
async function json(url, options = {}) { const r = await fetch(base + url, options); const p = await r.json(); assert.ok(r.ok, p.error); return p; }
const send = (url, value, method='POST') => json(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(value) });
async function wait(id) {
  const until = Date.now() + 15*60000; let last='';
  while (Date.now() < until) {
    const p = await json(`/api/projects/${id}`);
    if (p.job.phase !== last) { console.log(p.job.phase); last=p.job.phase; }
    assert.notEqual(p.job.status,'failed',p.job.error);
    if (p.job.status === 'done') return p;
    await new Promise(r => setTimeout(r,1000));
  }
  throw new Error('Job timed out.');
}
let p = reuse ? await json(`/api/projects/${reuse}`) : await json('/api/projects', {method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(path.basename(source))},body:await readFile(source)});
console.log(`Project: ${p.id}`); if (!p.build) p=await wait(p.id);
assert.equal(p.totalFrames, Math.round(p.duration * p.settings.fps));
const prefix=`/api/projects/${p.id}`;
let r=await fetch(base+prefix+'/media/preview.mp4',{headers:{Range:'bytes=0-99'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,100);
r=await fetch(base+prefix+'/frame?n=15');assert.equal(r.status,200);const frame=Buffer.from(await r.arrayBuffer());assert.equal(frame.readUInt16BE(0),0xffd8);
p=await send(prefix+'/cues',{text:'1000\n500,1,A\n6500,2,B'},'PUT');assert.equal(p.cues[0].frame,15);assert.equal(p.cues.length,2);assert.equal(p.loop.enabled,true);
await send(prefix+'/cues',{cues:p.cues,loop:{a:15,b:195}},'PUT');
await send(prefix+'/seam',{a:15,b:195});p=await wait(p.id);
r=await fetch(base+p.seam.url);assert.equal(r.status,200);const seam=Buffer.from(await r.arrayBuffer());assert.ok(seam.length>1000);
await send(prefix+'/export',{cues:p.cues,loop:{a:15,b:195},bitrate:6000000,audio:false});p=await wait(p.id);
const exp=p.exports[0];assert.ok(exp.verified);assert.equal(exp.frames,p.totalFrames);
r=await fetch(base+prefix+`/exports/${exp.id}/video.usm`);assert.equal(r.status,200);const usm=Buffer.from(await r.arrayBuffer());assert.equal(usm.subarray(0,4).toString(),'CRID');
r=await fetch(base+prefix+`/exports/${exp.id}/cue_point.txt`);assert.match(await r.text(),/6500,2,B/);
if(exp.backend==='native') {
  const structure=inspectUsm(usm);assert.deepEqual(structure.cues,[{name:'A',time:500,id:1},{name:'B',time:6500,id:2}]);
  assert.ok(structure.seekCount>0);assert.equal(structure.frames,p.totalFrames);
  const report=await json(prefix+`/exports/${exp.id}/verification.json`);assert.equal(report.gameClientTested,false);assert.equal(report.mediaHash,structure.mediaHash);
}
await mkdir('test-output',{recursive:true});await writeFile('test-output/smoke.usm',usm);await writeFile('test-output/frame15.jpg',frame);await writeFile('test-output/seam.mp4',seam);await writeFile('test-output/smoke-result.json',JSON.stringify(p,null,2));
console.log(`PASS: upload, normalization, range playback, exact frame, cue import, seam, real encoder + embedded cues, download. ${usm.length} bytes.`);
