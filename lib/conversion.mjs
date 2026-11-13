import { ensure } from './model.mjs';

export const conversionFiles = /^(video\.(mp4|avi|m1v|m2v)|audio\.(adx|wav)|verification\.json)$/;

export function conversionOptions(value = {}) {
  ensure(value && typeof value === 'object' && !Array.isArray(value), 'Cấu hình chuyển đổi không hợp lệ.');
  const { format = 'mp4', audio = true, extract = true } = value;
  ensure(['mp4', 'avi'].includes(format), 'Chỉ hỗ trợ chuyển USM sang MP4 hoặc AVI.');
  ensure(typeof audio === 'boolean' && typeof extract === 'boolean', 'Cấu hình chuyển đổi không hợp lệ.');
  return { format, audio, extract };
}

// Fixed output names and explicit stream maps; never derive paths or arguments from filenames.
export function conversionPlan(meta, value) {
  const options = conversionOptions(value);
  ensure(meta?.format === 'usm', 'Tính năng này cần file nguồn USM. Hãy tải file .usm lên.');
  const rate = /^(\d+)\/(\d+)$/.exec(meta.fps || '');
  ensure(rate && [rate[1], rate[2]].every(n => Number.isSafeInteger(Number(n)) && Number(n) > 0), 'FPS của USM không hợp lệ.');
  const audio = options.audio && meta.audio;
  const outputs = [{
    name: `video.${options.format}`,
    args: ['-map', '0:v:0', ...(audio ? ['-map', '0:a:0'] : ['-an']),
      // USM packets often lack PTS. Rebuild the original frame grid, not the editor's 30-fps grid.
      '-vf', `setpts=N*${rate[2]}/(${rate[1]}*TB),pad=ceil(iw/2)*2:ceil(ih/2)*2`, '-pix_fmt', 'yuv420p', '-threads', '2',
      '-r', meta.fps, '-fps_mode', 'cfr',
      ...(options.format === 'mp4'
        ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', ...(audio ? ['-c:a', 'aac', '-b:a', '192k'] : [])]
        : ['-c:v', 'mpeg4', '-b:v', '16M', ...(audio ? ['-c:a', 'pcm_s16le', '-ar', '44100'] : [])])]
  }];
  if (options.extract) {
    const video = { mpeg1video: ['m1v', 'mpeg1video'], mpeg2video: ['m2v', 'mpeg2video'] }[meta.codec];
    if (video) outputs.push({ name: `video.${video[0]}`, args: ['-map', '0:v:0', '-c:v', 'copy', '-f', video[1]] });
    // The USM demuxer exposes the ADX header as extradata, which FFmpeg's ADX muxer
    // does not restore on stream copy. Extract this stream from its USM chunks instead.
    if (audio && meta.audioCodec === 'adpcm_adx') outputs.push({ name: 'audio.adx', rawAdx: true });
    if (audio) outputs.push({ name: 'audio.wav', args: ['-map', '0:a:0', '-c:a', 'pcm_s16le', '-ar', '44100'] });
  }
  return { ...options, audio, outputs };
}
