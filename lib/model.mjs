export function ensure(ok, message, status = 400) {
  if (!ok) throw Object.assign(new Error(message), { status });
}

export function settings(input = {}) {
  const s = { width: Number(input.width), height: Number(input.height), fps: Number(input.fps), bitrate: Number(input.bitrate ?? 6000000), audio: input.audio === true };
  ensure(Number.isInteger(s.width) && s.width >= 64 && s.width <= 4094 && s.width % 2 === 0, 'Chiều rộng phải là số chẵn từ 64 đến 4094.');
  ensure(Number.isInteger(s.height) && s.height >= 64 && s.height <= 2160 && s.height % 2 === 0, 'Chiều cao phải là số chẵn từ 64 đến 2160.');
  ensure([24, 25, 30, 50, 60].includes(s.fps), 'FPS phải là 24, 25, 30, 50 hoặc 60.');
  ensure(Number.isInteger(s.bitrate) && s.bitrate >= 1000000 && s.bitrate <= 40000000, 'Bitrate phải từ 1 đến 40 Mbps.');
  return s;
}

export function cues(input, totalFrames) {
  ensure(Array.isArray(input) && input.length <= 100, 'Tối đa 100 cue point.');
  const names = new Set();
  return input.map(c => {
    ensure(c && typeof c === 'object', 'Cue point không hợp lệ.');
    const value = { name: String(c.name ?? ''), id: Number(c.id), frame: Number(c.frame) };
    ensure(/^[A-Za-z0-9_.-]{1,64}$/.test(value.name), 'Tên cue dùng 1–64 ký tự: chữ Latin, số, dấu _, - hoặc .');
    ensure(!names.has(value.name), 'Tên cue point không được trùng nhau.');
    names.add(value.name);
    ensure(Number.isInteger(value.id) && value.id >= 0 && value.id <= 65535, 'Cue ID phải là số nguyên từ 0 đến 65535.');
    ensure(Number.isInteger(value.frame) && value.frame >= 0 && value.frame <= totalFrames, 'Cue point nằm ngoài video.');
    return value;
  }).sort((a, b) => a.frame - b.frame);
}

export function cueText(list, fps) {
  return '1000\r\n' + list.map(c => `${Math.round(c.frame * 1000 / fps)},${c.id},${c.name}`).join('\r\n') + '\r\n';
}

export function parseCueText(text, fps, totalFrames) {
  ensure(typeof text === 'string' && text.length <= 65536, 'File cue point quá lớn.');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const scale = Number(lines.shift());
  ensure(Number.isInteger(scale) && scale > 0 && scale <= 1000000, 'Dòng đầu phải là số tick mỗi giây.');
  return cues(lines.map(line => {
    const parts = line.split(',');
    ensure(parts.length === 3 && parts.every(x => x.trim().length), 'Mỗi dòng cue phải có đúng: thời_gian,ID,tên. Chưa hỗ trợ trường dữ liệu phụ.');
    const time = Number(parts[0]);
    ensure(Number.isFinite(time) && time >= 0, 'Thời gian cue không hợp lệ.');
    return { frame: Math.round(time / scale * fps), id: Number(parts[1]), name: parts[2].trim() };
  }), totalFrames);
}

export function loopRange(input, totalFrames) {
  const a = Number(input.a), b = Number(input.b);
  ensure(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b <= totalFrames && a < b, 'Vòng lặp cần A < B và nằm trong video.');
  return { a, b };
}

export function defaultCues(total) {
  return [{ name: 'A', id: 1, frame: 0 }, { name: 'B', id: 2, frame: total }];
}

// A/B are the only editable cues. Legacy projects keep their saved preview range.
export function cuePair(input, totalFrames, legacyLoop = null) {
  const list = cues(input, totalFrames);
  let range;
  if (legacyLoop) range = loopRange(legacyLoop, totalFrames);
  else {
    ensure(list.length === 2, 'Chỉ hỗ trợ hai cue point A và B.');
    const a = list.find(c => c.name === 'A') || list[0];
    const b = list.find(c => c.name === 'B') || list[1];
    range = loopRange({ a: a.frame, b: b.frame }, totalFrames);
  }
  return {
    cues: [{ name: 'A', id: 1, frame: range.a }, { name: 'B', id: 2, frame: range.b }],
    loop: { ...range, enabled: range.a > 0 && range.b < totalFrames }
  };
}

export function rescaleCuePair(project, totalFrames, fps) {
  if (!project.totalFrames) return cuePair(defaultCues(totalFrames), totalFrames);
  const { loop } = cuePair(project.cues || [], project.totalFrames, project.loop);
  const a = Math.min(totalFrames - 1, Math.round(loop.a / project.settings.fps * fps));
  const b = loop.b === project.totalFrames ? totalFrames : Math.min(totalFrames, Math.round(loop.b / project.settings.fps * fps));
  return cuePair([], totalFrames, { a, b: Math.max(a + 1, b) });
}

export class Queue {
  constructor(limit = 1) { this.limit = limit; this.active = 0; this.pending = []; }
  add(fn) {
    return new Promise((resolve, reject) => { this.pending.push({ fn, resolve, reject }); this.drain(); });
  }
  drain() {
    while (this.active < this.limit && this.pending.length) {
      const item = this.pending.shift(); this.active++;
      Promise.resolve().then(item.fn).then(item.resolve, item.reject).finally(() => { this.active--; this.drain(); });
    }
  }
}
