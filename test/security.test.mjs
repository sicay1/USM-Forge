import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentType } from '../lib/http-security.mjs';

test('content types allow parameters but reject nonstandard type suffixes',()=>{
  assert.equal(contentType({headers:{'content-type':'Application/JSON; charset=utf-8'}}),'application/json');
  assert.equal(contentType({headers:{'content-type':'application/json-other'}}),'application/json-other');
});

test('HTTP security boundary, downloads and JSON validation against an isolated server',async t=>{
  const root=fileURLToPath(new URL('..',import.meta.url)), data=await mkdtemp(path.join(tmpdir(),'usm-security-'));
  const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', conversion='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const dir=path.join(data,id), output=path.join(dir,'conversions',conversion);
  const project={id,name:'security fixture',created:new Date().toISOString(),updated:new Date().toISOString(),build:'build-fixture',totalFrames:10,duration:1,
    settings:{width:320,height:180,fps:30,bitrate:6000000,audio:false},meta:{format:'usm',audio:false},
    cues:[{name:'A',id:1,frame:0},{name:'B',id:2,frame:10}],exports:[],conversions:[{id:conversion,files:['video.mp4']}]};
  await mkdir(output,{recursive:true});await writeFile(path.join(dir,'project.json'),JSON.stringify(project));
  await writeFile(path.join(dir,'source'),'private-upload-fixture');await writeFile(path.join(output,'video.mp4'),Buffer.alloc(1024,42));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,DATA_DIR:data,PORT:'0',HOST:'127.0.0.1',ALLOWED_HOSTS:'localhost,127.0.0.1,[::1]',USM_BACKEND:'medianoche'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const closed=once(child,'exit');let logs='';child.stderr.on('data',bytes=>logs+=bytes);
  t.after(async()=>{child.kill();await closed;await rm(data,{recursive:true,force:true});});
  const port=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error(`Server start timeout: ${logs}`)),10000);
    child.on('error',error=>{clearTimeout(timeout);reject(error);});
    child.stdout.on('data',bytes=>{logs+=bytes;const match=/http:\/\/127\.0\.0\.1:(\d+)/.exec(logs);if(match){clearTimeout(timeout);resolve(Number(match[1]));}});
  });
  const request=(route,headers={},method='GET',body='')=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:route,method,headers},res=>{
      let text='';res.on('data',data=>text+=data);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));
    });req.on('error',error=>reject(new Error(`${method} ${route}: ${error.message}`)));req.end(body);
  });
  const prefix=`/api/projects/${id}`, converted=`${prefix}/conversions/${conversion}`;
  assert.equal((await request('/api/projects')).status,200);
  for(const method of ['GET','HEAD','POST','DELETE']) assert.equal((await request('/api/projects',{Host:'attacker.example',Origin:'http://attacker.example'},method)).status,403);
  assert.equal((await request('/api/projects',{Origin:'null'})).status,403);
  assert.equal((await request(converted+'/video.mp4',{'Sec-Fetch-Site':'cross-site'})).status,403);
  const same=await request(prefix,{Origin:`http://127.0.0.1:${port}`});assert.equal(same.status,200);
  assert.equal(same.headers['cross-origin-resource-policy'],'same-origin');assert.equal(same.headers['x-content-type-options'],'nosniff');
  for(const route of ['/server.mjs','/.env','/.git/config',prefix+'/source',converted+'/convert.log',converted+'/audio.wav',converted+'/%2e%2e%2fsource',converted+'/..%5c..%5csource']) {
    const denied=await request(route);assert.equal(denied.status,404,route);assert.ok(!denied.text.includes('private-upload-fixture'));
  }
  for(const value of ['null','[]','"text"','123','{']) assert.equal((await request(prefix+'/convert',{'Content-Type':'application/json'},'POST',value)).status,400);
  assert.equal((await request(prefix+'/convert',{'Content-Type':'application/json-extra'},'POST','{}')).status,415);
  assert.equal((await request('/api/projects',{'Content-Type':'text/plain'},'POST','x')).status,415);
  assert.equal((await request('/api/projects',{'Content-Type':'application/octet-stream','Content-Length':String(513*1024*1024)},'POST')).status,413);
  const range=await request(converted+'/video.mp4',{Range:'bytes=0-99'});assert.equal(range.status,206);assert.equal(range.text.length,100);
  for(const range of ['bytes=999999999999999999999-','bytes=10-5','bytes=0-1,4-5','bytes=-0','bytes=-']) assert.equal((await request(converted+'/video.mp4',{Range:range})).status,416);
  assert.equal((await request(converted+'/video.mp4',{},'HEAD')).status,200);
  // Import cannot override internal paths or identifiers, even with valid editable settings.
  const restored=await request(prefix+'/restore',{'Content-Type':'application/json'},'POST',JSON.stringify({...project,schema:'usm-studio/v1',id:'../../outside',build:'../../outside'}));
  assert.equal(restored.status,200);assert.equal(JSON.parse(restored.text).id,id);assert.equal(JSON.parse(restored.text).build,'build-fixture');
  assert.equal(await readFile(path.join(dir,'source'),'utf8'),'private-upload-fixture');
});
