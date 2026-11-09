import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {inspectUsm} from '../lib/usm.mjs';
const base=process.env.BASE_URL || 'http://127.0.0.1:3213';
async function json(url,options={}) {
  const r=await fetch(base+url,options),p=await r.json();assert.ok(r.ok,p.error);return p;
}
async function wait(id) {
  const end=Date.now()+600000;
  while(Date.now()<end) {
    const p=await json(`/api/projects/${id}`);assert.notEqual(p.job.status,'failed',p.job.error);
    if(p.job.status==='done')return p;
    await new Promise(r=>setTimeout(r,700));
  }
  throw new Error('Timeout');
}
let p=await json('/api/projects',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':'test-input.avi'},body:await readFile('test-output/test-input.avi')});
p=await wait(p.id);assert.equal(p.meta.codec,'mjpeg');assert.equal(p.totalFrames,60);
const prefix=`/api/projects/${p.id}`;
const cues=[{name:'loop_point',id:1,frame:15},{name:'loop_start',id:2,frame:45}];
await json(prefix+'/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cues,loop:{a:15,b:45},bitrate:1000000,audio:false})});
p=await wait(p.id);const exp=p.exports[0];assert.equal(exp.backend,'native');assert.equal(exp.verified,true);
const r=await fetch(base+prefix+`/exports/${exp.id}/video.usm`);assert.ok(r.ok);
const usm=Buffer.from(await r.arrayBuffer()),structure=inspectUsm(usm);
assert.equal(structure.frames,60);assert.ok(structure.seekCount>0);
assert.deepEqual(structure.cues,[{name:'loop_point',time:500,id:1},{name:'loop_start',time:1500,id:2}]);
const report=await json(prefix+`/exports/${exp.id}/verification.json`);
assert.equal(report.decoder.codec,'mpeg1video');assert.equal(report.decoder.frames,60);assert.equal(report.mediaHash,structure.mediaHash);
await writeFile('test-output/avi.usm',usm);
await writeFile('test-output/avi-result.json',JSON.stringify(p,null,2));
await json(prefix,{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'});
console.log(`PASS: AVI upload → normalization → native USM, 60 decoded frames, exact embedded cues, valid seek offsets, download and cleanup. ${usm.length} bytes.`);
