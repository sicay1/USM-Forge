// Self-contained API/media integration test: synthetic USMs only, no Python or USM encoder.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, ffmpeg, ffprobe, inspect } from '../lib/media.mjs';
import { makeChunk, writeUtf, readChunks, readUtf } from '../lib/usm.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(path.join(root,'test-output'), {recursive:true});
const work = await mkdtemp(path.join(root,'test-output','convert-'));
const scalar = row => Object.keys(row).map(name => ({name,type:4}));
const header = (type, name, row) => makeChunk(type,1,writeUtf(name,scalar(row),[row]));
async function fixture(codec, sound, rate='25') {
  const stem=`${codec}-${sound ? 'audio' : 'silent'}-${rate.replace('/','_')}`;
  const elementary=path.join(work,`${stem}.mpeg`), adx=path.join(work,`${stem}.adx`);
  await run(ffmpeg,['-v','error','-y','-f','lavfi','-i',`testsrc2=size=320x180:rate=${rate}`,'-frames:v','25','-c:v',codec,'-bf',codec==='mpeg2video'?'2':'0','-f',codec,elementary]);
  const video=await readFile(elementary);
  const packets=JSON.parse((await run(ffprobe,['-v','error','-show_packets','-show_entries','packet=pos,size','-of','json',elementary])).stdout).packets;
  assert.equal(packets.length,25);
  const [num,den='1']=rate.split('/');
  const chunks=[makeChunk('CRID',1,writeUtf('CRIUSF_DIR_STREAM',[{name:'filename',type:10}],[{filename:'synthetic.usm'}]),{size:2048}),
    header('@SFV','VIDEO_HDRINFO',{width:320,height:180,total_frames:25,framerate_n:Number(num),framerate_d:Number(den),mpeg_codec:1})];
  if (sound) {
    await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(25*Number(den)/Number(num)),'-ac','2','-c:a','adpcm_adx',adx]);
    const audio=await readFile(adx), headerSize=audio.readUInt16BE(2)+4;
    chunks.push(header('@SFA','AUDIO_HDRINFO',{sampling_rate:48000,num_channels:2,total_samples:audio.readUInt32BE(12),audio_codec:2}),makeChunk('@SFA',0,audio.subarray(0,headerSize)));
    // ADX's first data chunk is codec extradata; later chunks contain whole ADX blocks.
    for(let at=headerSize;at<audio.length;at+=36*256) chunks.push(makeChunk('@SFA',0,audio.subarray(at,Math.min(audio.length,at+36*256))));
  }
  for(const packet of packets) chunks.push(makeChunk('@SFV',0,video.subarray(Number(packet.pos),Number(packet.pos)+Number(packet.size))));
  const file=path.join(work,`${stem}.usm`); await writeFile(file,Buffer.concat(chunks));
  return {file,video,adx};
}
const holder=net.createServer(); holder.listen(0,'127.0.0.1'); await once(holder,'listening');
const port=holder.address().port; await new Promise(resolve=>holder.close(resolve));
const base=`http://127.0.0.1:${port}`, data=path.join(work,'data');
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:data,USM_BACKEND:'medianoche',ENCODER_PATH:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs=''; child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const closed=once(child,'exit');
const pause=()=>new Promise(resolve=>setTimeout(resolve,150));
async function request(url, options={}) { const response=await fetch(base+url,options); const value=await response.json(); assert.ok(response.ok,JSON.stringify(value)); return value; }
const send=(url,value)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
async function wait(id) {
  const deadline=Date.now()+120000;
  while(Date.now()<deadline) {
    const p=await request(`/api/projects/${id}`);
    assert.notEqual(p.job.status,'failed',p.job.error);
    if(p.job.status==='done') return p;
    await pause();
  }
  throw new Error('Job timed out');
}
async function mediaInfo(file) { return JSON.parse((await run(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file])).stdout); }
async function upload(file, name=path.basename(file)) {
  const p=await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name)},body:await readFile(file)});
  return wait(p.id);
}
try {
  for(let i=0;;i++) {
    try { await fetch(base+'/'); break; } catch { assert.ok(i<100,logs); await pause(); }
  }
  assert.equal((await request('/api/health')).encoder,false,'conversion must not require a USM encoder');
  let lastProject, lastSource;
  for(const [codec,sound,rate] of [['mpeg1video',true,'25'],['mpeg2video',false,'25'],['mpeg2video',true,'30000/1001']]) {
    const source=await fixture(codec,sound,rate);
    let p=await upload(source.file,'source-without-extension');
    assert.equal(p.meta.format,'usm'); assert.equal(p.meta.frames,25);
    assert.equal(p.meta.codec,codec); assert.equal(p.meta.audio,sound);
    const prefix=`/api/projects/${p.id}`;
    lastProject=p;lastSource=source;
    const invalid=await fetch(base+prefix+'/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"format":"../../bad"}'});
    assert.equal(invalid.status,400);
    for(const format of ['mp4','avi']) {
      await send(prefix+'/convert',{format});
      const conflict=await fetch(base+prefix+'/convert',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(conflict.status,409);
      p=await wait(p.id); const out=p.conversions[0];
      assert.equal(out.frames,25); assert.equal(out.width,320); assert.equal(out.height,180); assert.equal(out.audio,sound);
      // Preview is deliberately normalized to 30 fps; conversion must retain the original 25/29.97 fps.
      const dir=path.join(work,out.id); await mkdir(dir);
      for(const name of out.files) {
        const response=await fetch(base+prefix+`/conversions/${out.id}/${name}`);
        assert.equal(response.status,200); assert.ok(response.headers.get('content-disposition').includes(name));
        const bytes=Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length>0); await writeFile(path.join(dir,name),bytes);
        if(name.endsWith('m1v') || name.endsWith('m2v')) assert.deepEqual(bytes,source.video,'elementary video must be bit-exact');
        if(name==='audio.adx') assert.deepEqual(bytes,await readFile(source.adx),'ADX must retain its full original header and payload');
        if(name.endsWith('adx') || name.endsWith('wav')) {
          const info=await mediaInfo(path.join(dir,name)); assert.equal(info.streams[0].codec_type,'audio');
          assert.ok(Number(info.streams[0].nb_read_frames)>0);
        }
      }
      const info=await mediaInfo(path.join(dir,`video.${format}`)), v=info.streams.find(s=>s.codec_type==='video'), a=info.streams.find(s=>s.codec_type==='audio');
      assert.equal(Number(v.nb_read_frames),25); assert.equal(v.avg_frame_rate,rate.includes('/') ? rate : `${rate}/1`);
      assert.equal(v.codec_name,format==='mp4'?'h264':'mpeg4'); assert.equal(Boolean(a),sound);
      if(a) { assert.equal(a.codec_name,format==='mp4'?'aac':'pcm_s16le'); if(format==='avi') assert.equal(a.sample_rate,'44100'); }
      const report=JSON.parse(await readFile(path.join(dir,'verification.json'),'utf8')); assert.equal(report.sourceUsed,'original-usm');
      const range=await fetch(base+prefix+`/conversions/${out.id}/video.${format}`,{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
      assert.equal((await fetch(base+prefix+`/conversions/${out.id}/convert.log`)).status,404);
      if(!sound) assert.equal((await fetch(base+prefix+`/conversions/${out.id}/audio.wav`)).status,404);
      console.log(`PASS ${codec} ${rate} fps ${sound?'audio':'silent'} → ${format}: 25 source frames, decoded output + downloads`);
    }
    await send(prefix+'/convert',{audio:false,extract:false}); p=await wait(p.id);
    assert.deepEqual(p.conversions[0].files,['video.mp4','verification.json']); assert.equal(p.conversions[0].audio,false);
    const missing=await fetch(base+prefix+`/conversions/${p.conversions[0].id}/audio.wav`); assert.equal(missing.status,404);
    const previous=p.conversions[1]; assert.equal((await fetch(base+prefix+`/conversions/${previous.id}/video.avi`,{method:'HEAD'})).status,200);
    assert.deepEqual(await readFile(path.join(data,p.id,'source')),await readFile(source.file),'conversion must not alter the upload');
  }
  const converted=await request(`/api/projects/${lastProject.id}`);
  const ordinary=await upload(path.join(data,lastProject.id,'conversions',converted.conversions[0].id,'video.mp4'),'fake.usm');
  assert.notEqual(ordinary.meta.format,'usm');
  assert.equal((await fetch(base+`/api/projects/${ordinary.id}/convert`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
  // A truncated payload can still decode some frames. Refuse a successful partial conversion.
  const incomplete=Buffer.from(await readFile(lastSource.file));
  const hdr=readChunks(incomplete).find(chunk=>chunk.type==='@SFV' && chunk.payloadType===1);
  hdr.payload.writeUInt32BE(26,readUtf(hdr.payload).cells[0].total_frames);
  const corruptFile=path.join(work,'incomplete.usm');await writeFile(corruptFile,incomplete);
  const broken=await upload(corruptFile);
  await send(`/api/projects/${broken.id}/convert`,{});
  for(let i=0;;i++) {
    const state=await request(`/api/projects/${broken.id}`);
    if(state.job.status==='failed') {assert.match(state.job.error,/khung hình/);assert.equal(state.conversions,undefined);break;}
    assert.ok(i<100);await pause();
  }
  // A media upload must never turn into a playlist-driven network request.
  let networkRequests=0;
  const canary=net.createServer(socket=>{networkRequests++;socket.destroy();});
  canary.listen(0,'127.0.0.1');await once(canary,'listening');
  try {
    const playlist=path.join(work,'network-playlist.mp4');
    await writeFile(playlist,`#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\nhttp://127.0.0.1:${canary.address().port}/private.ts\n#EXT-X-ENDLIST\n`);
    await assert.rejects(inspect(playlist),/whitelist|Invalid data/);
    assert.equal(networkRequests,0,'uploaded playlists must not make network connections');
  } finally {await new Promise(resolve=>canary.close(resolve));}
  console.log(`PASS: conversion without USM encoder, MP4/AVI, MPEG-1/2 + B-frames, silent/audio, fractional FPS, bit-exact streams, mute, extraction opt-out, job locking, allowlisted downloads, disguised non-USM and partial-decode rejection.\nArtifacts: ${work}`);
  console.log('PASS: disguised HLS playlist rejected before any network access.');
} catch(error) { console.error(logs); throw error; }
finally { child.kill(); await closed; }
