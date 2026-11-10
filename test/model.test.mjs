import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, cues, cueText, parseCueText, loopRange, defaultCues, cuePair, rescaleCuePair, Queue } from '../lib/model.mjs';

test('cue timebase round trip at 30fps, repeated IDs, EOF cue', () => {
  const list = parseCueText('1000\n0,0,start\n0500,1,loop_point\n6500,2,loop_start\n8000,0,end\n', 30, 240);
  assert.deepEqual(list.map(c => c.frame), [0, 15, 195, 240]);
  assert.deepEqual(parseCueText(cueText(list, 30), 30, 240), list);
});
test('different timebase imports to frame grid', () => {
  assert.equal(parseCueText('30\n15,1,half_second', 60, 480)[0].frame, 30);
});
test('reject malicious cue names, duplicate names and out of bounds', () => {
  assert.throws(() => cues([{ name:'bad,\nname', id:0, frame:0 }], 240));
  assert.throws(() => cues([{ name:'start', id:0, frame:0 },{ name:'start', id:1, frame:2 }], 240));
  assert.throws(() => cues([{ name:'end', id:0, frame:241 }], 240));
  assert.throws(() => parseCueText('0\n0,0,start', 30, 240));
  assert.throws(() => parseCueText('1000\n0,0,start,key=value', 30, 240));
});
test('loop boundary permits EOF but rejects reverse / empty / fractional loops', () => {
  assert.deepEqual(loopRange({ a:15,b:240 }, 240), { a:15,b:240 });
  for (const x of [{a:10,b:10},{a:20,b:10},{a:-1,b:30},{a:0,b:241},{a:0.2,b:10}]) assert.throws(() => loopRange(x,240));
});
test('output settings reject unsupported and invalid sizes', () => {
  assert.equal(settings({width:1920,height:1080,fps:30}).bitrate, 6000000);
  for (const override of [{width:1919},{height:0},{fps:29.97},{bitrate:50000000}]) assert.throws(() => settings({width:1920,height:1080,fps:30,...override}));
});
test('queue recovers from failed task and serializes encodes', async () => {
  const queue = new Queue(), order=[];
  const a = queue.add(async () => { order.push('a'); throw new Error('bad video'); }).catch(() => order.push('failed'));
  const b = queue.add(async () => order.push('b'));
  await Promise.all([a,b]); assert.deepEqual(order,['a','failed','b']);
});

test('default project has only A/B and loop requires both interior endpoints', () => {
  assert.deepEqual(defaultCues(240),[{name:'A',id:1,frame:0},{name:'B',id:2,frame:240}]);
  for (const [a,b,enabled] of [[0,240,false],[15,240,false],[0,195,false],[15,195,true]]) {
    const pair=cuePair([{name:'A',id:1,frame:a},{name:'B',id:2,frame:b}],240);
    assert.deepEqual(pair.loop,{a,b,enabled});
  }
});

test('A/B validation rejects extra cues and reversed named endpoints', () => {
  assert.throws(()=>cuePair([...defaultCues(240),{name:'extra',id:3,frame:12}],240),/hai cue/);
  assert.throws(()=>cuePair([{name:'A',id:1,frame:200},{name:'B',id:2,frame:10}],240));
  assert.throws(()=>cuePair([{name:'A',id:1,frame:10},{name:'B',id:2,frame:10}],240));
  assert.equal(cuePair(parseCueText('1000\n500,1,A\n6500,2,B',30,240),240).loop.enabled,true);
});

test('legacy projects migrate their saved range and FPS changes retain A/B times', () => {
  const old={cues:[{name:'start',id:0,frame:0},{name:'loop_point',id:1,frame:15},{name:'loop_start',id:2,frame:195},{name:'end',id:0,frame:240}],loop:{a:15,b:195},settings:{fps:30},totalFrames:240};
  assert.deepEqual(cuePair(old.cues,240,old.loop).cues,[{name:'A',id:1,frame:15},{name:'B',id:2,frame:195}]);
  assert.deepEqual(rescaleCuePair(old,480,60).loop,{a:30,b:390,enabled:true});
  old.loop={a:0,b:240};
  assert.deepEqual(rescaleCuePair(old,481,60).loop,{a:0,b:481,enabled:false});
  assert.deepEqual(rescaleCuePair({},1,30).loop,{a:0,b:1,enabled:false});
});
