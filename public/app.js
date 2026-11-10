const $ = id => document.getElementById(id);
const { t, text: label } = window.USMI18n;
let project = null, draft = [], dirty = false, busy = false, currentFrame = 0, mode = 'normal', uploading = false, pollTimer, frameTicket = 0, frameURL, toastTimer;
let wholeVideo = false;
let seekTimer, frameController;
const video = $('video');
function setFrameLoading(loading) {
  $('frameLoading').hidden = !loading;
  video.parentElement.setAttribute('aria-busy', String(loading));
}
function cancelFrameLoad() {
  clearTimeout(seekTimer); frameTicket++;
  frameController?.abort(); frameController = null;
  setFrameLoading(false);
}
const time = seconds => { const ms = Math.max(0, Math.round(seconds * 1000)); return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function toast(message, error = false) { label('toast', message); $('toast').hidden = false; $('toast').classList.toggle('error-toast', error); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, error ? 8000 : 3500); }
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Yêu cầu thất bại.'); return result;
}
const endpoint = suffix => `/api/projects/${project.id}/${suffix}`;
function safely(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(error => toast(error.message, true)); }
function markDirty() { dirty = true; label('cueSaveState', 'Có thay đổi chưa lưu'); $('cueSaveState').classList.add('dirty'); }
function markSaved() { dirty = false; label('cueSaveState', 'Đã lưu'); $('cueSaveState').classList.remove('dirty'); }
function getLoop() { const a = draft[0]?.frame, b = draft[1]?.frame; if (!(a < b)) throw new Error('Chọn A trước B để phát vòng lặp.'); return { a, b, enabled: a > 0 && b < project.totalFrames }; }
function hasLoop() { return draft.length === 2 && draft[0].frame > 0 && draft[1].frame < project.totalFrames; }
function outputSettings() { return { width: Number($('width').value), height: Number($('height').value), fps: Number($('fps').value), bitrate: Number($('bitrate').value) * 1000000, audio: $('audio').checked }; }
function preparedMatches() { const s = outputSettings(); return project && ['width', 'height', 'fps'].every(k => s[k] === project.settings[k]); }
function setControls() {
  const ready = Boolean(project?.build), locked = busy || uploading || !ready;
  for (const id of ['prevFrame','nextFrame','play','scrub','loopPlay','introPlay','seamPlay','normalPlay','markerA','markerB','setA','goToA','setB','goToB','resolution','width','height','fps','bitrate','applySettings','audio','export','saveProject','saveCues','importCue','importProject','downloadCue','fullScreen']) $(id).disabled = locked;
  if (!locked) $('audio').disabled = !project.meta.audio;
  for (const id of ['loopPlay','introPlay','seamPlay']) $(id).disabled = locked || !hasLoop();
  // Seam playback uses a different timebase, so it cannot set a source cue.
  $('setA').disabled = $('setB').disabled = locked || mode === 'seam';
  $('newProject').disabled = uploading;
  $('deleteProject').disabled = busy || uploading || !project;
  document.querySelectorAll('.project-item').forEach(el => el.disabled = uploading);
}

async function library() {
  const list = await api('/api/projects'); $('projectCount').textContent = list.length;
  $('projectList').innerHTML = list.map(p => `<button class="project-item ${p.id === project?.id ? 'active' : ''}" data-id="${p.id}" title="${escape(p.name)}"><span class="project-icon">▧</span><span><strong>${escape(p.name)}</strong>${p.duration ? `<small>${time(p.duration)} · ${p.settings.fps} fps</small>` : '<small data-i18n="Đang chuẩn bị">Đang chuẩn bị</small>'}</span></button>`).join('');
  window.USMI18n.apply(); setControls();
  return list;
}
function refreshHeader() {
  $('projectTitle').removeAttribute('data-i18n'); $('projectTitle').textContent = project.name;
  if (project.meta) label('projectSubtitle', project.meta.audio ? '{width} × {height} · {codec} · {size} MB · Có âm thanh' : '{width} × {height} · {codec} · {size} MB · Không âm thanh', { width:project.meta.width, height:project.meta.height, codec:project.meta.codec.toUpperCase(), size:(project.meta.size / 1024 / 1024).toFixed(1) });
  else label('projectSubtitle', 'Đang đọc thông tin video…');
  $('emptyState').hidden = true; $('editor').hidden = false;
}
function syncSettings() {
  if (!project.settings) return;
  for (const key of ['width','height','fps']) $(key).value = String(project.settings[key]);
  const res = `${project.settings.width}x${project.settings.height}`;
  $('resolution').value = [...$('resolution').options].some(x => x.value === res) ? res : 'custom';
  $('bitrate').value = project.settings.bitrate / 1000000; $('bitrateLabel').textContent = `${$('bitrate').value} Mbps`;
  $('audio').checked = project.settings.audio;
  label('audioHint', project.meta.audio ? 'Âm thanh stereo 48 kHz khi xuất USM.' : 'Video nguồn không có âm thanh.');
}
function updatePosition(frame) {
  currentFrame = Math.max(0, Math.min(project.totalFrames - 1, frame));
  $('scrub').value = currentFrame;
  $('currentTime').textContent = time(currentFrame / project.settings.fps);
  label('frameBadge', 'FRAME {frame}', { frame:String(currentFrame).padStart(4, '0') });
}
function basePreview() {
  if (!project?.build) return;
  cancelFrameLoad();
  video.pause(); video.loop = false; mode = 'normal'; wholeVideo = false; label('previewMode', 'TOÀN BỘ VIDEO');
  video.src = endpoint(`media/preview.mp4?v=${project.build}`);
  $('frameImage').hidden = true; $('videoPlaceholder').hidden = true;
  $('thumbs').src = endpoint(`media/thumbs.jpg?v=${project.build}`);
  $('scrub').max = project.totalFrames - 1;
  $('duration').textContent = time(project.duration); $('timelineEnd').textContent = time(project.duration);
  label('frameCount', '{frames} frames · {fps} fps', { frames:project.totalFrames, fps:project.settings.fps });
  updatePosition(0);
}
function renderCues(loop = null) {
  if (loop) draft = [{ name:'A', id:1, frame:loop.a }, { name:'B', id:2, frame:loop.b }];
  updateBand(); setControls();
}
function updateBand() {
  const { a, b, enabled } = getLoop();
  $('loopBand').style.left = `${a / project.totalFrames * 100}%`;
  $('loopBand').style.width = `${Math.max(0, b - a) / project.totalFrames * 100}%`;
  $('loopBand').classList.toggle('inactive', !enabled);
  label('loopStatus', enabled ? 'Loop A → B · {time}' : 'Không lặp · Đưa cả A và B vào trong video để bật loop', { time:time((b - a) / project.settings.fps) });
  for (const [i, name] of ['A','B'].entries()) {
    const marker = $(`marker${name}`), frame = draft[i].frame;
    marker.style.left = `${frame / project.totalFrames * 100}%`;
    marker.setAttribute('aria-valuemin', i ? a + 1 : 0);
    marker.setAttribute('aria-valuemax', i ? project.totalFrames : b - 1);
    marker.setAttribute('aria-valuenow', frame);
    marker.setAttribute('aria-valuetext', t('Frame {frame}, {time}', { frame, time:time(frame / project.settings.fps) }));
    marker.title = t('{name} · frame {frame} · {time}', { name, frame, time:time(frame / project.settings.fps) });
    $(`point${name}`).textContent = time(frame / project.settings.fps);
    $(`point${name}`).title = marker.title;
  }
}
function moveCue(index, value) {
  if (busy || uploading || !project?.build) return;
  const min = index ? draft[0].frame + 1 : 0, max = index ? project.totalFrames : draft[1].frame - 1;
  const frame = Math.max(min, Math.min(max, Math.round(value)));
  if (!Number.isFinite(frame)) return renderCues();
  if (frame === draft[index].frame) return renderCues();
  if (mode === 'seam') basePreview();
  video.pause(); mode = 'normal'; wholeVideo = false; label('previewMode', 'TOÀN BỘ VIDEO');
  draft[index].frame = frame; markDirty(); renderCues();
}

for (const [index, name] of ['A','B'].entries()) {
  const marker = $(`marker${name}`);
  let drag = null;
  marker.onpointerdown = event => {
    if (event.button !== 0 || marker.disabled) return;
    event.preventDefault(); event.stopPropagation(); marker.focus();
    drag = { id: event.pointerId, frame: draft[index].frame };
    marker.setPointerCapture(event.pointerId);
  };
  marker.onpointermove = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const rect = marker.closest('.timeline').getBoundingClientRect();
    if (rect.width) moveCue(index, (event.clientX - rect.left) / rect.width * project.totalFrames);
  };
  marker.onpointerup = event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null; marker.releasePointerCapture(event.pointerId);
  };
  marker.onpointercancel = () => { if (drag) moveCue(index, drag.frame); drag = null; };
  marker.onlostpointercapture = () => { drag = null; };
  marker.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || marker.disabled) return;
    event.preventDefault(); event.stopPropagation();
    const value = event.key === 'Home' ? 0 : event.key === 'End' ? project.totalFrames : draft[index].frame + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1);
    moveCue(index, value);
  };
}
function renderDownloads() {
  const out = project.exports?.[0]; $('downloads').hidden = !out;
  if (!out) return;
  label('downloadInfo', '{size} MB · {width} × {height} · {frames} frames · Đã kiểm tra giải mã', { size:(out.size / 1024 / 1024).toFixed(2), width:out.settings.width, height:out.settings.height, frames:out.frames });
  $('downloadLinks').innerHTML = `<a class="button primary" data-i18n="↓ Tải USM" href="${endpoint(`exports/${out.id}/video.usm`)}"></a><a class="button secondary" data-i18n="Cue points" href="${endpoint(`exports/${out.id}/cue_point.txt`)}"></a><a class="button subtle" data-i18n="Dự án" href="${endpoint(`exports/${out.id}/project.json`)}"></a>${out.cuesVerified ? `<a class="button subtle" data-i18n="Kiểm tra" href="${endpoint(`exports/${out.id}/verification.json`)}"></a>` : ''}`;
  window.USMI18n.apply();
}
function renderJob() {
  const j = project?.job; busy = Boolean(j && ['queued','running'].includes(j.status));
  if (uploading) { setControls(); return; }
  $('jobName').textContent = project?.name || '';
  $('jobPanel').hidden = !j || j.status === 'done';
  if (j) { label('jobPhase', j.phase || 'Đang xử lý…'); $('jobPercent').textContent = `${j.progress}%`; $('jobProgress').value = j.progress; $('jobSpinner').hidden = !busy; $('jobError').hidden = !j.error; label('jobError', j.error || ''); }
  setControls();
}
async function select(id) {
  if (uploading) return;
  if (dirty && !confirm(t('Cue point chưa được lưu. Chuyển dự án và bỏ các thay đổi này?'))) return;
  clearTimeout(pollTimer); video.pause(); cancelFrameLoad(); project = await api(`/api/projects/${id}`); localStorage.setItem('usm-project', id);
  draft = structuredClone(project.cues || []); markSaved(); refreshHeader(); syncSettings();
  if (project.build) { basePreview(); renderCues(project.loop); } else { video.removeAttribute('src'); video.load(); $('frameImage').hidden = true; $('videoPlaceholder').hidden = false; }
  renderDownloads(); renderJob(); await library(); if (busy) schedulePoll();
}
function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try { await poll(); } catch (error) { toast('Mất kết nối tạm thời, đang thử lại…', true); if (project && busy) { clearTimeout(pollTimer); pollTimer = setTimeout(schedulePoll, 2500); } }
  }, 900);
}
async function poll() {
  const id = project.id, prev = project.job;
  const next = await api(`/api/projects/${id}`); if (project.id !== id) return;
  project = next; refreshHeader(); renderJob();
  if (busy) return schedulePoll();
  if (next.job?.status === 'done' && prev?.status !== 'done') {
    await completedJob();
  }
}
async function completedJob() {
  if (project.job.type === 'prepare') { draft = structuredClone(project.cues); markSaved(); syncSettings(); basePreview(); renderCues(project.loop); }
  if (project.job.type === 'seam' && project.seam?.build === project.build) { mode = 'seam'; video.src = project.seam.url; video.loop = true; $('frameImage').hidden = true; label('previewMode', 'ĐOẠN NỐI B → A'); setControls(); await video.play().catch(() => toast('Đoạn nối sẵn sàng. Bấm phát để xem.')); }
  if (project.job.type === 'export') { renderDownloads(); $('downloads').open = true; toast('File USM đã sẵn sàng để tải xuống.'); }
  await library();
}
async function takeJob(next) { cancelFrameLoad(); project = next; video.pause(); renderJob(); if (next.job?.status === 'done') await completedJob(); else if (busy) schedulePoll(); }

async function upload(file) {
  if (!file || uploading) return;
  if (dirty && !confirm(t('Cue point chưa lưu. Tiếp tục tải video mới?'))) return;
  const health = await api('/api/health');
  if (file.size > health.maxUploadMB * 1024 * 1024) throw new Error(t('File tối đa {max} MB.', { max:health.maxUploadMB }));
  uploading = true; setControls(); $('chooseFile').disabled = true; $('jobPanel').hidden = false; $('jobSpinner').hidden = false; $('jobError').hidden = true; $('jobName').textContent = file.name; label('jobPhase', 'Đang tải video lên'); $('jobProgress').value = 0; $('jobPercent').textContent = '0%';
  try {
    const p = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/projects'); xhr.setRequestHeader('Content-Type','application/octet-stream'); xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = event => { if (event.lengthComputable) { const n = Math.round(event.loaded / event.total * 100); $('jobProgress').value = n; $('jobPercent').textContent = `${n}%`; } };
      xhr.onload = () => { try { const result = JSON.parse(xhr.responseText); if (xhr.status >= 400) reject(new Error(result.error)); else resolve(result); } catch { reject(new Error('Máy chủ trả về dữ liệu không hợp lệ.')); } };
      xhr.onerror = () => reject(new Error('Upload thất bại. Kiểm tra kết nối hoặc dung lượng file.'));
      xhr.send(file);
    });
    uploading = false; markSaved(); await select(p.id);
  } catch (error) {
    $('jobSpinner').hidden = true; label('jobPhase', 'Upload thất bại'); label('jobError', error.message); $('jobError').hidden = false;
    throw error;
  } finally { uploading = false; setControls(); $('chooseFile').disabled = false; $('fileInput').value = ''; }
}
async function showFrame(n) {
  if (!project?.build || busy || uploading) return;
  if (mode === 'seam') basePreview();
  cancelFrameLoad(); setFrameLoading(true);
  video.pause(); mode = 'normal'; label('previewMode', 'TỪNG FRAME'); setControls();
  n = Math.max(0, Math.min(project.totalFrames - 1, n)); updatePosition(n); video.currentTime = n / project.settings.fps;
  const ticket = frameTicket, url = endpoint(`frame?n=${n}&v=${project.build}`);
  const controller = new AbortController(); frameController = controller;
  let nextURL;
  try {
    const response = await fetch(url, { signal:controller.signal });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Không tải được khung hình. Hãy thử tua lại.'); }
    const blob = await response.blob(); if (ticket !== frameTicket) return;
    nextURL = URL.createObjectURL(blob);
    // Keep the current preview visible until the new JPEG is decoded, not just downloaded.
    const frame = new Image(); frame.src = nextURL; await frame.decode();
    if (ticket !== frameTicket) return;
    const previousURL = frameURL; frameURL = nextURL; nextURL = null;
    $('frameImage').src = frameURL; $('frameImage').hidden = false;
    if (previousURL) URL.revokeObjectURL(previousURL);
  } catch (error) {
    // A superseded request must not clear the new loader or display an old error.
    if (ticket === frameTicket && !controller.signal.aborted) toast('Không tải được khung hình. Hãy thử tua lại.', true);
  } finally {
    if (nextURL) URL.revokeObjectURL(nextURL);
    if (ticket === frameTicket) { frameController = null; setFrameLoading(false); }
  }
}
async function startPlayback(nextMode) {
  const range = nextMode === 'loop' || nextMode === 'intro' ? getLoop() : null;
  if (range && !range.enabled) throw new Error('Đưa cả A và B vào trong video để bật loop.');
  if (mode === 'seam') basePreview();
  cancelFrameLoad(); $('frameImage').hidden = true; mode = nextMode; wholeVideo = nextMode === 'normal'; video.loop = false;
  if (nextMode === 'loop') video.currentTime = range.a / project.settings.fps;
  else if (nextMode === 'intro') video.currentTime = 0;
  label('previewMode', ({ normal:'TOÀN BỘ VIDEO', loop:'LẶP A → B', intro:'INTRO → LOOP' })[mode]); setControls();
  await video.play();
}
function onFrame() {
  if (project?.build && !video.paused && mode !== 'seam') {
    if (mode === 'loop' || mode === 'intro') {
      const { a, b } = getLoop();
      if (a < b && video.currentTime >= b / project.settings.fps - .002) video.currentTime = a / project.settings.fps;
    }
    updatePosition(Math.round(video.currentTime * project.settings.fps));
  }
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame);
}
if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(onFrame); else video.addEventListener('timeupdate', onFrame);
video.addEventListener('play', () => $('play').textContent = '❚❚'); video.addEventListener('pause', () => $('play').textContent = '▶');
video.addEventListener('ended', safely(async () => { if (mode === 'loop' || mode === 'intro') { video.currentTime = getLoop().a / project.settings.fps; await video.play(); } }));
video.addEventListener('error', () => { if (video.getAttribute('src')) toast('Không phát được preview. Thử tạo lại preview.', true); });

async function saveCues() {
  const s = outputSettings();
  const next = await api(endpoint('cues'), { method: 'PUT', body: JSON.stringify({ cues: draft, loop: getLoop(), bitrate:s.bitrate, audio:s.audio }) }); project = next; draft = structuredClone(next.cues); markSaved(); renderCues(next.loop); return next;
}
$('newProject').onclick = $('chooseFile').onclick = () => $('fileInput').click();
$('fileInput').onchange = safely(event => upload(event.target.files[0]));
for (const event of ['dragover','dragenter']) $('emptyState').addEventListener(event, e => { e.preventDefault(); $('emptyState').classList.add('dragging'); });
$('emptyState').addEventListener('dragleave', () => $('emptyState').classList.remove('dragging'));
$('emptyState').addEventListener('drop', safely(event => { event.preventDefault(); $('emptyState').classList.remove('dragging'); return upload(event.dataTransfer.files[0]); }));
$('projectList').onclick = safely(event => { const target = event.target.closest('[data-id]'); if (target) return select(target.dataset.id); });
$('play').onclick = safely(async () => { cancelFrameLoad(); if (!video.paused) video.pause(); else if (mode === 'seam') await video.play(); else { $('frameImage').hidden = true; if (!wholeVideo && hasLoop()) { if (mode === 'normal') mode = 'intro'; label('previewMode', mode === 'loop' ? 'LẶP A → B' : 'INTRO → LOOP'); if (video.currentTime >= getLoop().b / project.settings.fps) video.currentTime = getLoop().a / project.settings.fps; } await video.play(); } });
$('prevFrame').onclick = safely(() => showFrame(currentFrame - 1)); $('nextFrame').onclick = safely(() => showFrame(currentFrame + 1));
$('scrub').oninput = () => {
  if (!project?.build || busy || uploading) return;
  const n = Number($('scrub').value);
  if (mode === 'seam') basePreview();
  cancelFrameLoad(); video.pause(); updatePosition(n); setFrameLoading(true);
  // Show feedback immediately, including during the debounce before requesting a frame.
  seekTimer = setTimeout(safely(() => showFrame(n)), 180);
};
$('fullScreen').onclick = safely(() => video.parentElement.requestFullscreen());
$('loopPlay').onclick = safely(() => startPlayback('loop')); $('introPlay').onclick = safely(() => startPlayback('intro')); $('normalPlay').onclick = safely(() => startPlayback('normal'));
$('seamPlay').onclick = safely(async () => { const range = getLoop(); await takeJob(await api(endpoint('seam'), { method:'POST', body:JSON.stringify(range) })); });
$('resolution').onchange = () => { if ($('resolution').value !== 'custom') { const [w,h] = $('resolution').value.split('x'); $('width').value = w; $('height').value = h; } };
for (const id of ['width','height']) $(id).onchange = () => $('resolution').value = 'custom';
$('bitrate').oninput = () => $('bitrateLabel').textContent = `${$('bitrate').value} Mbps`;
$('applySettings').onclick = safely(async () => { if (dirty) await saveCues(); await takeJob(await api(endpoint('prepare'), { method:'POST', body:JSON.stringify(outputSettings()) })); });
for (const [index, name] of ['A','B'].entries()) {
  $(`set${name}`).onclick = () => {
    if (mode === 'seam') return;
    const frame = video.paused ? currentFrame : Math.floor(video.currentTime * project.settings.fps);
    moveCue(index, frame);
  };
  $(`goTo${name}`).onclick = safely(() => showFrame(draft[index].frame));
}
$('saveCues').onclick = safely(async () => { await saveCues(); toast('Đã lưu cue point.'); });
$('downloadCue').onclick = safely(async () => { await saveCues(); location.href = endpoint('cue_point.txt'); });
$('saveProject').onclick = safely(async () => { if (!preparedMatches()) throw new Error('Hãy áp dụng kích thước/FPS mới trước khi lưu dự án.'); await saveCues(); location.href = endpoint('project.json'); });
$('deleteProject').onclick = safely(async () => {
  if (!confirm(t('Xóa bản video đã upload, preview và các bản xuất của dự án này? File nguồn trên máy bạn không bị ảnh hưởng.'))) return;
  await api(`/api/projects/${project.id}`, { method:'DELETE', body:'{}' });
  clearTimeout(pollTimer); video.pause(); cancelFrameLoad(); project = null; markSaved(); localStorage.removeItem('usm-project');
  $('editor').hidden = true; $('emptyState').hidden = false; $('jobPanel').hidden = true;
  label('projectTitle', 'Từ video đến USM.'); label('projectSubtitle', 'Chọn khung hình. Đặt A/B. Hoàn thiện vòng lặp.');
  busy = false; setControls(); await library(); toast('Đã xóa dự án.');
});
$('importCue').onclick = () => $('cueInput').click();
$('cueInput').onchange = safely(async event => { const file = event.target.files[0]; if (!file) return; const next = await api(endpoint('cues'), { method:'PUT', body:JSON.stringify({ text:await file.text() }) }); project = next; draft = structuredClone(next.cues); video.pause(); basePreview(); markSaved(); renderCues(next.loop); $('cueInput').value=''; toast('Đã nhập hai cue point A/B.'); });
$('importProject').onclick = () => $('projectInput').click();
$('projectInput').onchange = safely(async event => { const file = event.target.files[0]; if (!file) return; const next = await api(endpoint('restore'), { method:'POST', body:await file.text() }); project = next; draft = structuredClone(next.cues); basePreview(); syncSettings(); markSaved(); renderCues(next.loop); $('projectInput').value=''; toast('Đã khôi phục cấu hình và cue point.'); });
$('export').onclick = safely(async () => { if (!preparedMatches()) throw new Error('Bấm “Áp dụng & tạo lại preview” để dùng kích thước hoặc FPS mới trước khi xuất.'); const s = outputSettings(); const next = await api(endpoint('export'), { method:'POST', body:JSON.stringify({ bitrate:s.bitrate, audio:s.audio, cues:draft, loop:getLoop() }) }); markSaved(); await takeJob(next); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue=''; } });
const projectMenu = document.querySelector('.project-menu');
projectMenu.addEventListener('click', event => { if (event.target.closest('button')) projectMenu.open = false; });
document.addEventListener('click', event => {
  if (projectMenu.open && !projectMenu.contains(event.target)) projectMenu.open = false;
}, true);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && projectMenu.open) {
    projectMenu.open = false; projectMenu.querySelector('summary').focus(); event.preventDefault();
  }
});
$('languageToggle').onclick = () => { window.USMI18n.setLanguage(window.USMI18n.language === 'vi' ? 'en' : 'vi'); if (project?.build && draft.length === 2) updateBand(); };
window.USMI18n.apply(); setControls();
document.addEventListener('keydown', safely(event => { if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || !project?.build || busy) return; if (event.code === 'Space') { event.preventDefault(); $('play').click(); } if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); return showFrame(currentFrame + (event.key === 'ArrowLeft' ? -1 : 1)); } }));
await safely(async () => {
  const health = await api('/api/health'); label('engine', !health.encoder ? 'Chưa kết nối encoder' : health.encoderInfo?.backend === 'native' ? 'Native USM · Sẵn sàng' : 'Encoder đã kết nối'); $('engine').classList.toggle('offline', !health.encoder); label('uploadHint', 'MP4 · WEBM · MOV · MKV · AVI · USM · Tối đa {max} MB / 10 phút', { max:health.maxUploadMB });
  if(health.encoderInfo?.maxEncodeMB) label('exportLimit', 'Ngân sách đóng gói: {max} MB. Video dài có thể cần giảm bitrate.', { max:health.encoderInfo.maxEncodeMB });
  const list = await library(), last = localStorage.getItem('usm-project');
  if (last && list.some(p => p.id === last)) await select(last);
})();
