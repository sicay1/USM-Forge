import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionOptions, conversionPlan, conversionFiles } from '../lib/conversion.mjs';

const meta = { format:'usm', codec:'mpeg1video', fps:'25/1', audio:true, audioCodec:'adpcm_adx' };
test('conversion validates formats and boolean options without accepting arbitrary paths', () => {
  assert.deepEqual(conversionOptions(), { format:'mp4', audio:true, extract:true });
  for (const value of [null, [], {format:'../../file'}, {format:'mkv'}, {audio:'false'}, {extract:1}]) assert.throws(() => conversionOptions(value));
  assert.throws(() => conversionPlan({...meta, format:'avi'}, {}), /USM/);
  for (const fps of ['0/1','25/0','NaN','25;command','99999999999999999999/1']) assert.throws(() => conversionPlan({...meta,fps}, {}), /FPS/);
  for (const name of ['video.mp4','video.avi','video.m1v','video.m2v','audio.adx','audio.wav','verification.json']) assert.equal(conversionFiles.test(name), true);
  for (const name of ['../video.mp4','convert.log','source','video.usm','VIDEO.mp4']) assert.equal(conversionFiles.test(name), false);
});
test('MP4 conversion uses H.264/AAC plus original MPEG-1 and ADX, not a misleading m2v suffix', () => {
  const plan = conversionPlan(meta, {});
  assert.deepEqual(plan.outputs.map(o => o.name), ['video.mp4','video.m1v','audio.adx','audio.wav']);
  assert.ok(plan.outputs[0].args.includes('libx264'));
  assert.ok(plan.outputs[0].args.includes('aac'));
  assert.ok(plan.outputs[1].args.includes('copy'));
  assert.equal(plan.outputs[2].rawAdx, true);
  assert.ok(plan.outputs[3].args.includes('pcm_s16le'));
});
test('AVI conversion uses MPEG-4 and PCM 44.1 kHz with MPEG-2 extraction', () => {
  const plan = conversionPlan({...meta, codec:'mpeg2video'}, {format:'avi'});
  assert.equal(plan.outputs[1].name, 'video.m2v');
  for (const arg of ['mpeg4','16M','pcm_s16le','44100']) assert.ok(plan.outputs[0].args.includes(arg));
});
test('silent USMs, muted outputs, unsupported raw codecs and opt-out extraction have exact file lists', () => {
  for (const [source, options] of [[{...meta,audio:false}, {}], [meta, {audio:false}]]) {
    const plan = conversionPlan(source, options);
    assert.equal(plan.audio, false);
    assert.deepEqual(plan.outputs.map(o => o.name), ['video.mp4','video.m1v']);
    assert.ok(plan.outputs[0].args.includes('-an'));
  }
  assert.deepEqual(conversionPlan(meta, {extract:false}).outputs.map(o => o.name), ['video.mp4']);
  assert.deepEqual(conversionPlan({...meta,codec:'h264',audioCodec:'hca'}, {}).outputs.map(o => o.name), ['video.mp4','audio.wav']);
});
