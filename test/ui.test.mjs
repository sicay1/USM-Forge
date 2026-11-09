import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

// DOM-level tests only; these do not launch or automate a browser.
async function setup() {
  const window = new Window({ url: 'http://localhost:3210', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  window.document.write(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'));
  const p = { id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name:'<video>.webm',build:'build-test',duration:8,totalFrames:240,meta:{width:1920,height:1080,codec:'vp9',size:668766,audio:false},settings:{width:1920,height:1080,fps:30,bitrate:6000000,audio:false},cues:[{name:'start',id:0,frame:0},{name:'loop_point',id:1,frame:15},{name:'loop_start',id:2,frame:195},{name:'end',id:0,frame:240}],loop:{a:15,b:195},exports:[],job:{status:'done',type:'prepare',progress:100}};
  const calls=[];
  window.localStorage.setItem('usm-project',p.id);
  window.structuredClone=structuredClone;
  window.fetch=async (url, options={}) => {
    calls.push({url,options});
    let result;
    if (url === '/api/health') result={encoder:true,maxUploadMB:512};
    else if (url === '/api/projects') result=[p];
    else if (options.method === 'PUT') {const b=JSON.parse(options.body);p.cues=b.cues;p.loop=b.loop;result=p;}
    else result=p;
    return {ok:true,json:async()=>structuredClone(result)};
  };
  window.HTMLMediaElement.prototype.pause=function(){this.dispatchEvent(new window.Event('pause'));};
  window.HTMLMediaElement.prototype.play=async function(){this.dispatchEvent(new window.Event('play'));};
  window.HTMLMediaElement.prototype.load=function(){};
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
    assert.equal($('cueRows').children.length,4);
    assert.equal($('loopA').value,'15'); assert.equal($('loopB').value,'195');
    assert.equal($('export').disabled,false); assert.equal($('audio').disabled,true);
    assert.equal($('scrub').max,'239');
  } finally {await window.happyDOM.close();}
});
test('add cue and save sends edited cue list and loop boundaries',async()=>{
  const {window,$,calls,flush}=await setup();
  try {
    $('addCue').click(); assert.equal($('cueRows').children.length,5);
    assert.match($('cueSaveState').textContent,/chưa lưu/);
    $('saveCues').click(); await flush();
    const sent=calls.find(c=>c.options.method==='PUT'); assert.ok(sent);
    const payload=JSON.parse(sent.options.body);
    assert.equal(payload.cues.length,5); assert.deepEqual(payload.loop,{a:15,b:195});
    assert.equal($('cueSaveState').textContent,'Đã lưu');
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
