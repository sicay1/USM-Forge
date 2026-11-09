// Run inside Linux with the workspace mounted at /work.
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {run,encode,probe} from '../lib/media.mjs';
import {inspectUsm} from '../lib/usm.mjs';
await mkdir('test-output/native-matrix',{recursive:true});
const root=await mkdtemp('test-output/native-matrix/run-');
for(const fps of [24,25,30,50,60]) {
  const dir=path.resolve(root,String(fps));await mkdir(dir,{recursive:true});
  await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc2=size=320x180:rate=${fps}`,'-t','1','-c:v','ffv1','-pix_fmt','yuv420p',path.join(dir,'master.mkv')]);
  const cues=fps===50?[]:[{name:'start',id:0,frame:0},{name:'end',id:65535,frame:fps}];
  const snapshot={settings:{width:320,height:180,fps,bitrate:fps===60?40000000:1000000,audio:false},meta:{audio:false},duration:1,totalFrames:fps,cues,loop:{a:0,b:fps},name:'matrix'};
  const out=path.join(dir,'export');const result=await encode(dir,out,snapshot,()=>{});
  assert.equal(result.frames,fps);assert.equal(result.backend,'native');
  const report=inspectUsm(await readFile(path.join(out,'video.usm')));assert.equal(report.cues.length,cues.length);
  const decoded=await probe(path.join(out,'video.usm'),true);assert.equal(Number(decoded.streams[0].nb_read_frames),fps);
  console.log(`PASS: ${fps} fps, ${snapshot.settings.bitrate/1000000} Mbps, ${cues.length} cues, ${result.seekEntries} seek entries`);
}
console.log(`Native matrix saved at ${root}`);
