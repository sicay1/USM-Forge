import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

// DOM-level tests only; these do not launch or automate a browser.
async function setup(overrides = {}, {language = 'vi', restore = true} = {}) {
  const window = new Window({ url: 'http://localhost:3210', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  window.document.write(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const p = { id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'<video>.webm',build:'build-test',duration:8,totalFrames:240,meta:{width:1920,height:1080,codec:'vp9',size:668766,audio:false},settings:{width:1920,height:1080,fps:30,bitrate:6000000,audio:false},cues:[{name:'start',id:0,frame:0},{name:'loop_point',id:1,frame:15},{name:'loop_start',id:2,frame:195},{name:'end',id:0,frame:240}],loop:{a:15,b:195},exports:[],job:{status:'done',type:'prepare',progress:100}};
  Object.assign(p, overrides);
  const calls=[];
  window.HTMLElement.prototype.setPointerCapture=function(){};
  window.HTMLElement.prototype.releasePointerCapture=function(){};
  if (restore) window.localStorage.setItem('usm-project',p.id);
  window.localStorage.setItem('usm-language',language);
  window.structuredClone=structuredClone;
  window.fetch=async (url, options={}) => {
    calls.push({url,options});
    let result;
    if (url === '/api/health') result={encoder:true,maxUploadMB:512};
    else if (url === '/api/projects') result=[p];
    else if (options.method === 'PUT') {const b=JSON.parse(options.body);p.cues=b.cues;p.loop=b.loop;result=p;}
    else result=p;
    return {ok:true,json:async()=>structuredClone(result),blob:async()=>new window.Blob(['frame'])};
  };
  Object.defineProperty(window.HTMLMediaElement.prototype,'paused',{get(){return !this._playing;}});
  window.HTMLMediaElement.prototype.pause=function(){this._playing=false;this.dispatchEvent(new window.Event('pause'));};
  window.HTMLMediaElement.prototype.play=async function(){this._playing=true;this.dispatchEvent(new window.Event('play'));};
  window.HTMLMediaElement.prototype.load=function(){};
  window.HTMLImageElement.prototype.decode=async function(){};
  window.URL.createObjectURL=()=> 'blob:test-frame'; window.URL.revokeObjectURL=()=>{};
  window.eval(await readFile(new URL('../public/i18n.js',import.meta.url),'utf8'));
  await window.eval(`(async()=>{${await readFile(new URL('../public/app.js',import.meta.url),'utf8')}\n})()`);
  const flush=()=>new Promise(r=>setTimeout(r,30));
  return {window,p,calls,$:id=>window.document.getElementById(id),flush};
}
test('loaded project enables editor, escapes filename, shows EOF cue and correct loop',async()=>{
  const {window,$}=await setup();
  try {
    assert.equal($('editor').hidden,false);
    assert.equal($('projectTitle').textContent,'<video>.webm');
    assert.equal($('projectTitle').children.length,0);
    assert.equal($('cueRows'),null);
    assert.equal($('markerA').getAttribute('aria-valuenow'),'15'); assert.equal($('markerB').getAttribute('aria-valuenow'),'195');
    assert.equal(window.document.querySelector('.library-bottom'),null);
    for (const id of ['setA','goToA','setB','goToB']) assert.equal($(id).disabled,false);
    assert.equal($('export').disabled,false); assert.equal($('audio').disabled,true);
    assert.equal($('scrub').max,'239');
  } finally {await window.happyDOM.close();}
});
test('edit A and save sends only A/B with matching loop boundaries',async()=>{
  const {window,$,calls,flush}=await setup();
  try {
    assert.equal($('addCue'),null);
    assert.equal(window.document.querySelector('[data-delete]'),null);
    $('video').currentTime=1; await $('video').play(); $('setA').click();
    assert.match($('cueSaveState').textContent,/chưa lưu/);
    $('saveCues').click(); await flush();
    const sent=calls.find(c=>c.options.method==='PUT'); assert.ok(sent);
    const payload=JSON.parse(sent.options.body);
    assert.deepEqual(payload.cues,[{name:'A',id:1,frame:30},{name:'B',id:2,frame:195}]);
    assert.deepEqual(payload.loop,{a:30,b:195,enabled:true});
    assert.equal($('cueSaveState').textContent,'Đã lưu');
  } finally {await window.happyDOM.close();}
});

test('progress is in sidebar and all playback modes are inside transport',async()=>{
  const {window,$}=await setup({job:{status:'running',type:'prepare',phase:'Chuẩn hóa video',progress:65}});
  try {
    assert.ok($('jobPanel').closest('.library'));
    assert.equal($('jobPanel').hidden,false);
    assert.equal($('jobProgress').value,65);
    assert.equal($('jobName').textContent,'<video>.webm');
    for (const id of ['play','loopPlay','introPlay','seamPlay','normalPlay']) assert.ok($(id).closest('.transport'));
    assert.equal($('markerA').disabled,true);
  } finally {await window.happyDOM.close();}
});

test('loop requires both boundaries inside video',async()=>{
  const {window,$}=await setup({loop:{a:0,b:240}});
  try {
    assert.equal($('loopPlay').disabled,true);
    $('video').currentTime=20/30; await $('video').play(); $('setA').click();
    assert.equal($('introPlay').disabled,true);
    $('video').currentTime=200/30; await $('video').play(); $('setB').click();
    assert.equal($('loopPlay').disabled,false);
    assert.equal($('seamPlay').disabled,false);
    $('markerA').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    assert.equal($('loopPlay').disabled,true);
    assert.match($('loopStatus').textContent,/Không lặp/);
  } finally {await window.happyDOM.close();}
});

test('pointer drag snaps to frames, clamps boundaries and leaves scrub independent',async()=>{
  const {window,$}=await setup();
  try {
    window.document.querySelector('.timeline').getBoundingClientRect=()=>({left:100,width:480});
    const a=$('markerA'), b=$('markerB');
    a.dispatchEvent(new window.PointerEvent('pointerdown',{pointerId:1,button:0}));
    a.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:1,clientX:161}));
    assert.equal(a.getAttribute('aria-valuenow'),'31');
    assert.equal($('scrub').value,'0');
    a.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:1,clientX:900}));
    assert.equal(a.getAttribute('aria-valuenow'),'194');
    a.dispatchEvent(new window.PointerEvent('pointerup',{pointerId:1}));
    b.dispatchEvent(new window.PointerEvent('pointerdown',{pointerId:2,button:0}));
    b.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:2,clientX:0}));
    assert.equal(b.getAttribute('aria-valuenow'),'195');
    b.dispatchEvent(new window.PointerEvent('pointermove',{pointerId:2,clientX:1000}));
    assert.equal($('pointB').textContent,'00:08.000');
    assert.equal(b.getAttribute('aria-valuenow'),'240');
    b.dispatchEvent(new window.PointerEvent('pointercancel',{pointerId:2}));
    assert.equal(b.getAttribute('aria-valuenow'),'195');
    assert.equal(a,$('markerA'),'pointer capture element must survive rerender');
  } finally {await window.happyDOM.close();}
});

test('marker keyboard cannot cross A/B',async()=>{
  const {window,$}=await setup();
  try {
    $('markerA').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert.equal($('markerA').getAttribute('aria-valuenow'),'16');
    $('markerB').dispatchEvent(new window.KeyboardEvent('keydown',{key:'End',bubbles:true}));
    assert.equal($('markerB').getAttribute('aria-valuenow'),'240');
    $('markerA').dispatchEvent(new window.KeyboardEvent('keydown',{key:'End',bubbles:true}));
    assert.equal($('markerA').getAttribute('aria-valuenow'),'239');
    $('markerB').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    assert.equal($('markerB').getAttribute('aria-valuenow'),'240');
  } finally {await window.happyDOM.close();}
});

test('normal playback does not automatically loop whole video',async()=>{
  const {window,$,flush}=await setup({loop:{a:0,b:240}});
  try {
    $('normalPlay').click(); await flush();
    assert.equal($('video').loop,false);
  } finally {await window.happyDOM.close();}
});

test('upload progress and failure stay visible in sidebar',async()=>{
  const {window,$,flush}=await setup();
  try {
    let xhr;
    window.XMLHttpRequest=class {
      constructor(){xhr=this;this.upload={};}
      open(){} setRequestHeader(){} send(){}
    };
    Object.defineProperty($('fileInput'),'files',{value:[{name:'new.webm',size:1000}]});
    $('fileInput').dispatchEvent(new window.Event('change')); await flush();
    assert.equal($('jobName').textContent,'new.webm');
    assert.equal($('jobPercent').textContent,'0%');
    assert.equal($('markerA').disabled,true);
    xhr.upload.onprogress({lengthComputable:true,loaded:500,total:1000});
    assert.equal($('jobProgress').value,50);
    xhr.onerror(); await flush();
    assert.equal($('jobSpinner').hidden,true);
    assert.equal($('jobError').hidden,false);
    assert.equal($('newProject').disabled,false);
  } finally {await window.happyDOM.close();}
});
test('changed resolution blocks export until master is rebuilt',async()=>{
  const {window,$,calls,flush}=await setup();
  try {
    $('width').value='1280';$('export').click();await flush();
    assert.match($('toast').textContent,/tạo lại preview/);
    assert.equal(calls.some(c=>c.url.endsWith('/export')),false);
  } finally {await window.happyDOM.close();}
});
test('cached seam completion opens clip even if job is already done',async()=>{
  const {window,$,p,flush}=await setup();
  try {
    p.job={status:'done',type:'seam',progress:100};
    p.seam={build:p.build,url:`/api/projects/${p.id}/media/seam-15-195.mp4`};
    $('seamPlay').click();await flush();
    assert.equal($('previewMode').textContent,'ĐOẠN NỐI B → A');
    assert.equal($('video').loop,true);
  } finally {await window.happyDOM.close();}
});

test('set/go buttons use current source frame and EOF B never requests a nonexistent frame',async()=>{
  const {window,$,calls,flush}=await setup({loop:{a:0,b:240}});
  try {
    $('scrub').value='40'; $('scrub').dispatchEvent(new window.Event('input'));
    $('setA').click();
    assert.equal($('markerA').getAttribute('aria-valuenow'),'40');
    $('video').currentTime=6; await $('video').play(); $('setB').click();
    assert.equal($('markerB').getAttribute('aria-valuenow'),'180');
    $('goToA').click(); await flush();
    assert.equal($('scrub').value,'40');
    assert.ok(calls.some(c=>c.url.includes('/frame?n=40&')));
    $('goToB').click(); await flush();
    assert.equal($('scrub').value,'180');
    $('markerB').dispatchEvent(new window.KeyboardEvent('keydown',{key:'End'}));
    $('goToB').click(); await flush();
    assert.equal($('scrub').value,'239');
    assert.equal($('markerB').getAttribute('aria-valuenow'),'240');
    assert.equal(calls.some(c=>c.url.includes('/frame?n=240&')),false);
  } finally {await window.happyDOM.close();}
});

test('language changes preserve draft, playback position, output settings and filename',async()=>{
  const {window,$,calls,flush}=await setup({name:'Dự án'});
  try {
    $('video').currentTime=1; await $('video').play(); $('setA').click();
    $('width').value='1280';
    $('languageToggle').click();
    assert.equal(window.document.documentElement.lang,'en');
    assert.equal(window.localStorage.getItem('usm-language'),'en');
    assert.equal($('setA').textContent,'Set A'); assert.equal($('goToB').textContent,'Go to B');
    assert.equal($('cueSaveState').textContent,'Unsaved changes');
    assert.equal($('markerA').getAttribute('aria-valuenow'),'30');
    assert.equal($('video').currentTime,1); assert.equal($('width').value,'1280');
    assert.equal($('projectTitle').textContent,'Dự án');
    assert.equal($('fullScreen').getAttribute('aria-label'),'Fullscreen');
    $('export').click(); await flush();
    assert.match($('toast').textContent,/Apply & rebuild preview/);
    assert.equal(calls.some(c=>c.url.endsWith('/export')),false);
    $('languageToggle').click();
    assert.equal($('setA').textContent,'Đặt A');
    assert.match($('toast').textContent,/Áp dụng/);
    assert.equal($('width').value,'1280');
  } finally {await window.happyDOM.close();}
});

test('saved English preference translates job progress, empty state and every annotated label',async()=>{
  const {window,$}=await setup({job:{status:'running',type:'prepare',phase:'Chuẩn hóa video',progress:65}},{language:'en'});
  try {
    assert.equal($('jobPhase').textContent,'Normalizing video');
    assert.equal($('jobProgress').value,65);
    assert.equal($('languageToggle').textContent,'Tiếng Việt');
    assert.equal($('newProject').textContent,'＋ Upload video / USM');
    assert.equal($('setA').disabled,true);
    for (const element of window.document.querySelectorAll('*')) for (const attr of element.attributes) {
      if (attr.name.startsWith('data-i18n') && attr.value) assert.ok(window.USMI18n.has(attr.value),`Missing English: ${attr.value}`);
    }
    $('languageToggle').click(); assert.equal($('jobPhase').textContent,'Chuẩn hóa video');
  } finally {await window.happyDOM.close();}
  const empty=await setup({}, {language:'en',restore:false});
  try {
    assert.equal(empty.$('projectTitle').textContent,'Video ↔ USM.');
    assert.equal(empty.$('emptyState').hidden,false);
    assert.equal(empty.$('setB').disabled,true);
  } finally {await empty.window.happyDOM.close();}
});

test('English upload errors and confirmation prompts are translated',async()=>{
  const {window,$,flush}=await setup({}, {language:'en'});
  try {
    let xhr, prompt;
    window.XMLHttpRequest=class { constructor(){xhr=this;this.upload={};} open(){} setRequestHeader(){} send(){} };
    Object.defineProperty($('fileInput'),'files',{value:[{name:'sample.webm',size:1000}]});
    $('fileInput').dispatchEvent(new window.Event('change')); await flush();
    assert.equal($('jobPhase').textContent,'Uploading video');
    xhr.onerror(); await flush();
    assert.equal($('jobPhase').textContent,'Upload failed');
    assert.match($('jobError').textContent,/Check your connection/);
    window.confirm=message=>{prompt=message;return false;};
    $('deleteProject').click(); await flush();
    assert.match(prompt,/Delete this project/);
  } finally {await window.happyDOM.close();}
});

test('seam preview disables Set controls until returning to source timeline',async()=>{
  const {window,$,p,flush}=await setup();
  try {
    p.job={status:'done',type:'seam',progress:100};
    p.seam={build:p.build,url:`/api/projects/${p.id}/media/seam-15-195.mp4`};
    $('seamPlay').click(); await flush();
    assert.equal($('setA').disabled,true); assert.equal($('setB').disabled,true);
    $('goToA').click(); await flush();
    assert.equal($('setA').disabled,false);
    assert.equal($('scrub').value,'15');
  } finally {await window.happyDOM.close();}
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}

test('Project menu closes on outside click without blocking the clicked control',async()=>{
  const {window,$}=await setup();
  try {
    const menu=window.document.querySelector('.project-menu'); menu.open=true;
    $('languageToggle').click();
    assert.equal(menu.open,false);
    assert.equal(window.document.documentElement.lang,'en');
    menu.open=true;
    $('projectTitle').addEventListener('click',event=>event.stopPropagation());
    $('projectTitle').click(); assert.equal(menu.open,false);
  } finally {await window.happyDOM.close();}
});

test('Project menu stays open on internal whitespace and closes when choosing an action',async()=>{
  const {window,$}=await setup();
  try {
    const menu=window.document.querySelector('.project-menu'); menu.open=true;
    window.document.querySelector('.project-menu-items').click(); assert.equal(menu.open,true);
    let opened=false; $('projectInput').click=()=>{opened=true;};
    $('importProject').click(); assert.equal(menu.open,false); assert.equal(opened,true);
  } finally {await window.happyDOM.close();}
});

test('Escape dismisses Project menu and returns focus to its toggle',async()=>{
  const {window}=await setup();
  try {
    const menu=window.document.querySelector('.project-menu'); menu.open=true;
    window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(menu.open,false);
    assert.equal(window.document.activeElement,menu.querySelector('summary'));
  } finally {await window.happyDOM.close();}
});
function pendingFrames(window) {
  const requests=[], original=window.fetch;
  window.fetch=(url,options)=>{
    if (!url.includes('/frame?')) return original(url,options);
    const pending=deferred(); requests.push({...pending,url,options}); return pending.promise;
  };
  return requests;
}
const frameResponse=window=>({ok:true,blob:async()=>new window.Blob(['frame'])});
const debounceWait=()=>new Promise(resolve=>setTimeout(resolve,220));

test('reverse conversion is only offered for detected USM, not filename extensions', async () => {
  const ordinary = await setup({name:'fake.usm'});
  try { assert.equal(ordinary.$('usmConversion').hidden, true); assert.equal(ordinary.$('convert').disabled, true); }
  finally { await ordinary.window.happyDOM.close(); }
  const {window,$} = await setup({meta:{format:'usm',width:320,height:180,codec:'mpeg1video',size:10000,audio:false}});
  try {
    assert.equal($('usmConversion').hidden, false); assert.equal($('convert').disabled, false);
    assert.equal($('convertAudio').disabled, true); assert.equal($('convertAudio').checked, false);
    $('languageToggle').click(); assert.equal($('convert').textContent, '↗ Convert USM to video');
  } finally { await window.happyDOM.close(); }
});

test('conversion uses separate options and preserves unsaved A/B and USM settings', async () => {
  const {window,$,p,calls,flush} = await setup({meta:{format:'usm',width:320,height:180,codec:'mpeg1video',size:10000,audio:true}});
  try {
    $('width').value='640'; $('markerA').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight'}));
    $('convertFormat').value='avi'; $('convertExtract').checked=false;
    p.job={status:'running',type:'convert',phase:'Tách luồng và chuyển USM sang video',progress:10};
    $('convert').click(); await flush();
    const sent=calls.find(c=>c.url.endsWith('/convert'));
    assert.deepEqual(JSON.parse(sent.options.body), {format:'avi',audio:true,extract:false});
    assert.equal($('width').value,'640'); assert.equal($('markerA').getAttribute('aria-valuenow'),'16');
    assert.match($('cueSaveState').textContent,/chưa lưu/);
    for (const id of ['convert','convertFormat','convertAudio','convertExtract','export','deleteProject']) assert.equal($(id).disabled,true);
  } finally { await window.happyDOM.close(); }
});

test('completed conversion displays only generated downloads and survives project selection', async () => {
  const result={id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',format:'mp4',files:['video.mp4','video.m1v','verification.json'],size:20000,width:320,height:180,frames:25};
  const {window,$,p,flush}=await setup({meta:{format:'usm',width:320,height:180,codec:'mpeg1video',size:10000,audio:false},conversions:[result]}, {language:'en'});
  try {
    assert.equal($('conversionDownloads').hidden,false); assert.equal($('downloads').hidden,true);
    const links=[...$('conversionLinks').querySelectorAll('a')];
    assert.equal(links.length,3); assert.ok(links[0].href.endsWith(`/conversions/${result.id}/video.mp4`));
    assert.match($('conversionInfo').textContent,/320 × 180 · 25 frames/);
    p.job={status:'done',type:'convert',progress:100}; $('convert').click(); await flush();
    assert.equal($('conversionDownloads').open,true); assert.equal($('toast').textContent,'Your video is ready to download.');
  } finally { await window.happyDOM.close(); }
});

test('conversion remains usable after preview failure without requiring a master', async () => {
  const {window,$}=await setup({build:null,settings:null,duration:0,totalFrames:0,meta:{format:'usm',width:320,height:180,codec:'mpeg1video',size:10000,audio:true},job:{status:'failed',type:'prepare',progress:0,error:'preview failed'}});
  try { assert.equal($('convert').disabled,false,$('toast').textContent); assert.equal($('export').disabled,true); assert.equal($('convertAudio').checked,true); }
  finally { await window.happyDOM.close(); }
});

test('scrubbing shows loading immediately and waits for image decoding, with live translation',async()=>{
  const {window,$,flush}=await setup();
  const requests=pendingFrames(window), decoded=deferred();
  window.HTMLImageElement.prototype.decode=()=>decoded.promise;
  try {
    assert.equal($('frameLoading').hidden,true);
    $('scrub').value='90'; $('scrub').dispatchEvent(new window.Event('input'));
    assert.equal($('frameLoading').hidden,false);
    assert.equal($('video').parentElement.getAttribute('aria-busy'),'true');
    assert.equal(requests.length,0,'feedback must precede debounce');
    $('languageToggle').click(); assert.match($('frameLoading').textContent,/Loading frame/);
    await debounceWait(); assert.equal(requests.length,1);
    requests[0].resolve(frameResponse(window)); await flush();
    assert.equal($('frameLoading').hidden,false,'download alone is not ready');
    assert.equal($('frameImage').hidden,true);
    decoded.resolve(); await flush();
    assert.equal($('frameLoading').hidden,true);
    assert.equal($('frameImage').hidden,false);
    assert.equal($('video').parentElement.getAttribute('aria-busy'),'false');
    assert.equal($('scrub').value,'90');
  } finally {decoded.resolve();await window.happyDOM.close();}
});

test('new scrub invalidates old response before debounce without hiding the new loader',async()=>{
  const {window,$,flush}=await setup();
  const requests=pendingFrames(window);
  try {
    $('goToA').click(); await flush();
    assert.equal(requests.length,1); assert.equal($('frameLoading').hidden,false);
    $('scrub').value='100'; $('scrub').dispatchEvent(new window.Event('input'));
    assert.equal(requests[0].options.signal.aborted,true);
    requests[0].reject(new Error('obsolete failure')); await flush();
    assert.equal($('frameLoading').hidden,false);
    assert.equal($('toast').hidden,true);
    await debounceWait(); assert.equal(requests.length,2);
    requests[1].resolve(frameResponse(window)); await flush();
    assert.equal($('frameLoading').hidden,true); assert.equal($('scrub').value,'100');
  } finally {await window.happyDOM.close();}
});

test('slow obsolete image decode cannot replace the latest frame or hide its loading state',async()=>{
  const {window,$,flush}=await setup();
  const requests=pendingFrames(window), decoded=deferred(), revoked=[];
  let next=0;
  window.URL.createObjectURL=()=>`blob:frame-${++next}`;
  window.URL.revokeObjectURL=url=>revoked.push(url);
  window.HTMLImageElement.prototype.decode=function(){return this.src.endsWith('frame-1') ? decoded.promise : Promise.resolve();};
  try {
    $('goToA').click(); await flush(); requests[0].resolve(frameResponse(window)); await flush();
    $('goToB').click(); await flush();
    requests[1].resolve(frameResponse(window)); await flush();
    assert.equal($('frameImage').src,'blob:frame-2'); assert.equal($('frameLoading').hidden,true);
    decoded.resolve(); await flush();
    assert.equal($('frameImage').src,'blob:frame-2');
    assert.deepEqual(revoked,['blob:frame-1']);
  } finally {decoded.resolve();await window.happyDOM.close();}
});

test('frame network and decode failures clear loading and show a translated error',async()=>{
  const {window,$,flush}=await setup({}, {language:'en'});
  const requests=pendingFrames(window);
  try {
    $('nextFrame').click(); await flush(); requests[0].reject(new Error('network failed')); await flush();
    assert.equal($('frameLoading').hidden,true); assert.match($('toast').textContent,/Could not load the frame/);
    window.HTMLImageElement.prototype.decode=async()=>{throw new Error('bad JPEG');};
    $('prevFrame').click(); await flush(); requests[1].resolve(frameResponse(window)); await flush();
    assert.equal($('frameLoading').hidden,true);
    assert.equal($('video').parentElement.getAttribute('aria-busy'),'false');
    assert.equal($('frameImage').hidden,true);
  } finally {await window.happyDOM.close();}
});

test('play cancels pending debounce and discards already requested frames',async()=>{
  const {window,$,flush}=await setup();
  const requests=pendingFrames(window);
  try {
    $('scrub').value='50'; $('scrub').dispatchEvent(new window.Event('input'));
    $('play').click(); await flush(); await debounceWait();
    assert.equal(requests.length,0); assert.equal($('frameLoading').hidden,true);
    $('goToA').click(); await flush();
    $('normalPlay').click(); await flush();
    assert.equal(requests[0].options.signal.aborted,true);
    requests[0].resolve(frameResponse(window)); await flush();
    assert.equal($('frameLoading').hidden,true); assert.equal($('frameImage').hidden,true);
  } finally {await window.happyDOM.close();}
});

test('switching project clears loader and prevents old frames appearing',async()=>{
  const {window,$,flush}=await setup();
  const requests=pendingFrames(window);
  try {
    $('goToB').click(); await flush();
    window.document.querySelector('.project-item').click(); await flush();
    assert.equal(requests[0].options.signal.aborted,true);
    assert.equal($('frameLoading').hidden,true);
    requests[0].resolve(frameResponse(window)); await flush();
    assert.equal($('frameImage').hidden,true); assert.equal($('scrub').value,'0');
  } finally {await window.happyDOM.close();}
});
