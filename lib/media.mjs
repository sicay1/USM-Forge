import { spawn } from 'node:child_process';
import { access, open, writeFile, mkdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensure, cueText } from './model.mjs';
import { finalizeUsm, extractUsmAdx } from './usm.mjs';
import { conversionPlan } from './conversion.mjs';

export const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
export const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
export const encoder = process.env.ENCODER_PATH || '';
export const backend = process.env.USM_BACKEND || (process.platform === 'win32' ? 'medianoche' : 'native');
const python = process.env.PYTHON_PATH || 'python3';
const muxScript = fileURLToPath(new URL('../scripts/mux-usm.py', import.meta.url));
const maxNativeBytes = Number(process.env.MAX_ENCODE_MB || 256) * 1024 * 1024;
let capabilityCache;
export async function encoderStatus() {
  if (backend === 'medianoche') return { available:process.platform === 'win32' && await exists(encoder), backend, name:'CRI Medianoche (Windows)' };
  if (backend !== 'native') return { available:false, backend, error:'USM_BACKEND không hợp lệ.' };
  if (!capabilityCache) capabilityCache = (async () => {
    try {
      await run(python, ['-c', 'import cricodecs.usm; import importlib.metadata; assert importlib.metadata.version("cricodecs") == "1.2.0"'], {timeout:15000});
      const result=await run(ffmpeg,['-hide_banner','-encoders'],{timeout:15000});
      ensure(result.stdout.includes('mpeg1video') && result.stdout.includes('adpcm_adx'),'FFmpeg thiếu MPEG-1 hoặc ADX.',503);
      return {available:true,backend,name:'FFmpeg + CriCodecs 1.2.0',maxEncodeMB:maxNativeBytes/1024/1024};
    } catch(error) { capabilityCache=null; return {available:false,backend,error:error.message}; }
  })();
  return capabilityCache;
}

export async function exists(file) { try { await access(file); return true; } catch { return false; } }

export async function isUsm(file) {
  const handle = await open(file, 'r');
  try {
    const magic = Buffer.alloc(4);
    await handle.read(magic, 0, 4, 0);
    return magic.toString('ascii') === 'CRID';
  } finally { await handle.close(); }
}

export function run(exe, args, { cwd, timeout = 30 * 60000, progress, logFile } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '', done = false;
    const child = spawn(exe, args, { cwd, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const timer = setTimeout(() => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Process already exited. */ }
    }, timeout);
    child.stdout.on('data', data => {
      stdout = (stdout + data).slice(-2_000_000);
      if (progress) for (const m of data.toString().matchAll(/out_time_us=(\d+)/g)) progress(Number(m[1]) / 1e6);
    });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-64000); });
    const finish = async (error) => {
      if (done) return; done = true; clearTimeout(timer);
      if (logFile) await writeFile(logFile, `${exe}\n${JSON.stringify(args)}\n\n${stderr}\n${stdout}`).catch(() => {});
      if (error) reject(error); else resolve({ stdout, stderr });
    };
    child.on('error', error => finish(new Error(`Không chạy được ${path.basename(exe)}: ${error.message}`)));
    child.on('close', (code, signal) => finish(code === 0 ? null : new Error(`${path.basename(exe)} thất bại (${signal || code}). ${stderr.slice(-1800)}`)));
  });
}

const ffArgs = ['-hide_banner', '-nostdin', '-y', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2'];
// Uploaded files are media, never playlists that can reference the network or other local files.
const inputOptions = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'matroska,webm,mov,mp4,m4a,3gp,3g2,mj2,avi,asf,flv,ogg,mpeg,mpegts,usm,nut,rm'];
async function scratchSpace(dir, bytes) {
  const disk = await statfs(dir).catch(() => null);
  if (disk) ensure(disk.bavail * disk.bsize > bytes + 256 * 1024 * 1024, `Không đủ dung lượng tạm. Cần khoảng ${(bytes / 1024 ** 3).toFixed(1)} GB trống cho bước này.`, 507);
}
export async function probe(file, count = false) {
  const args = ['-v', 'error', ...inputOptions, '-show_streams', '-show_format', '-of', 'json'];
  if (count) args.push('-count_frames');
  args.push(file);
  return JSON.parse((await run(ffprobe, args, { timeout: 120000 })).stdout);
}

export async function inspect(file) {
  let info = await probe(file);
  if (info.format?.format_name === 'usm') info = await probe(file, true);
  const video = info.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  ensure(video, 'File không có luồng video đọc được.');
  const rate = String(video.r_frame_rate || '0/1').split('/').map(Number);
  const duration = info.format?.format_name === 'usm' && Number(video.nb_read_frames) > 0 && rate[0] > 0 && rate[1] > 0
    ? Number(video.nb_read_frames) * rate[1] / rate[0]
    : Number(info.format?.duration || video.duration);
  ensure(Number.isFinite(duration) && duration > 0 && duration <= 600, 'Video cần có thời lượng từ trên 0 đến 600 giây.');
  ensure(video.width > 0 && video.height > 0 && video.width <= 8192 && video.height <= 8192, 'Kích thước video nguồn không được vượt quá 8192 × 8192.');
  const audio = info.streams.find(s => s.codec_type === 'audio');
  return { width: video.width, height: video.height, duration, codec: video.codec_name, format: info.format?.format_name,
    fps: video.r_frame_rate, frames: Number(video.nb_read_frames) || null, declaredFrames: Number(video.nb_frames) || null,
    audio: Boolean(audio), audioCodec: audio?.codec_name || null, size: Number(info.format.size) };
}

export async function convertUsm(source, dir, options, update) {
  ensure(await isUsm(source), 'Tính năng này cần file nguồn USM. Hãy tải file .usm lên.');
  update('Đọc luồng USM gốc', 3);
  const meta = await inspect(source), plan = conversionPlan(meta, options);
  ensure(meta.frames > 0 && (!meta.declaredFrames || meta.frames === meta.declaredFrames), 'USM thiếu khung hình hoặc không giải mã đầy đủ.');
  await mkdir(dir, { recursive: true });
  // Budget for converted video, optional PCM audio and copied elementary streams.
  await scratchSpace(dir, meta.size * 2 + meta.duration * (40_000_000 / 8 + 8 * 44100 * 2));
  const output = path.join(dir, plan.outputs[0].name);
  const files = [...plan.outputs.map(item => item.name), 'verification.json'];
  try {
    update('Tách luồng và chuyển USM sang video', 10);
    // FFmpeg demuxes USM directly, retaining the source frame grid and first audio track.
    // Elementary outputs keep MPEG/ADX compressed payloads; no normalized preview is used.
    const args = [...ffArgs, ...inputOptions, '-fflags', '+genpts', '-i', source, '-progress', 'pipe:1'];
    for (const item of plan.outputs.filter(item => !item.rawAdx)) args.push(...item.args, path.join(dir, item.name));
    await run(ffmpeg, args, { progress: t => update('Tách luồng và chuyển USM sang video', 10 + Math.min(78, t / meta.duration * 78)), logFile: path.join(dir, 'convert.log') });
    if (plan.outputs.some(item => item.rawAdx)) await extractUsmAdx(source, path.join(dir, 'audio.adx'));
    update('Kiểm tra video đã chuyển đổi', 90);
    const info = await probe(output, true), video = info.streams.find(s => s.codec_type === 'video'), audio = info.streams.find(s => s.codec_type === 'audio');
    ensure(video && Number(video.nb_read_frames) === meta.frames && video.width === Math.ceil(meta.width / 2) * 2 && video.height === Math.ceil(meta.height / 2) * 2,
      'Video chuyển đổi không khớp số frame hoặc kích thước USM gốc.', 500);
    ensure(plan.audio ? audio && Number(audio.nb_read_frames) > 0 : !audio, 'Âm thanh chuyển đổi không hợp lệ.', 500);
    const rate = value => value.split('/').map(Number).reduce((n, d) => n / d);
    ensure(Math.abs(rate(video.avg_frame_rate) - rate(meta.fps)) < 0.001, 'FPS video chuyển đổi không khớp USM gốc.', 500);
    for (const name of files.filter(name => name !== 'verification.json')) ensure((await stat(path.join(dir, name))).size > 0, 'File chuyển đổi bị rỗng.', 500);
    const result = { format: plan.format, audio: plan.audio, extract: plan.extract, files, size: (await stat(output)).size,
      width: video.width, height: video.height, frames: Number(video.nb_read_frames), fps: video.avg_frame_rate,
      codec: video.codec_name, audioCodec: audio?.codec_name || null, verified: true };
    await writeFile(path.join(dir, 'verification.json'), JSON.stringify({ source: meta, ...result, sourceUsed: 'original-usm', audioTrack: plan.audio ? 0 : null }, null, 2));
    return result;
  } catch (error) {
    // Keep diagnostics, but never expose incomplete conversion artifacts.
    await Promise.all(files.map(name => rm(path.join(dir, name), { force: true }).catch(() => {})));
    throw error;
  }
}

export async function prepare(source, dir, s, meta, update) {
  await mkdir(dir, { recursive: true });
  await scratchSpace(dir, s.width * s.height * 1.5 * s.fps * meta.duration * 1.15);
  // One CFR, lossless master defines the frame grid for previews, cues and exports.
  const filter = `fps=${s.fps},scale=${s.width}:${s.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${s.width}:${s.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
  const args = [...ffArgs, ...inputOptions, '-i', source, '-map', '0:v:0'];
  if (meta.audio) args.push('-map', '0:a:0');
  args.push('-vf', filter, '-c:v', 'ffv1', '-level', '3', '-pix_fmt', 'yuv420p', '-threads', '2');
  if (meta.audio) args.push('-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2');
  args.push('-progress', 'pipe:1', path.join(dir, 'master.mkv'));
  update('Chuẩn hóa video', 5);
  await run(ffmpeg, args, { progress: t => update('Chuẩn hóa video', 5 + Math.min(60, t / meta.duration * 60)), logFile: path.join(dir, 'prepare.log') });
  const masterInfo = await probe(path.join(dir, 'master.mkv'), true);
  const total = Number(masterInfo.streams.find(s => s.codec_type === 'video').nb_read_frames);
  ensure(Number.isInteger(total) && total > 0, 'Không đếm được khung hình của video chuẩn hóa.', 500);
  update('Tạo video xem trước', 68);
  await run(ffmpeg, [...ffArgs, '-i', path.join(dir, 'master.mkv'), '-vf', "scale=w='min(1280,iw)':h=-2", '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '2', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-progress', 'pipe:1', path.join(dir, 'preview.mp4')], { progress: t => update('Tạo video xem trước', 68 + Math.min(24, t / meta.duration * 24)) });
  update('Tạo timeline', 94);
  const duration = total / s.fps;
  await run(ffmpeg, [...ffArgs, '-i', path.join(dir, 'master.mkv'), '-vf', `fps=10/${duration},scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=10x1`, '-frames:v', '1', '-q:v', '3', path.join(dir, 'thumbs.jpg')]);
  return { totalFrames: total, duration };
}

export async function frame(dir, index) {
  const target = path.join(dir, `frame-${index}.jpg`);
  if (!await exists(target)) {
    await run(ffmpeg, [...ffArgs, '-i', path.join(dir, 'master.mkv'), '-vf', `select=eq(n\\,${index}),scale=w='min(1280,iw)':h=-2`, '-frames:v', '1', '-q:v', '2', target], { timeout: 120000 });
  }
  return target;
}

export async function seam(dir, a, b, fps) {
  const target = path.join(dir, `seam-${a}-${b}.mp4`);
  if (!await exists(target)) {
    const half = Math.max(1, Math.min(Math.round(fps / 2), b - a));
    const filter = `[0:v]split[x][y];[x]trim=start_frame=${b - half}:end_frame=${b},setpts=PTS-STARTPTS[x1];[y]trim=start_frame=${a}:end_frame=${a + half},setpts=PTS-STARTPTS[y1];[x1][y1]concat=n=2:v=1:a=0,scale=w='min(1280,iw)':h=-2[v]`;
    await run(ffmpeg, [...ffArgs, '-i', path.join(dir, 'master.mkv'), '-filter_complex', filter, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-threads', '2', '-movflags', '+faststart', target]);
  }
  return target;
}

export async function encode(masterDir, dir, snapshot, update) {
  if (backend === 'native') return encodeNative(masterDir,dir,snapshot,update);
  ensure(backend === 'medianoche' && process.platform === 'win32','Backend encoder không khả dụng.',503);
  ensure(await exists(encoder), 'Không tìm thấy medianoche.exe. Hãy cấu hình ENCODER_PATH.', 503);
  await mkdir(dir, { recursive: true });
  await scratchSpace(dir, snapshot.settings.width * snapshot.settings.height * 3 * snapshot.totalFrames * 1.1);
  const avi = path.join(dir, 'video.avi'), wav = path.join(dir, 'audio.wav'), output = path.join(dir, 'video.usm');
  const cue = path.join(dir, 'cue_point.txt');
  await writeFile(cue, cueText(snapshot.cues, snapshot.settings.fps), 'utf8');
  await writeFile(path.join(dir, 'project.json'), JSON.stringify(snapshot, null, 2));
  try {
    update('Tạo AVI cho encoder', 5);
    await run(ffmpeg, [...ffArgs, '-i', path.join(masterDir, 'master.mkv'), '-map', '0:v:0', '-an', '-vf', 'vflip', '-c:v', 'rawvideo', '-pix_fmt', 'bgr24', '-flipped_raw_rgb', '1', '-progress', 'pipe:1', avi], { progress: t => update('Tạo AVI cho encoder', 5 + Math.min(45, t / snapshot.duration * 45)) });
    if (snapshot.settings.audio) {
      ensure(snapshot.meta.audio, 'Video nguồn không có âm thanh.');
      await run(ffmpeg, [...ffArgs, '-i', path.join(masterDir, 'master.mkv'), '-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', wav]);
    }
    update('Mã hóa USM', 55);
    const args = [`-in=${avi}`, `-out=${output}`, `-bitrate=${snapshot.settings.bitrate}`];
    if (snapshot.cues.length) args.push(`-cuepoint=${cue}`);
    if (snapshot.settings.audio) args.push(`-audio00=${wav}`);
    await run(encoder, args, { cwd: path.dirname(encoder), logFile: path.join(dir, 'encoder.log') });
    ensure(await exists(output), 'Encoder không tạo được USM. Xem encoder.log của tác vụ.', 500);
    update('Kiểm tra file USM', 92);
    const handle = await open(output, 'r');
    try { const magic = Buffer.alloc(4); await handle.read(magic, 0, 4, 0); ensure(magic.toString() === 'CRID', 'Encoder không tạo được file USM hợp lệ.', 500); } finally { await handle.close(); }
    // CRI streams can produce an EOF demux warning in FFmpeg, including original L2 files.
    // Check decoded frame count instead of treating that warning as corruption.
    const info = await probe(output, true);
    const video = info.streams.find(s => s.codec_type === 'video');
    ensure(video && Number(video.nb_read_frames) === snapshot.totalFrames, 'Số khung hình USM không khớp video chuẩn hóa.', 500);
    ensure(video.width === snapshot.settings.width && video.height === snapshot.settings.height, 'Kích thước USM không khớp cấu hình.', 500);
    return { size: (await stat(output)).size, codec: video.codec_name, frames: Number(video.nb_read_frames), verified: true, backend };
  } finally {
    await Promise.all([avi, wav].map(file => rm(file, { force: true }).catch(() => {})));
  }
}

async function encodeNative(masterDir, dir, snapshot, update) {
  const status=await encoderStatus(); ensure(status.available,status.error || 'Bộ mã hóa native chưa sẵn sàng.',503);
  const {settings:s}=snapshot;
  ensure(s.width<=4094,'MPEG-1 hỗ trợ chiều rộng chẵn tối đa 4094 pixel.');
  // The upstream muxer buffers elementary streams; bound work instead of risking OOM.
  const estimated=(s.bitrate + (s.audio ? 432000 : 0))*snapshot.duration/8*1.25;
  ensure(estimated<=maxNativeBytes,`Bản xuất vượt ngân sách ${maxNativeBytes/1024/1024} MB. Hãy giảm bitrate hoặc rút ngắn video.`,413);
  await mkdir(dir,{recursive:true}); await scratchSpace(dir,estimated*3);
  const elementary=path.join(dir,'video.m1v'), audio=path.join(dir,'audio.adx'), base=path.join(dir,'base.usm'), output=path.join(dir,'video.usm');
  await writeFile(path.join(dir,'cue_point.txt'),cueText(snapshot.cues,s.fps),'utf8');
  await writeFile(path.join(dir,'project.json'),JSON.stringify({...snapshot,encoder:{backend:'native',muxer:'cricodecs',version:'1.2.0'}},null,2));
  try {
    update('Mã hóa MPEG-1 trên Linux',5);
    // No B frames: one packet = one display frame, with deterministic cue/seek indexing.
    await run(ffmpeg,[...ffArgs,'-i',path.join(masterDir,'master.mkv'),'-map','0:v:0','-an','-c:v','mpeg1video','-b:v',String(s.bitrate),'-maxrate',String(s.bitrate),'-bufsize',String(Math.min(s.bitrate*2,16760832)),'-g','12','-bf','0','-pix_fmt','yuv420p','-threads','2','-f','mpeg1video','-progress','pipe:1',elementary],{progress:t=>update('Mã hóa MPEG-1',5+Math.min(55,t/snapshot.duration*55)),logFile:path.join(dir,'video-encode.log')});
    const args=[muxScript,elementary,base];
    if(s.audio) {
      ensure(snapshot.meta.audio,'Video không có âm thanh.'); update('Mã hóa âm thanh ADX',63);
      await run(ffmpeg,[...ffArgs,'-i',path.join(masterDir,'master.mkv'),'-map','0:a:0','-vn','-c:a','adpcm_adx','-ar','48000','-ac','2','-t',String(snapshot.duration),audio],{logFile:path.join(dir,'audio-encode.log')});
      args.push(audio);
    }
    const bytes=(await stat(elementary)).size+(s.audio ? (await stat(audio)).size : 0);
    ensure(bytes<=maxNativeBytes,'Video mã hóa vượt giới hạn bộ nhớ đóng gói. Hãy giảm bitrate.',413);
    update('Đóng gói USM',72);
    await run(python,args,{logFile:path.join(dir,'encoder.log')});
    update('Nhúng cue point và kiểm tra vị trí tua',85);
    const structure=await finalizeUsm(base,output,snapshot.cues,s.fps);
    ensure(structure.frames===snapshot.totalFrames,'Số packet USM không khớp master.',500);
    update('Kiểm tra giải mã video và âm thanh',93);
    const info=await probe(output,true), video=info.streams.find(t=>t.codec_type==='video'), sound=info.streams.find(t=>t.codec_type==='audio');
    ensure(video?.codec_name==='mpeg1video' && Number(video.nb_read_frames)===snapshot.totalFrames && video.width===s.width && video.height===s.height,'Video USM không khớp cấu hình hoặc thiếu frame.',500);
    ensure(!s.audio || (sound?.codec_name==='adpcm_adx' && sound.sample_rate==='48000' && sound.channels===2),'Âm thanh USM không hợp lệ.',500);
    const verification={...structure,decoder:{codec:video.codec_name,frames:Number(video.nb_read_frames),width:video.width,height:video.height,audio:sound?.codec_name || null},gameClientTested:false};
    await writeFile(path.join(dir,'verification.json'),JSON.stringify(verification,null,2));
    return {size:(await stat(output)).size,codec:video.codec_name,frames:structure.frames,verified:true,cuesVerified:true,seekEntries:structure.seekCount,backend:'native'};
  } catch(error) { await rm(output,{force:true}).catch(()=>{}); throw error; }
  finally { await Promise.all([elementary,audio,base].map(file=>rm(file,{force:true}).catch(()=>{}))); }
}
