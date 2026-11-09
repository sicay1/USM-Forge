// CRI USM chunk / @UTF metadata support used to add cue points to native mux output.
// Layout references: CriCodecs USM/UTF sources and Medianoche-generated fixtures.
// This module never changes compressed video/audio payloads.
import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ensure } from './model.mjs';

const sizes = { 0:1, 1:1, 2:2, 3:2, 4:4, 5:4, 6:8, 7:8, 8:4, 9:8, 10:4, 11:8 };
const align = (n, step = 8) => Math.ceil(n / step) * step;
const CUE_ID = 0x40435545;

export function readUtf(buffer) {
  ensure(buffer.length >= 32 && buffer.toString('ascii', 0, 4) === '@UTF', 'Bảng UTF không hợp lệ.', 500);
  const end = buffer.readUInt32BE(4) + 8;
  const rowsAt = buffer.readUInt32BE(8) + 8, stringsAt = buffer.readUInt32BE(12) + 8, dataAt = buffer.readUInt32BE(16) + 8;
  const count = buffer.readUInt32BE(28), rowSize = buffer.readUInt16BE(26), colCount = buffer.readUInt16BE(24);
  ensure(end <= buffer.length && rowsAt >= 32 && stringsAt >= rowsAt + count * rowSize && dataAt >= stringsAt && dataAt <= end, 'Offset UTF không hợp lệ.', 500);
  const string = offset => {
    const at = stringsAt + offset, stop = buffer.indexOf(0, at);
    ensure(at >= stringsAt && at < dataAt && stop >= at && stop < dataAt, 'Chuỗi UTF không hợp lệ.', 500);
    return buffer.toString('utf8', at, stop);
  };
  function value(type, at) {
    ensure(sizes[type] && at + sizes[type] <= end, 'Kiểu dữ liệu UTF không hợp lệ.', 500);
    switch(type) {
      case 0:return buffer.readUInt8(at); case 1:return buffer.readInt8(at);
      case 2:return buffer.readUInt16BE(at); case 3:return buffer.readInt16BE(at);
      case 4:return buffer.readUInt32BE(at); case 5:return buffer.readInt32BE(at);
      case 6:{ const n = buffer.readBigUInt64BE(at); ensure(n <= BigInt(Number.MAX_SAFE_INTEGER), 'Giá trị UTF quá lớn.', 500); return Number(n); }
      case 7:{ const n = buffer.readBigInt64BE(at); ensure(n <= BigInt(Number.MAX_SAFE_INTEGER) && n >= BigInt(Number.MIN_SAFE_INTEGER), 'Giá trị UTF quá lớn.', 500); return Number(n); }
      case 8:return buffer.readFloatBE(at); case 9:return buffer.readDoubleBE(at);
      case 10:return string(buffer.readUInt32BE(at));
      case 11:{ const atData = dataAt + buffer.readUInt32BE(at), length = buffer.readUInt32BE(at + 4); ensure(atData + length <= end, 'Blob UTF ngoài bảng.', 500); return buffer.subarray(atData, atData + length); }
    }
  }
  let at = 32; const columns = [];
  for (let i=0; i<colCount; i++) {
    ensure(at + 5 <= rowsAt, 'Schema UTF bị cắt.', 500);
    const flag = buffer[at++], type = flag & 15, storage = flag & 0xf0, name = string(buffer.readUInt32BE(at)); at += 4;
    ensure(sizes[type] && [0x10, 0x30, 0x50].includes(storage), 'Schema UTF không hỗ trợ.', 500);
    const c = { name, type, storage };
    if (storage === 0x30) { c.constant = value(type, at); at += sizes[type]; }
    columns.push(c);
  }
  ensure(at <= rowsAt, 'Schema UTF chồng dữ liệu.', 500);
  const rows = [], cells = [];
  for (let i=0; i<count; i++) {
    at = rowsAt + i * rowSize; const row = {}, offsets = {};
    for (const c of columns) {
      if (c.storage === 0x50) { row[c.name] = value(c.type, at); offsets[c.name] = at; at += sizes[c.type]; }
      else row[c.name] = c.storage === 0x30 ? c.constant : c.type === 11 ? Buffer.alloc(0) : c.type === 10 ? '' : 0;
    }
    ensure(at === rowsAt + (i+1)*rowSize, 'Kích thước row UTF không khớp.', 500);
    rows.push(row); cells.push(offsets);
  }
  return { name:string(buffer.readUInt32BE(20)), columns, rows, cells };
}

export function writeUtf(name, columns, rows) {
  const strings = [Buffer.from('<NULL>\0')], offsets = new Map([['<NULL>',0]]); let stringBytes = 7;
  const blobs = []; let dataBytes = 0;
  const string = text => {
    text = String(text); if (offsets.has(text)) return offsets.get(text);
    const offset = stringBytes, b = Buffer.from(text + '\0'); strings.push(b); stringBytes += b.length; offsets.set(text, offset); return offset;
  };
  const tableName = string(name);
  const cols = columns.map(c => ({ ...c, storage:c.storage ?? 0x50, key:string(c.name) }));
  function value(type, v) {
    const b = Buffer.alloc(sizes[type]);
    switch(type) {
      case 0:b.writeUInt8(v);break; case 1:b.writeInt8(v);break;
      case 2:b.writeUInt16BE(v);break; case 3:b.writeInt16BE(v);break;
      case 4:b.writeUInt32BE(v);break; case 5:b.writeInt32BE(v);break;
      case 6:b.writeBigUInt64BE(BigInt(v));break; case 7:b.writeBigInt64BE(BigInt(v));break;
      case 8:b.writeFloatBE(v);break; case 9:b.writeDoubleBE(v);break;
      case 10:b.writeUInt32BE(string(v));break;
      case 11:{ ensure(Buffer.isBuffer(v), 'Blob UTF cần dữ liệu bytes.', 500); const padded = Buffer.alloc(align(v.length)); v.copy(padded); b.writeUInt32BE(dataBytes); b.writeUInt32BE(v.length,4); blobs.push(padded); dataBytes += padded.length; break; }
    }
    return b;
  }
  const schema = cols.map(c => { const h = Buffer.alloc(5); h[0] = c.storage | c.type; h.writeUInt32BE(c.key,1); return c.storage === 0x30 ? Buffer.concat([h,value(c.type,c.constant)]) : h; });
  const rowBuffers = rows.map(row => Buffer.concat(cols.filter(c => c.storage === 0x50).map(c => value(c.type,row[c.name]))));
  const schemaBuffer = Buffer.concat(schema), rowSize = cols.filter(c => c.storage === 0x50).reduce((n,c) => n + sizes[c.type],0);
  const rowsAt = 32 + schemaBuffer.length, stringsAt = rowsAt + rowSize * rows.length, dataAt = align(stringsAt + stringBytes);
  const b = Buffer.alloc(align(dataAt + dataBytes)); b.write('@UTF'); b.writeUInt32BE(b.length - 8,4);
  b.writeUInt32BE(rowsAt-8,8); b.writeUInt32BE(stringsAt-8,12); b.writeUInt32BE(dataAt-8,16); b.writeUInt32BE(tableName,20);
  b.writeUInt16BE(cols.length,24); b.writeUInt16BE(rowSize,26); b.writeUInt32BE(rows.length,28);
  schemaBuffer.copy(b,32); Buffer.concat(rowBuffers).copy(b,rowsAt); Buffer.concat(strings).copy(b,stringsAt); Buffer.concat(blobs).copy(b,dataAt);
  return b;
}

export function readChunks(buffer) {
  const chunks = []; let at = 0;
  while(at < buffer.length) {
    ensure(at + 32 <= buffer.length, 'Header USM bị cắt.', 500);
    const size = buffer.readUInt32BE(at+4)+8, payloadAt = 8 + buffer.readUInt16BE(at+8), padding = buffer.readUInt16BE(at+10);
    ensure(size >= 32 && payloadAt >= 32 && payloadAt + padding <= size && at + size <= buffer.length, 'Kích thước chunk USM không hợp lệ.', 500);
    chunks.push({ offset:at, size, type:buffer.toString('ascii',at,at+4), channel:buffer[at+12], payloadType:buffer.readUInt16BE(at+14)&3, payloadAt, raw:buffer.subarray(at,at+size), payload:buffer.subarray(at+payloadAt,at+size-padding) });
    at += size;
  }
  return chunks;
}

export function makeChunk(type, payloadType, payload, { size = align(payload.length+32,64), rate=30, channel=0 } = {}) {
  ensure(size >= payload.length+32 && size-payload.length-32 <= 65535, 'Padding USM không hợp lệ.', 500);
  const b = Buffer.alloc(size); b.write(type,0,4,'ascii'); b.writeUInt32BE(size-8,4); b.writeUInt16BE(24,8); b.writeUInt16BE(size-payload.length-32,10);
  b[12] = channel; b.writeUInt16BE(payloadType,14); b.writeUInt32BE(rate,20); payload.copy(b,32);
  return b;
}
const columns32 = names => names.map(name => ({ name,type:4 }));
const endMarker = text => Buffer.from(text.padEnd(15,' ') + '='.repeat(16) + '\0');

export function cueMetadata(cues, fps) {
  const columns = [{name:'name',type:11},{name:'time',type:6},{name:'cue_type',type:5},{name:'parameter',type:11,storage:0x10}];
  return writeUtf('CUEPOINT_INFO', columns, cues.map(c => ({name:Buffer.from(c.name+'\0\0'),time:Math.round(c.frame*1000/fps),cue_type:c.id})));
}

export function embedCues(source, cues, fps) {
  const chunks = readChunks(source);
  ensure(chunks[0]?.type === 'CRID' && chunks[0].size === 2048 && !chunks.some(c => c.type === '@CUE'), 'Cần USM native chưa có cue point.',500);
  const directory = readUtf(chunks[0].payload);
  const start = chunks.findIndex(c => c.payloadType === 0);
  ensure(start > 0, 'Không có dữ liệu media trong USM.',500);
  const mediaStart = chunks[start].offset;
  const head = chunks.slice(1,start), content = chunks.slice(start);
  const headers = head.filter(c => c.payloadType === 1), meta = head.filter(c => c.payloadType === 3);
  for(const c of meta) { const length=c.payload.length; c.raw=Buffer.from(c.raw); c.payload=c.raw.subarray(c.payloadAt,c.payloadAt+length); }
  const headerEnds = head.filter(c => c.payloadType === 2 && c.payload.toString('ascii').startsWith('#HEADER END'));
  const metaEnds = head.filter(c => c.payloadType === 2 && c.payload.toString('ascii').startsWith('#METADATA END'));
  ensure(headers.length+meta.length+headerEnds.length+metaEnds.length === head.length, 'Bố cục USM native không được hỗ trợ.',500);
  const cueChunks = [];
  if(cues.length) {
    const metadata = makeChunk('@CUE',3,cueMetadata(cues,fps));
    // ixsize=0 matches the CUE header in the supplied L2 login.usm.
    const header = makeChunk('@CUE',1,writeUtf('CUEPOINT_HDRINFO',columns32(['time_unit','total_points','metadata_count','metadata_size','content_xsize','ixsize']),[{time_unit:1000,total_points:cues.length,metadata_count:1,metadata_size:metadata.length,content_xsize:0,ixsize:0}]));
    cueChunks.push(header,makeChunk('@CUE',2,endMarker('#HEADER END')),metadata,makeChunk('@CUE',2,endMarker('#METADATA END')));
    directory.rows.push({fmtver:0,filename:'',filesize:0,datasize:0,stmid:CUE_ID,chno:0,minchk:0,minbuf:0,avbps:0});
  }
  const headerParts = [
    ...headers.map(c=>c.raw), ...(cueChunks.length?[cueChunks[0]]:[]),
    ...headerEnds.map(c=>c.raw), ...(cueChunks.length?[cueChunks[1]]:[]),
    ...meta.map(c=>c.raw), ...(cueChunks.length?[cueChunks[2]]:[]),
    ...metaEnds.map(c=>c.raw), ...(cueChunks.length?[cueChunks[3]]:[])
  ];
  const delta = 2048 + headerParts.reduce((n,b)=>n+b.length,0) - mediaStart;
  // Update absolute seek offsets in-place, preserving the upstream table schema and size.
  for(const c of meta) {
    const table=readUtf(c.payload);
    if(table.name === 'VIDEO_SEEKINFO') for(let i=0;i<table.rows.length;i++) {
      const row=table.rows[i], cell=table.cells[i].ofs_byte;
      ensure(Number.isInteger(cell) && content.some(target=>target.offset===row.ofs_byte && target.type===c.type && target.payloadType===0), 'Vị trí seek gốc không trỏ tới video.',500);
      c.payload.writeBigUInt64BE(BigInt(row.ofs_byte+delta),cell);
    }
  }
  directory.rows[0].filesize = source.length + delta;
  directory.rows[0].minbuf += cueChunks.reduce((n,b)=>n+b.length,0);
  directory.rows[0].filename = 'video.usm';
  const crid=makeChunk('CRID',1,writeUtf(directory.name,directory.columns,directory.rows),{size:2048});
  return [crid,...headerParts,...content.map(c=>c.raw)];
}

export function inspectUsm(buffer) {
  const chunks=readChunks(buffer), directory=readUtf(chunks[0].payload);
  ensure(directory.rows[0].filesize === buffer.length, 'Filesize trong USM không khớp.',500);
  const packets=chunks.filter(c=>c.payloadType===0), video=packets.filter(c=>c.type==='@SFV');
  const byOffset=new Map(chunks.map(c=>[c.offset,c]));
  let cueRows=[], cueHeader=null, seekCount=0;
  for(const c of chunks) {
    if(c.payloadType!==1 && c.payloadType!==3) continue;
    const t=readUtf(c.payload);
    if(t.name==='CUEPOINT_HDRINFO') cueHeader=t.rows[0];
    if(t.name==='CUEPOINT_INFO') cueRows=t.rows.map(row=>({name:row.name.toString('utf8').replace(/\0+$/,''),time:row.time,id:row.cue_type}));
    if(t.name==='VIDEO_SEEKINFO') for(const row of t.rows) {
      const target=byOffset.get(row.ofs_byte);
      ensure(target?.type===c.type && target.payloadType===0 && video[row.ofs_frmid]?.offset===row.ofs_byte, 'Bảng seek USM sai vị trí/frame.',500);
      seekCount++;
    }
  }
  if(cueHeader) {
    const metadata=chunks.filter(c=>c.type==='@CUE' && c.payloadType===3);
    ensure(directory.rows.some(r=>r.stmid===CUE_ID) && cueHeader.total_points===cueRows.length && cueHeader.metadata_count===metadata.length && cueHeader.metadata_size===metadata.reduce((n,c)=>n+c.size,0) && cueHeader.time_unit===1000, 'Metadata cue point không khớp.',500);
  }
  const mediaHash=createHash('sha256'); for(const c of packets) mediaHash.update(c.payload);
  return { frames:video.length, cues:cueRows, seekCount, mediaHash:mediaHash.digest('hex'), cueTimeUnit:cueHeader?.time_unit ?? null };
}

export async function finalizeUsm(input, output, cues, fps) {
  const source=await readFile(input);
  const before=inspectUsm(source);
  const parts=embedCues(source,cues,fps);
  const file=await open(output,'wx');
  try { for(const part of parts) { let at=0; while(at<part.length) at += (await file.write(part,at,part.length-at)).bytesWritten; } } finally { await file.close(); }
  const after=inspectUsm(await readFile(output));
  ensure(before.mediaHash===after.mediaHash && before.frames===after.frames && before.seekCount===after.seekCount,'Dữ liệu media bị thay đổi khi thêm cue.',500);
  ensure(JSON.stringify(after.cues)===JSON.stringify(cues.map(c=>({name:c.name,time:Math.round(c.frame*1000/fps),id:c.id}))), 'Cue point nhúng không khớp dự án.',500);
  return after;
}
