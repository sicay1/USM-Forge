const $ = id => document.getElementById(id);
let project = null, draft = [], dirty = false, busy = false, currentFrame = 0, mode = 'normal', uploading = false, pollTimer, frameTicket = 0, frameURL, toastTimer;
const video = $('video');
const time = seconds => { const ms = Math.max(0, Math.round(seconds * 1000)); return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
const escape = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function toast(message, error = false) { $('toast').textContent = message; $('toast').hidden = false; $('toast').classList.toggle('error-toast', error); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, error ? 8000 : 3500); }
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Yêu cầu thất bại.'); return result;
}
const endpoint = suffix => `/api/projects/${project.id}/${suffix}`;
function safely(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(error => toast(error.message, true)); }
function markDirty() { dirty = true; $('cueSaveState').textContent = 'Có thay đổi chưa lưu'; $('cueSaveState').classList.add('dirty'); }
function markSaved() { dirty = false; $('cueSaveState').textContent = 'Đã lưu'; $('cueSaveState').classList.remove('dirty'); }
function getLoop() { const a = Number($('loopA').value), b = Number($('loopB').value); if (!(a < b)) throw new Error('Chọn A trước B để phát vòng lặp.'); return { a, b }; }
function outputSettings() { return { width: Number($('width').value), height: Number($('height').value), fps: Number($('fps').value), bitrate: Number($('bitrate').value) * 1000000, audio: $('audio').checked }; }
function preparedMatches() { const s = outputSettings(); return project && ['width', 'height', 'fps'].every(k => s[k] === project.settings[k]); }
function setControls() {
  const ready = Boolean(project?.build), locked = busy || !ready;
  for (const id of ['prevFrame','nextFrame','play','scrub','loopPlay','introPlay','seamPlay','normalPlay','loopA','loopB','resolution','width','height','fps','bitrate','applySettings','audio','export','saveProject','addCue','saveCues','importCue','importProject','downloadCue','fullScreen']) $(id).disabled = locked;
  if (ready && !busy) $('audio').disabled = !project.meta.audio;
  document.querySelectorAll('#cueRows input,#cueRows button').forEach(el => el.disabled = locked);
  $('newProject').disabled = uploading;
  $('deleteProject').disabled = busy || !project;
}

async function library() {
  const list = await api('/api/projects'); $('projectCount').textContent = list.length;
  $('projectList').innerHTML = list.map(p => `<button class="project-item ${p.id === project?.id ? 'active' : ''}" data-id="${p.id}" title="${escape(p.name)}"><span class="project-icon">▧</span><span><strong>${escape(p.name)}</strong><small>${p.duration ? time(p.duration) + ' · ' + p.settings.fps + ' fps' : 'Đang chuẩn bị'}</small></span></button>`).join('');
  return list;
}
function refreshHeader() {
  $('projectTitle').textContent = project.name;
  $('projectSubtitle').textContent = project.meta ? `${project.meta.width} × ${project.meta.height} · ${project.meta.codec.toUpperCase()} · ${(project.meta.size / 1024 / 1024).toFixed(1)} MB${project.meta.audio ? ' · Có âm thanh' : ' · Không âm thanh'}` : 'Đang đọc thông tin video…';
  $('emptyState').hidden = true; $('editor').hidden = false;
}
function syncSettings() {
  if (!project.settings) return;
  for (const key of ['width','height','fps']) $(key).value = String(project.settings[key]);
  const res = `${project.settings.width}x${project.settings.height}`;
  $('resolution').value = [...$('resolution').options].some(x => x.value === res) ? res : 'custom';
  $('bitrate').value = project.settings.bitrate / 1000000; $('bitrateLabel').textContent = `${$('bitrate').value} Mbps`;
  $('audio').checked = project.settings.audio;
  $('audioHint').textContent = project.meta.audio ? 'Âm thanh stereo 48 kHz khi xuất USM.' : 'Video nguồn không có âm thanh.';
}
function updatePosition(frame) {
  currentFrame = Math.max(0, Math.min(project.totalFrames - 1, frame));
  $('scrub').value = currentFrame;
  $('currentTime').textContent = time(currentFrame / project.settings.fps);
  $('frameBadge').textContent = `FRAME ${String(currentFrame).padStart(4, '0')}`;
}
function basePreview() {
  if (!project?.build) return;
  video.pause(); video.loop = false; mode = 'normal'; $('previewMode').textContent = 'TOÀN BỘ VIDEO';
  video.src = endpoint(`media/preview.mp4?v=${project.build}`);
  $('frameImage').hidden = true; $('videoPlaceholder').hidden = true;
  $('thumbs').src = endpoint(`media/thumbs.jpg?v=${project.build}`);
  $('scrub').max = project.totalFrames - 1;
  $('duration').textContent = time(project.duration); $('timelineEnd').textContent = time(project.duration);
  $('frameCount').textContent = `${project.totalFrames} frames · ${project.settings.fps} fps`;
  frameTicket++; updatePosition(0);
}
function renderCues(loop = null) {
  const previous = loop || { a: Number($('loopA').value), b: Number($('loopB').value) };
  $('cueCount').textContent = draft.length;
  $('cueRows').innerHTML = draft.map((c, i) => `<tr data-index="${i}"><td><input aria-label="Tên cue ${i + 1}" data-key="name" value="${escape(c.name)}" maxlength="64"></td><td><input aria-label="ID cue ${i + 1}" data-key="id" type="number" min="0" max="65535" value="${c.id}"></td><td><input aria-label="Frame cue ${i + 1}" data-key="frame" type="number" min="0" max="${project.totalFrames}" value="${c.frame}"></td><td>${time(c.frame / project.settings.fps)}</td><td><button class="row-action" data-go="${i}">Đến ↗</button><button class="row-action danger" data-delete="${i}" aria-label="Xóa ${escape(c.name)}">×</button></td></tr>`).join('');
  const choices = [...draft].sort((a, b) => a.frame - b.frame);
  const opts = `<option value="0">Đầu video · 00:00.000</option>` + choices.map(c => `<option value="${c.frame}">${escape(c.name)} · ${time(c.frame / project.settings.fps)}</option>`).join('') + `<option value="${project.totalFrames}">Cuối video · ${time(project.duration)}</option>`;
  $('loopA').innerHTML = opts; $('loopB').innerHTML = opts;
  $('loopA').value = String(previous.a); $('loopB').value = String(previous.b);
  if ($('loopA').selectedIndex < 0) $('loopA').value = '0';
  if ($('loopB').selectedIndex < 0) $('loopB').value = String(project.totalFrames);
  $('cueMarkers').innerHTML = choices.map(c => `<span class="cue-marker" style="left:${Math.max(0, Math.min(100, c.frame / project.totalFrames * 100))}%"></span>`).join('');
  updateBand(); setControls();
}
function updateBand() {
  const a = Number($('loopA').value), b = Number($('loopB').value);
  $('loopBand').style.left = `${a / project.totalFrames * 100}%`;
  $('loopBand').style.width = `${Math.max(0, b - a) / project.totalFrames * 100}%`;
}
function renderDownloads() {
  const out = project.exports?.[0]; $('downloads').hidden = !out;
  if (!out) return;
  $('downloadInfo').textContent = `${(out.size / 1024 / 1024).toFixed(2)} MB · ${out.settings.width} × ${out.settings.height} · ${out.frames} frames · Đã kiểm tra giải mã`;
  $('downloadLinks').innerHTML = `<a class="button primary" href="${endpoint(`exports/${out.id}/video.usm`)}">↓ Tải USM</a><a class="button secondary" href="${endpoint(`exports/${out.id}/cue_point.txt`)}">Cue points</a><a class="button subtle" href="${endpoint(`exports/${out.id}/project.json`)}">Dự án</a>${out.cuesVerified ? `<a class="button subtle" href="${endpoint(`exports/${out.id}/verification.json`)}">Kiểm tra</a>` : ''}`;
}
function renderJob() {
  const j = project?.job; busy = Boolean(j && ['queued','running'].includes(j.status));
  $('jobPanel').hidden = !j || j.status === 'done';
  if (j) { $('jobPhase').textContent = j.phase; $('jobPercent').textContent = `${j.progress}%`; $('jobProgress').value = j.progress; $('jobSpinner').hidden = !busy; $('jobError').hidden = !j.error; $('jobError').textContent = j.error || ''; }
  setControls();
}
async function select(id) {
  if (dirty && !confirm('Cue point chưa được lưu. Chuyển dự án và bỏ các thay đổi này?')) return;
  clearTimeout(pollTimer); video.pause(); frameTicket++; project = await api(`/api/projects/${id}`); localStorage.setItem('usm-project', id);
  draft = structuredClone(project.cues || []); markSaved(); refreshHeader(); syncSettings();
  if (project.build) { basePreview(); renderCues(project.loop); } else { video.removeAttribute('src'); video.load(); $('frameImage').hidden = true; $('videoPlaceholder').hidden = false; $('cueRows').innerHTML = ''; }
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
  if (project.job.type === 'seam' && project.seam?.build === project.build) { mode = 'seam'; video.src = project.seam.url; video.loop = true; $('frameImage').hidden = true; $('previewMode').textContent = 'ĐOẠN NỐI B → A'; await video.play().catch(() => toast('Đoạn nối sẵn sàng. Bấm phát để xem.')); }
  if (project.job.type === 'export') { renderDownloads(); toast('File USM đã sẵn sàng để tải xuống.'); }
  await library();
}
async function takeJob(next) { project = next; video.pause(); renderJob(); if (next.job?.status === 'done') await completedJob(); else if (busy) schedulePoll(); }

async function upload(file) {
  if (!file || uploading) return;
  if (dirty && !confirm('Cue point chưa lưu. Tiếp tục tải video mới?')) return;
  const health = await api('/api/health');
  if (file.size > health.maxUploadMB * 1024 * 1024) throw new Error(`File tối đa ${health.maxUploadMB} MB.`);
  uploading = true; $('newProject').disabled = true; $('chooseFile').disabled = true; $('jobPanel').hidden = false; $('jobSpinner').hidden = false; $('jobError').hidden = true; $('jobPhase').textContent = 'Đang tải video lên'; $('jobProgress').value = 0;
  try {
    const p = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/projects'); xhr.setRequestHeader('Content-Type','application/octet-stream'); xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = event => { if (event.lengthComputable) { const n = Math.round(event.loaded / event.total * 100); $('jobProgress').value = n; $('jobPercent').textContent = `${n}%`; } };
      xhr.onload = () => { try { const result = JSON.parse(xhr.responseText); if (xhr.status >= 400) reject(new Error(result.error)); else resolve(result); } catch { reject(new Error('Máy chủ trả về dữ liệu không hợp lệ.')); } };
      xhr.onerror = () => reject(new Error('Upload thất bại. Kiểm tra kết nối hoặc dung lượng file.'));
      xhr.send(file);
    });
    markSaved(); await select(p.id);
  } finally { uploading = false; $('newProject').disabled = false; $('chooseFile').disabled = false; $('fileInput').value = ''; }
}
async function showFrame(n) {
  if (!project?.build || busy) return;
  if (mode === 'seam') basePreview();
  video.pause(); mode = 'normal'; $('previewMode').textContent = 'TỪNG FRAME';
  n = Math.max(0, Math.min(project.totalFrames - 1, n)); updatePosition(n); video.currentTime = n / project.settings.fps;
  const ticket = ++frameTicket, url = endpoint(`frame?n=${n}&v=${project.build}`);
  const response = await fetch(url); if (!response.ok) { const error = await response.json(); throw new Error(error.error); }
  const blob = await response.blob(); if (ticket !== frameTicket) return;
  if (frameURL) URL.revokeObjectURL(frameURL); frameURL = URL.createObjectURL(blob);
  $('frameImage').src = frameURL; $('frameImage').hidden = false;
}
async function startPlayback(nextMode) {
  const range = nextMode === 'loop' || nextMode === 'intro' ? getLoop() : null;
  if (mode === 'seam') basePreview();
  frameTicket++; $('frameImage').hidden = true; mode = nextMode; video.loop = nextMode === 'normal';
  if (nextMode === 'loop') video.currentTime = range.a / project.settings.fps;
  else if (nextMode === 'intro') video.currentTime = 0;
  $('previewMode').textContent = ({ normal:'TOÀN BỘ VIDEO', loop:'LẶP A → B', intro:'INTRO → LOOP' })[mode];
  await video.play();
}
function onFrame() {
  if (project?.build && !video.paused && mode !== 'seam') {
    if (mode === 'loop' || mode === 'intro') {
      const a = Number($('loopA').value), b = Number($('loopB').value);
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
$('play').onclick = safely(async () => { if (!video.paused) video.pause(); else if (mode === 'seam') await video.play(); else { frameTicket++; $('frameImage').hidden = true; await video.play(); } });
$('prevFrame').onclick = safely(() => showFrame(currentFrame - 1)); $('nextFrame').onclick = safely(() => showFrame(currentFrame + 1));
let seekTimer; $('scrub').oninput = () => { video.pause(); updatePosition(Number($('scrub').value)); clearTimeout(seekTimer); seekTimer = setTimeout(safely(() => showFrame(currentFrame)), 180); };
$('fullScreen').onclick = safely(() => video.parentElement.requestFullscreen());
$('loopPlay').onclick = safely(() => startPlayback('loop')); $('introPlay').onclick = safely(() => startPlayback('intro')); $('normalPlay').onclick = safely(() => startPlayback('normal'));
$('seamPlay').onclick = safely(async () => { const range = getLoop(); await takeJob(await api(endpoint('seam'), { method:'POST', body:JSON.stringify(range) })); });
for (const id of ['loopA','loopB']) $(id).onchange = () => { markDirty(); updateBand(); };
$('resolution').onchange = () => { if ($('resolution').value !== 'custom') { const [w,h] = $('resolution').value.split('x'); $('width').value = w; $('height').value = h; } };
for (const id of ['width','height']) $(id).onchange = () => $('resolution').value = 'custom';
$('bitrate').oninput = () => $('bitrateLabel').textContent = `${$('bitrate').value} Mbps`;
$('applySettings').onclick = safely(async () => { if (dirty) await saveCues(); await takeJob(await api(endpoint('prepare'), { method:'POST', body:JSON.stringify(outputSettings()) })); });
$('addCue').onclick = () => { let n=1; while (draft.some(c => c.name === `cue_${n}`)) n++; draft.push({ name:`cue_${n}`, id:n, frame:currentFrame }); markDirty(); renderCues(); };
$('cueRows').onchange = event => { const input = event.target.closest('[data-key]'); if (!input) return; const index = Number(input.closest('tr').dataset.index); draft[index][input.dataset.key] = input.dataset.key === 'name' ? input.value : Number(input.value); markDirty(); renderCues(); };
$('cueRows').onclick = safely(event => { const go = event.target.closest('[data-go]'), del = event.target.closest('[data-delete]'); if (go) return showFrame(draft[Number(go.dataset.go)].frame); if (del) { draft.splice(Number(del.dataset.delete),1); markDirty(); renderCues(); } });
$('saveCues').onclick = safely(async () => { await saveCues(); toast('Đã lưu cue point.'); });
$('downloadCue').onclick = safely(async () => { await saveCues(); location.href = endpoint('cue_point.txt'); });
$('saveProject').onclick = safely(async () => { if (!preparedMatches()) throw new Error('Hãy áp dụng kích thước/FPS mới trước khi lưu dự án.'); await saveCues(); location.href = endpoint('project.json'); });
$('deleteProject').onclick = safely(async () => {
  if (!confirm('Xóa bản video đã upload, preview và các bản xuất của dự án này? File nguồn trên máy bạn không bị ảnh hưởng.')) return;
  await api(`/api/projects/${project.id}`, { method:'DELETE', body:'{}' });
  clearTimeout(pollTimer); video.pause(); frameTicket++; project = null; markSaved(); localStorage.removeItem('usm-project');
  $('editor').hidden = true; $('emptyState').hidden = false; $('jobPanel').hidden = true;
  $('projectTitle').textContent = 'Từ video đến USM.'; $('projectSubtitle').textContent = 'Chọn khung hình. Đặt cue point. Hoàn thiện vòng lặp.';
  busy = false; setControls(); await library(); toast('Đã xóa dự án.');
});
$('importCue').onclick = () => $('cueInput').click();
$('cueInput').onchange = safely(async event => { const file = event.target.files[0]; if (!file) return; const next = await api(endpoint('cues'), { method:'PUT', body:JSON.stringify({ text:await file.text() }) }); project = next; draft = structuredClone(next.cues); markSaved(); renderCues(); $('cueInput').value=''; toast('Đã nhập cue point. Chọn A và B để xem thử.'); });
$('importProject').onclick = () => $('projectInput').click();
$('projectInput').onchange = safely(async event => { const file = event.target.files[0]; if (!file) return; const next = await api(endpoint('restore'), { method:'POST', body:await file.text() }); project = next; draft = structuredClone(next.cues); syncSettings(); markSaved(); renderCues(next.loop); $('projectInput').value=''; toast('Đã khôi phục cấu hình và cue point.'); });
$('export').onclick = safely(async () => { if (!preparedMatches()) throw new Error('Bấm “Áp dụng & tạo lại preview” để dùng kích thước hoặc FPS mới trước khi xuất.'); const s = outputSettings(); const next = await api(endpoint('export'), { method:'POST', body:JSON.stringify({ bitrate:s.bitrate, audio:s.audio, cues:draft, loop:getLoop() }) }); markSaved(); await takeJob(next); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue=''; } });
document.addEventListener('keydown', safely(event => { if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(event.target.tagName) || !project?.build || busy) return; if (event.code === 'Space') { event.preventDefault(); $('play').click(); } if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); return showFrame(currentFrame + (event.key === 'ArrowLeft' ? -1 : 1)); } }));
await safely(async () => {
  const health = await api('/api/health'); $('engine').textContent = !health.encoder ? 'Chưa kết nối encoder' : health.encoderInfo?.backend === 'native' ? 'Native USM · Sẵn sàng' : 'Encoder đã kết nối'; $('engine').classList.toggle('offline', !health.encoder); $('uploadHint').textContent += ` · Tối đa ${health.maxUploadMB} MB / 10 phút`;
  if(health.encoderInfo?.maxEncodeMB) $('exportLimit').textContent = `Ngân sách đóng gói: ${health.encoderInfo.maxEncodeMB} MB. Video dài có thể cần giảm bitrate.`;
  const list = await library(), last = localStorage.getItem('usm-project');
  if (last && list.some(p => p.id === last)) await select(last);
})();
