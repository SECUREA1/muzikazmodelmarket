(function(){
  const DB='voice3-audio-library-v1', STORE='items', PROJECTS='projects', QUEST='questEvents', TOKENS='tokenLedger';
  const CATS=['all','voice','upload','bass','beat','loop','effect','nft','mix'];
  const AUDIO_TYPES=['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/webm'];
  const wallet=()=>localStorage.getItem('voice3.wallet')||'local-dev-wallet';
  let dbp;
  function openDb(){ if(dbp) return dbp; dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const db=r.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'id'}); if(!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS,{keyPath:'id'}); if(!db.objectStoreNames.contains(QUEST)) db.createObjectStore(QUEST,{keyPath:'id'}); if(!db.objectStoreNames.contains(TOKENS)) db.createObjectStore(TOKENS,{keyPath:'id'});}; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);}); return dbp; }
  async function tx(store,mode,fn){const db=await openDb();return new Promise((res,rej)=>{const t=db.transaction(store,mode);const s=t.objectStore(store);let out;try{out=fn(s);}catch(e){rej(e)}t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);});}
  const uid=(p='id')=>`${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  function req(r){return new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function all(store=STORE){return tx(store,'readonly',s=>req(s.getAll()));}
  async function put(item,store=STORE){await tx(store,'readwrite',s=>s.put(item));return item;}
  async function del(id,store=STORE){return tx(store,'readwrite',s=>s.delete(id));}
  async function get(id,store=STORE){return tx(store,'readonly',s=>req(s.get(id)));}
  function sanitizeName(name){return String(name||'Untitled audio').replace(/[<>:"/\\|?*\u0000-\u001F]/g,'').trim().slice(0,96)||'Untitled audio';}
  async function decode(blob){const ctx=new (window.AudioContext||window.webkitAudioContext)();try{return await ctx.decodeAudioData(await blob.arrayBuffer());}finally{ctx.close?.();}}
  function waveform(buffer, points=96){const ch=buffer.getChannelData(0); const step=Math.max(1,Math.floor(ch.length/points)); const data=[]; for(let i=0;i<points;i++){let sum=0; for(let j=0;j<step && i*step+j<ch.length;j++) sum+=Math.abs(ch[i*step+j]); data.push(Math.min(1,Math.round(sum/step*1000)/1000));} return data;}
  function makeToneBlob(freq=110, seconds=1, type='sine'){const sr=44100, len=sr*seconds, buf=new Float32Array(len); for(let i=0;i<len;i++){const t=i/sr; const env=Math.min(1,i/600)*(1-Math.max(0,(i-len+2000)/2000)); let v=Math.sin(2*Math.PI*freq*t); if(type==='square') v=Math.sign(v); if(type==='saw') v=2*(t*freq-Math.floor(.5+t*freq)); buf[i]=v*.35*env;} return wavBlob([buf],sr);}
  function wavBlob(channels,sr=44100){const samples=channels[0].length, bytes=44+samples*2; const b=new ArrayBuffer(bytes), v=new DataView(b); const ws=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0))); ws(0,'RIFF');v.setUint32(4,36+samples*2,true);ws(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,samples*2,true);let o=44; for(let i=0;i<samples;i++,o+=2)v.setInt16(o,Math.max(-1,Math.min(1,channels[0][i]))*32767,true); return new Blob([b],{type:'audio/wav'});}
  async function itemFromBlob(blob, meta={}){ if(!blob?.type?.startsWith('audio/') && !AUDIO_TYPES.includes(blob?.type)) throw Error('Unsupported or damaged audio file.'); const buffer=await decode(blob); const item={id:meta.id||uid('audio'), userId:wallet(), displayName:sanitizeName(meta.displayName||meta.originalFilename||'Audio clip'), originalFilename:meta.originalFilename||'', sourceType:meta.sourceType||'upload', mimeType:blob.type||'audio/wav', duration:buffer.duration, fileSize:blob.size, waveformData:waveform(buffer), blob, createdAt:new Date().toISOString(), trimStart:0, trimEnd:buffer.duration, bpm:meta.bpm||null, key:meta.key||'', tags:meta.tags||[], category:meta.category||'upload', nftMetadata:meta.nftMetadata||null, effectSettings:meta.effectSettings||{}}; await put(item); URL.revokeObjectURL(meta.oldUrl||''); dispatch('audio-library-changed',item); return item;}
  function url(item){return item.blob?URL.createObjectURL(item.blob):item.audioUrl;}
  function dispatch(type,detail={}){const event={id:uid('evt'),type,walletId:wallet(),detail,createdAt:new Date().toISOString()}; window.dispatchEvent(new CustomEvent(`voice3:${type}`,{detail:event})); put(event,QUEST).catch(()=>{}); return event;}
  async function ledger(){return all(TOKENS)}
  async function addTokens(amount,reason,questId){return put({id:uid('tok'),walletId:wallet(),amount,reason,questId,createdAt:new Date().toISOString()},TOKENS)}
  async function balance(){return (await ledger()).filter(x=>x.walletId===wallet()).reduce((a,x)=>a+Number(x.amount||0),0)}
  window.Voice3Audio={CATS,AUDIO_TYPES,openDb,all,put,get,del,itemFromBlob,url,dispatch,wallet,uid,sanitizeName,makeToneBlob,wavBlob,ledger,addTokens,balance,PROJECTS,STORE,QUEST,TOKENS};
})();
