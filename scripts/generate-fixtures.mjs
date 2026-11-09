import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {ffmpeg,run} from '../lib/media.mjs';

// Synthetic inputs only: no downloaded footage, game assets or recorded music.
await mkdir('test-output',{recursive:true});
const out=name=>path.resolve('test-output',name);
const common=['-hide_banner','-nostdin','-y','-threads','2','-filter_threads','2'];
await run(ffmpeg,[...common,'-f','lavfi','-i','testsrc2=size=640x360:rate=30','-t','8','-an','-c:v','libvpx-vp9','-b:v','1M','-threads','2',out('test-video.webm')]);
await run(ffmpeg,[...common,'-f','lavfi','-i','testsrc2=size=640x360:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-ac','2',out('test-audio.mp4')]);
await run(ffmpeg,[...common,'-i',out('test-audio.mp4'),'-an','-c:v','mjpeg','-q:v','3','-threads','2',out('test-input.avi')]);
console.log('Created synthetic WebM (8 s), MP4 with audio (2 s), and MJPEG AVI (2 s) in test-output/.');
