import test from 'node:test';
import assert from 'node:assert/strict';
import {readUtf,writeUtf,readChunks,makeChunk,cueMetadata,embedCues,inspectUsm,extractUsmAdx} from '../lib/usm.mjs';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// CUEPOINT_INFO bytes from a Medianoche 1.88 output generated for the test video.
const reference=Buffer.from('40555446000000e00000002c0000007c000000b00000000700040014000000045b00000015560000001a550000001f1b000000280000000000000007000000000000000000000000000000080000000c00000000000001f400000001000000180000000c00000000000019640000000200000028000000050000000000001b58000000003c4e554c4c3e00435545504f494e545f494e464f006e616d650074696d65006375655f7479706500706172616d6574657200000073746172740000006c6f6f705f706f696e740000000000006c6f6f705f7374617274000000000000656e640000000000','hex');
const cues=[{name:'start',id:0,frame:0},{name:'loop_point',id:1,frame:15},{name:'loop_start',id:2,frame:195},{name:'end',id:0,frame:210}];
test('cue payload matches Medianoche reference byte for byte',()=>{
  assert.deepEqual(cueMetadata(cues,30),reference);
  const t=readUtf(reference);assert.equal(t.rows[2].time,6500);assert.equal(t.rows[2].cue_type,2);assert.equal(t.rows[2].name.toString().replace(/\0+$/,''),'loop_start');
});
test('UTF round trip preserves scalar, string, blob, constant and zero fields',()=>{
  const schema=[{name:'number',type:6},{name:'negative',type:5},{name:'label',type:10},{name:'data',type:11},{name:'constant',type:2,storage:0x30,constant:123},{name:'zero',type:11,storage:0x10}];
  const rows=[{number:4294967296,negative:-123,label:'video.m1v',data:Buffer.from([1,2,0,4])},{number:0,negative:0,label:'âm thanh',data:Buffer.alloc(0)}];
  const result=readUtf(writeUtf('TEST',schema,rows));
  assert.equal(result.rows[0].number,4294967296);assert.equal(result.rows[0].constant,123);assert.equal(result.rows[0].negative,-123);assert.equal(result.rows[1].label,'âm thanh');assert.deepEqual(result.rows[0].data,rows[0].data);assert.deepEqual(result.rows[0].zero,Buffer.alloc(0));
});
function fixture(){
  const scalar=names=>names.map(name=>({name,type:4}));
  const cols=[{name:'fmtver',type:4},{name:'filename',type:10},...scalar(['filesize','datasize','stmid']),{name:'chno',type:2},{name:'minchk',type:2},...scalar(['minbuf','avbps'])];
  const base={fmtver:0,filename:'',filesize:0,datasize:0,stmid:0,chno:0,minchk:1,minbuf:1024,avbps:1000000};
  const hdr=makeChunk('@SFV',1,writeUtf('VIDEO_HDRINFO',scalar(['total_frames']),[{total_frames:3}]));
  const hEnd=makeChunk('@SFV',2,Buffer.from('#HEADER END'));
  const mEnd=makeChunk('@SFV',2,Buffer.from('#METADATA END'));
  const seekCols=[{name:'ofs_byte',type:6},{name:'ofs_frmid',type:5},{name:'num_skip',type:3},{name:'resv',type:3}];
  const entries=[{ofs_byte:0,ofs_frmid:0,num_skip:0,resv:0},{ofs_byte:0,ofs_frmid:2,num_skip:0,resv:0}];
  let seek=makeChunk('@SFV',3,writeUtf('VIDEO_SEEKINFO',seekCols,entries));
  const packets=[0,1,2].map(i=>makeChunk('@SFV',0,Buffer.from(`frame ${i}`)));
  const at=2048+hdr.length+hEnd.length+seek.length+mEnd.length;
  entries[0].ofs_byte=at;entries[1].ofs_byte=at+packets[0].length+packets[1].length;
  seek=makeChunk('@SFV',3,writeUtf('VIDEO_SEEKINFO',seekCols,entries));
  const bytes=at+packets.reduce((n,b)=>n+b.length,0);
  const root=makeChunk('CRID',1,writeUtf('CRIUSF_DIR_STREAM',cols,[{...base,filename:'base.usm',chno:65535,filesize:bytes},{...base,stmid:0x40534656,filename:'video.m1v'}]),{size:2048});
  return Buffer.concat([root,hdr,hEnd,seek,mEnd,...packets]);
}
test('cue insertion preserves media, fixes absolute seek offsets and does not mutate input',()=>{
  const original=fixture(), copy=Buffer.from(original), before=inspectUsm(original);
  const result=Buffer.concat(embedCues(original,[{name:'start',id:0,frame:0},{name:'end',id:0,frame:3}],30));
  const after=inspectUsm(result);
  assert.deepEqual(original,copy);assert.equal(after.mediaHash,before.mediaHash);assert.equal(after.seekCount,2);assert.equal(after.frames,3);assert.deepEqual(after.cues,[{name:'start',time:0,id:0},{name:'end',time:100,id:0}]);
  assert.ok(result.length>original.length);
});
test('zero cues retains valid media and does not add an empty CUE stream',()=>{
  const result=Buffer.concat(embedCues(fixture(),[],30));assert.equal(inspectUsm(result).cues.length,0);assert.equal(readChunks(result).some(c=>c.type==='@CUE'),false);
});
test('reject corrupted seek offset, truncated chunks and invalid UTF offsets',()=>{
  const b=fixture(), meta=readChunks(b).find(c=>c.payloadType===3), t=readUtf(meta.payload);meta.payload.writeBigUInt64BE(1n,t.cells[0].ofs_byte);
  assert.throws(()=>inspectUsm(b),/seek/);assert.throws(()=>embedCues(b,cues,30),/seek/);
  assert.throws(()=>readChunks(fixture().subarray(0,-1)),/chunk/);
  const broken=Buffer.from(reference);broken.writeUInt32BE(0xfffffff0,12);assert.throws(()=>readUtf(broken),/UTF/);
});
test('100 cue points, maximum names and repeated IDs remain readable',()=>{
  const list=Array.from({length:100},(_,i)=>({name:`cue_${i}_`.padEnd(64,'x'),id:65535,frame:i%4})).sort((a,b)=>a.frame-b.frame);
  const result=Buffer.concat(embedCues(fixture(),list,30));const info=inspectUsm(result);assert.equal(info.cues.length,100);assert.equal(info.cues[99].name.length,64);assert.equal(info.cues[99].id,65535);
});

test('streaming ADX extraction keeps the complete header and first audio channel, not metadata/padding',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'usm-adx-test-'));
  try {
    const source=path.join(dir,'input'), target=path.join(dir,'audio.adx');
    const adx=Buffer.alloc(36);adx.writeUInt16BE(0x8000,0);adx.writeUInt16BE(32,2);
    const audio=Buffer.alloc(150000,0x6a);
    const bytes=Buffer.concat([makeChunk('CRID',1,Buffer.from('metadata')),
      makeChunk('@SFA',1,Buffer.from('metadata'),{channel:9}),makeChunk('@SFA',0,adx,{channel:9}),
      makeChunk('@SFA',0,Buffer.from('other audio'),{channel:0}),makeChunk('@SFV',0,Buffer.from('video')),
      makeChunk('@SFA',0,audio,{channel:9}),makeChunk('@SFA',2,Buffer.from('#CONTENTS END'),{channel:9})]);
    await writeFile(source,bytes);
    const result=await extractUsmAdx(source,target);assert.equal(result.channel,9);
    assert.deepEqual(await readFile(target),Buffer.concat([adx,audio]));
    assert.deepEqual(await readFile(source),bytes);
    await assert.rejects(extractUsmAdx(source,target),/EEXIST/);
    assert.deepEqual(await readFile(target),Buffer.concat([adx,audio]),'existing targets must never be removed');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('ADX extraction rejects malformed chunks/headers and removes partial output',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'usm-adx-test-'));
  try {
    const source=path.join(dir,'input'), target=path.join(dir,'audio.adx');
    const adx=Buffer.alloc(36);adx.writeUInt16BE(0x8000,0);
    const root=makeChunk('CRID',1,Buffer.from('metadata')), valid=makeChunk('@SFA',0,adx);
    for(const bytes of [Buffer.concat([root,valid,Buffer.alloc(3)]),Buffer.concat([root,valid.subarray(0,-1)]),Buffer.concat([root,makeChunk('@SFA',0,Buffer.from('bad header'))]),root]) {
      await writeFile(source,bytes);await assert.rejects(extractUsmAdx(source,target));
      await assert.rejects(stat(target),{code:'ENOENT'});
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
