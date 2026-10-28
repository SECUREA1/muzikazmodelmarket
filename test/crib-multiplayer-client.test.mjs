import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../public/js/crib-multiplayer.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness({discovery=false}={}) {
  class Target {
    listeners=new Map();
    addEventListener(name,handler){const list=this.listeners.get(name)||[];list.push(handler);this.listeners.set(name,list);}
    fire(name,event={}){return Promise.all((this.listeners.get(name)||[]).map(handler=>handler({type:name,preventDefault(){},stopPropagation(){},...event})));}
    dispatchEvent(event){this.fire(event.type,event).catch(error=>{throw error;});return true;}
  }
  class Node extends Target {
    children=[];dataset={};hidden=false;disabled=false;value='';textContent='';scrollHeight=0;scrollTop=0;clientHeight=0;
    style={setProperty(){},removeProperty(){}};
    classList={values:new Set(),add(...names){names.forEach(name=>this.values.add(name));},remove(...names){names.forEach(name=>this.values.delete(name));},contains(name){return this.values.has(name);},toggle(name,on){const enabled=on??!this.values.has(name);enabled?this.values.add(name):this.values.delete(name);return enabled;}};
    setAttribute(name,value){this[name]=value;}
    removeAttribute(name){delete this[name];}
    querySelector(selector){if(selector==='b')return this.label??=new Node();if(selector==='[data-close-chat]')return this.close??=new Node();if(selector==='[type="submit"]')return this.submit??=new Node();return null;}
    querySelectorAll(){return [];}
    replaceChildren(...nodes){this.children=nodes;}
    append(...nodes){this.children.push(...nodes);}
    focus(){}
    remove(){}
  }
  const ids=['crib-social','crib-chat-toggle','crib-chat-panel','crib-online-count','crib-player-list','crib-chat-messages','crib-chat-form','crib-chat-input','crib-chat-status','crib-reactions','crib-emoji-toggle','crib-mic-toggle','crib-speaker-toggle','crib-tts-toggle','crib-voice-status','crib-room-name','crib-room-count','crib-unread-count'];
  const nodes=new Map(ids.map(id=>[id,new Node()]));nodes.get('crib-chat-panel').hidden=true;
  const document=new Target();document.querySelector=selector=>nodes.get(selector.slice(1))||null;document.createElement=()=>new Node();document.createTextNode=value=>({textContent:value});document.documentElement=new Node();document.currentScript={src:'https://frontend.example/public/js/crib-multiplayer.js'};
  nodes.get('crib-social').parentNode={insertBefore(){}};
  const values=new Map([['muzikazHouseSessionId','client-session'],['muzikazBottleMemberEmail','member@example.test'],['muzikazDesignatedAvatar','{"modelUrl":"/models/avatar.glb"}']]);
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  const snapshot={roomId:'world-a',serverHostedRoom:false,serverReady:false,gameplayStarted:false,worldLoading:false};
  const window=new Target();window.MUZIKAZ_HOUSE_TRACKING={roomId:'world-a'};window.MUZIKAZ_DESIGNATED_AVATAR={modelUrl:'/models/avatar.glb'};window.MuzikazHouseExplorer={snapshot:()=>snapshot};window.scrollTo=()=>{};
  const requests=[],streams=[],intervals=new Map(),discovered=deferred();let nextTimer=0,base='https://frontend.example',fetcher;
  const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
  fetcher=async(path,options)=>{
    if(path.endsWith('/presence'))return response({users:[{sessionId:'client-session',roomId:snapshot.roomId,username:'Member'}],capacity:15});
    if(path.includes('/chat?'))return response({messages:[]});
    if(path.endsWith('/chat'))return response({id:'sent-message',sessionId:'client-session',roomId:snapshot.roomId,username:'Member',message:JSON.parse(options.body).message});
    return response({signals:[],csrfToken:'session-csrf'});
  };
  window.MUZIKAZ_API={ready:discovery?discovered.promise:Promise.resolve(),url:path=>base+path,fetch:async(path,options)=>{requests.push({path,options,body:options.body?JSON.parse(options.body):null});return fetcher(path,options);}};
  class EventSource extends Target {constructor(url,options){super();this.url=url;this.options=options;this.closed=false;streams.push(this);}close(){this.closed=true;}}
  window.EventSource=EventSource;
  const navigator={language:'en',sendBeacon:()=>true};
  const context=vm.createContext({window,document,navigator,location:{href:'https://frontend.example/model-explorer.html'},localStorage:storage,crypto:{randomUUID:()=> 'client-session'},URL,Map,Set,Date,JSON,Promise,Error,DOMException,AbortController,console,EventSource,CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setInterval:(callback,ms)=>{const id=++nextTimer;intervals.set(id,{callback,ms});return id;},clearInterval:id=>intervals.delete(id),setTimeout,clearTimeout});
  vm.runInContext(source,context,{importModuleDynamically:()=>Promise.reject(new Error('Speech modules are not required by this social transport test.'))});
  return {window,snapshot,nodes,requests,streams,response,
    setFetcher:handler=>{fetcher=handler;},discover:()=>{base='https://api.example';discovered.resolve();},
    ready:roomId=>window.fire('muzikaz:multiplayer-room-ready',{detail:{roomId}}),
    change:roomId=>{snapshot.roomId=roomId;snapshot.serverReady=false;window.MUZIKAZ_HOUSE_TRACKING.roomId=roomId;return window.fire('muzikaz:multiplayer-world-change',{detail:{roomId}});},
    tick:async ms=>{for(const {callback,ms:delay}of intervals.values())if(delay===ms)await callback();await settle();}
  };
}

test('solo worlds and unjoined multiplayer do not send social API calls, even with an avatar',async()=>{
  const h=harness();await settle();
  await h.window.fire('muzikaz-avatar-ready');await h.tick(5000);await h.tick(1000);
  await h.nodes.get('crib-chat-toggle').fire('click');
  h.nodes.get('crib-chat-input').value='Hello';await h.nodes.get('crib-chat-form').fire('submit');
  assert.match(h.nodes.get('crib-chat-status').textContent,/Join a multiplayer room/);
  await h.nodes.get('crib-mic-toggle').fire('click');
  assert.match(h.nodes.get('crib-voice-status').textContent,/Join a multiplayer room/);
  h.snapshot.serverHostedRoom=true;await h.ready('world-a');await h.tick(5000);
  assert.equal(h.requests.length,0);assert.equal(h.streams.length,0);
});

test('authoritative room readiness waits for API discovery and retains presence, history, chat and credentialed events',async()=>{
  const h=harness({discovery:true});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;h.snapshot.worldLoading=true;
  const ready=h.ready('world-a');await settle();
  assert.equal(h.requests.length,0);assert.equal(h.streams.length,0);
  h.discover();await ready;
  assert.equal(h.snapshot.gameplayStarted,false,'room-ready can precede the gameplay UI state');
  assert.equal(h.requests.filter(request=>request.path.endsWith('/presence')).length,1);
  assert.equal(h.requests[0].body.roomId,'world-a');
  assert.ok(h.requests.some(request=>request.path.includes('/chat?roomId=world-a')));
  assert.equal(h.streams.length,1);assert.match(h.streams[0].url,/^https:\/\/api\.example\/api\/houses\/ioncore-house\/events\?/);
  assert.equal(h.streams[0].options.withCredentials,true);
  h.nodes.get('crib-chat-input').value='Room message';await h.nodes.get('crib-chat-form').fire('submit');
  assert.ok(h.requests.some(request=>request.path.endsWith('/chat')&&request.body.message==='Room message'));
  await h.tick(1000);assert.ok(h.requests.some(request=>request.path.endsWith('/voice/signal')));
  assert.equal(h.nodes.get('crib-chat-messages').children.length,1);
});

test('changing worlds closes the old stream and prevents social calls until the replacement room joins',async()=>{
  const h=harness();h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;await h.ready('world-a');
  const firstStream=h.streams[0],firstRequest=h.requests[0];
  await h.change('world-b');const requestCount=h.requests.length;
  assert.equal(firstStream.closed,true);assert.equal(firstRequest.options.signal.aborted,true);
  await h.ready('world-a');await h.ready('world-b');await h.tick(5000);await h.tick(1000);
  await firstStream.fire('house-chat-message',{data:JSON.stringify({id:'stale',roomId:'world-b',message:'Old stream'})});
  assert.equal(h.requests.length,requestCount);assert.equal(h.nodes.get('crib-chat-messages').children.length,0);
  h.snapshot.serverReady=true;await h.ready('world-b');
  assert.equal(h.streams.length,2);assert.match(h.streams[1].url,/roomId=world-b/);
  assert.equal(h.requests.filter(request=>request.path.endsWith('/presence')).at(-1).body.roomId,'world-b');
  await h.window.fire('pagehide',{persisted:false});assert.equal(h.streams[1].closed,true);
});

test('a room change during discovery cannot start the abandoned room or stream',async()=>{
  const h=harness({discovery:true});h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;
  const ready=h.ready('world-a');await settle();await h.change('world-b');h.discover();await ready;
  assert.equal(h.requests.length,0);assert.equal(h.streams.length,0);
  h.snapshot.serverReady=true;await h.ready('world-b');
  assert.equal(h.requests[0].body.roomId,'world-b');assert.equal(h.streams.length,1);
});

test('server room-membership errors remain visible and do not open a social stream',async()=>{
  const h=harness();h.snapshot.serverHostedRoom=true;h.snapshot.serverReady=true;
  h.setFetcher(async()=>h.response({code:'ROOM_REQUIRED',error:'Join the authoritative room before sending presence.'},409));
  await h.ready('world-a');
  assert.match(h.nodes.get('crib-chat-status').textContent,/Join the authoritative room/);
  assert.equal(h.streams.length,0);assert.equal(h.requests.length,1);
});
