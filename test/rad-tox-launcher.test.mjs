import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=(await readFile(new URL('../public/js/rad-tox-launcher.js',import.meta.url),'utf8')).replace(/^import .*game-audio-activation\.js';\n/m,'').replace('import(enginePath)','loadEngine(enginePath)');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let n=0;n<5;n++)await Promise.resolve();};
function fixture(query='?environment=world-item-factory&mode=multiplayer&house=world-item-factory#yard'){
 const listeners=new Map(),clicks=[],timers=new Map(),scheduled=[],imports=[],navigations=[],requests=[];
 let timerId=0;const activations=[];
 const button={disabled:false,textContent:'Begin',addEventListener:(name,handler)=>clicks.push(handler)},status={textContent:''},classes=new Set(),overlay={classList:{add:value=>classes.add(value),remove:value=>classes.delete(value)}};
 const document={body:{dataset:{}},querySelector:()=>button,getElementById:id=>id==='house-game-start'?overlay:status,addEventListener:(name,handler)=>{const group=listeners.get(name)||[];group.push(handler);listeners.set(name,group);},dispatchEvent:event=>{if(event.type==='muzikaz:rad-tox-request')requests.push(event);for(const callback of listeners.get(event.type)||[])callback(event);}};
 const location=new URL('https://muzikaz.com/model-explorer.html'+query);location.replace=value=>navigations.push(value);
 const context={activateGameAudio(){activations.push(imports.length);},mountGameAudioActivation(){},document,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},URL,URLSearchParams,Date,encodeURIComponent,Boolean,window:{location,setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,callback);scheduled.push({id,callback,delay});return id;},clearTimeout:id=>timers.delete(id)},loadEngine:path=>{const task=deferred();imports.push({path,...task});return task.promise;}};
 vm.runInNewContext(source,context);
 return {activations,button,status,classes,imports,navigations,requests,timers,scheduled,document,click:()=>clicks[0]({preventDefault(){}}),emit:(type,detail)=>document.dispatchEvent({type,detail})};
}

test('the initial start remains lazy, and a failed module gets a clean explicit retry preserving the selected game',async()=>{
 const f=fixture();assert.equal(f.imports.length,0);f.click();assert.deepEqual(f.activations,[0],'the first Begin gesture activates audio before loading the heavy engine');assert.equal(f.imports.length,1);assert.equal(f.scheduled[0].delay,30000);
 f.imports[0].reject(Error('Dependency failed'));await flush();assert.match(f.status.textContent,/Dependency failed/);assert.equal(f.button.textContent,'Try again');assert.equal(f.timers.size,0);assert.deepEqual(f.navigations,[]);
 f.click();assert.equal(f.navigations.length,1);assert.equal(f.imports.length,1,'never evaluate a second half-mounted engine in this document');
 const target=new URL(f.navigations[0]);assert.equal(target.pathname,'/model-explorer.html');assert.equal(target.searchParams.get('environment'),'world-item-factory');assert.equal(target.searchParams.get('house'),'world-item-factory');assert.equal(target.searchParams.get('mode'),'multiplayer');assert.equal(target.searchParams.get('autoplay'),'1');assert.ok(target.searchParams.get('gameRecovery'));assert.equal(target.hash,'#yard');
 f.click();assert.equal(f.navigations.length,1,'a restarting document cannot issue duplicate navigation');
});

test('an already-loaded engine retries native initialization in place and ignores its obsolete import rejection',async()=>{
 const f=fixture();f.click();f.emit('muzikaz:rad-tox-engine-ready');assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);
 f.emit('muzikaz:rad-tox-native-error',{message:'Map entry temporarily unavailable'});assert.equal(f.button.textContent,'Try again');assert.match(f.status.textContent,/Map entry temporarily unavailable/);
 f.click();assert.equal(f.requests.length,2);assert.equal(f.imports.length,1);assert.equal(f.navigations.length,0);
 f.emit('muzikaz:gameplay-ready');const status=f.status.textContent;f.imports[0].reject(Error('Obsolete import failure'));await flush();assert.equal(f.status.textContent,status);assert.equal(f.document.body.dataset.gameControls,'ready');
 f.scheduled[0].callback();assert.equal(f.status.textContent,status,'an expired old stall callback cannot cover gameplay');
});

test('a root evaluation failure after engine-ready still requires a fresh document unless gameplay has already succeeded',async()=>{
 const f=fixture();f.click();f.emit('muzikaz:rad-tox-engine-ready');f.imports[0].reject(Error('Partial engine evaluation'));await flush();assert.match(f.status.textContent,/Partial engine evaluation/);
 f.emit('muzikaz:rad-tox-native-error',{message:'Incomplete world'});f.click();assert.equal(f.navigations.length,1,'later native failure cannot erase a known rejected evaluation');assert.equal(f.imports.length,1);
});

test('recovery autoplay is a single attempt and a repeated failure waits for another user action',async()=>{
 const f=fixture('?environment=custom-map&mode=solo&builder=retained&autoplay=1&gameRecovery=previous#spawn');assert.equal(f.imports.length,1);assert.match(f.imports[0].path,/v=fresh-map-room-20261028/);assert.match(f.imports[0].path,/recovery=previous/);
 f.imports[0].reject(Error('Still unavailable'));await flush();assert.equal(f.navigations.length,0);assert.equal(f.button.disabled,false);f.click();const target=new URL(f.navigations[0]);assert.equal(target.searchParams.get('builder'),'retained');assert.equal(target.searchParams.get('mode'),'solo');assert.notEqual(target.searchParams.get('gameRecovery'),'previous');assert.equal(target.hash,'#spawn');
});
