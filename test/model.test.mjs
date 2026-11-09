import test from 'node:test';
import assert from 'node:assert/strict';
import { settings, cues, cueText, parseCueText, loopRange, Queue } from '../lib/model.mjs';

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
