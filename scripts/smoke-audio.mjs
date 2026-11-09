import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { probe } from '../lib/media.mjs';
import { inspectUsm } from '../lib/usm.mjs';
const base=process.env.BASE_URL || 'http://127.0.0.1:3213';
async function request(url, value, method='POST', expected=200) {
  const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  const p=await r.json();assert.equal(r.status,expected,p.error);return p;
}
async function wait(id) {
  const end=Date.now()+10*60000;
  while(Date.now()<end){const p=await(await fetch(`${base}/api/projects/${id}`)).json();assert.notEqual(p.job.status,'failed',p.job.error);if(p.job.status==='done')return p;await new Promise(r=>setTimeout(r,700));}
  throw new Error('Timeout');
}
let r=await fetch(base+'/api/projects',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':'test-audio.mp4'},body:await readFile('test-output/test-audio.mp4')});
assert.equal(r.status,202);let p=await r.json();p=await wait(p.id);const url=`/api/projects/${p.id}`; console.log(`Audio project: ${p.id}`);
assert.equal(p.meta.audio,true);assert.equal(p.totalFrames,60);
await request(url+'/cues',{cues:[{name:'loop_point',id:1,frame:6},{name:'loop_start',id:2,frame:54}],loop:{a:6,b:54}},'PUT');
await request(url+'/prepare',{width:640,height:360,fps:24,bitrate:1000000,audio:true},'POST',202);p=await wait(p.id);
assert.equal(p.totalFrames,48);assert.deepEqual(p.cues.map(c=>c.frame),[5,43]);
await request(url+'/cues',{cues:[{name:'outside',id:1,frame:49}]},'PUT',400);
await request(url+'/seam',{a:10,b:5},'POST',400);
r=await fetch(base+url+'/media/missing.mp4');assert.equal(r.status,404);
r=await fetch(base+url+'/media/seam-999-1000.mp4');assert.equal(r.status,404);
r=await fetch(base+url+'/media/preview.mp4',{headers:{Range:'bytes=999999999-'}});assert.equal(r.status,416);
const saved=await(await fetch(base+url+'/project.json')).json();
await request(url+'/restore',saved);
await request(url+'/export',{audio:true,bitrate:1000000,loop:{a:5,b:43}},'POST',202);p=await wait(p.id);
r=await fetch(base+url+`/exports/${p.exports[0].id}/video.usm`);assert.equal(r.status,200);
await writeFile('test-output/audio.usm',Buffer.from(await r.arrayBuffer()));
const info=await probe('test-output/audio.usm',true);assert.ok(info.streams.some(s=>s.codec_type==='audio'));
assert.equal(info.streams.find(s=>s.codec_type==='video').nb_read_frames,'48');
if(p.exports[0].backend==='native') assert.deepEqual(inspectUsm(await readFile('test-output/audio.usm')).cues,[{name:'loop_point',time:208,id:1},{name:'loop_start',time:1792,id:2}]);
await request(url,{},'DELETE');
r=await fetch(base+url);assert.equal(r.status,404);
console.log('PASS: MP4 + audio, FPS/resolution rebuild, cue remap, project restore, invalid inputs, missing-file recovery, range errors, audio USM export, project cleanup.');
