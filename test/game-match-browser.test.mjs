import test from 'node:test';
import assert from 'node:assert/strict';
import {selectGameMatches,matchBrowserVisible,mountGameMatchBrowser} from '../public/js/game-match-browser.js';
import {basketballLobbySummary} from '../public/js/basketball-hud.js';

const match=(id,fields={})=>({id,mapId:id,mapName:id,game:'hockey',status:'waiting',players:1,capacity:12,openSlots:11,canJoin:true,canSpectate:true,joinUrl:`/hockey.html?environment=${id}&matchmaking=1`,spectateUrl:`/hockey.html?environment=${id}&spectate=1`,slots:[],...fields});

test('matchmaking lists available pre-game seats and keeps current-map lobbies first',()=>{
  const entries=[match('busy',{status:'playing',players:10,openSlots:2}),match('full',{openSlots:0}),match('empty',{status:'available',players:0}),match('home',{players:2}),match('popular',{players:4}),match('court',{game:'basketball'}),match('final',{status:'finished',canJoin:false})];
  const original=entries.slice();
  assert.deepEqual(selectGameMatches(entries,{game:'hockey',currentMapId:'home'}).map(item=>item.id),['home','popular','empty']);
  assert.ok(selectGameMatches(entries,{filter:'all'}).some(item=>item.id==='busy'));
  assert.deepEqual(entries,original,'sorting does not mutate the directory snapshot');
  assert.deepEqual(selectGameMatches(null),[]);
});

test('closed dialogs, collapsed details and hidden pages pause matchmaking',()=>{
  const dialog={tagName:'DIALOG',open:false,parentElement:null};
  const details={tagName:'DETAILS',open:true,parentElement:dialog};
  const root={isConnected:true,parentElement:details};
  assert.equal(matchBrowserVisible(root,{hidden:false}),false);
  dialog.open=true;assert.equal(matchBrowserVisible(root,{hidden:false}),true);
  details.open=false;assert.equal(matchBrowserVisible(root,{hidden:false}),false);
  details.open=true;assert.equal(matchBrowserVisible(root,{hidden:true}),false);
  root.isConnected=false;assert.equal(matchBrowserVisible(root,{hidden:false}),false);
});

test('basketball lobby counts humans separately from spectators and AI before tip-off',()=>{
  const players={alice:{username:'Alice',basketballTeam:'home'},bob:{username:'Bob',basketballTeam:'away'},bot:{basketballTeam:'home',basketballAI:true},viewer:{basketballTeam:'home',basketballRole:'spectator'},visitor:{username:'Visitor'}};
  const settings={teamSize:3,homeHumans:2,awayHumans:0};
  const [home,away]=basketballLobbySummary({state:'ready',settings},players);
  assert.deepEqual(home,{team:'home',label:'Home',humans:1,capacity:2,open:1,aiAtTipoff:2,names:['Alice']});
  assert.equal(away.capacity,0);assert.equal(away.open,0);
  assert.equal(basketballLobbySummary({state:'live',settings},players)[0].capacity,3,'live AI takeover uses the complete team capacity');
});

class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.listeners={};this.className='';this.hidden=false;this.classList={add:name=>{this.className=[this.className,name].filter(Boolean).join(' ');}};}
  get isConnected(){return this.connected||Boolean(this.parentElement?.isConnected);}
  set textContent(value){this.text=String(value);this.children=[];}
  get textContent(){return this.children.length?this.children.map(node=>node.textContent).join(''):this.text||'';}
  append(...nodes){for(const node of nodes)this.insertBefore(node,null);}
  insertBefore(node,before){node.remove();const index=before?this.children.indexOf(before):-1;this.children.splice(index<0?this.children.length:index,0,node);node.parentElement=this;return node;}
  replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);}
  remove(){if(this.parentElement){const parent=this.parentElement;parent.children.splice(parent.children.indexOf(this),1);this.parentElement=null;}}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,callback){this.listeners[name]=callback;}
  removeEventListener(name){delete this.listeners[name];}
  getClientRects(){return this.isConnected?[{}]:[];}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('browser preserves focused Join links during refresh and cleans up after removal',async()=>{
  const previous={document:globalThis.document,window:globalThis.window,location:globalThis.location,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,MutationObserver:globalThis.MutationObserver};
  let directory=[match('rink',{slots:[{id:'home-1',label:'Home 1',occupied:false}]})],requests=0,poll,cleared=false,joined;
  const dialog=new Element('dialog');dialog.open=true;dialog.connected=true;
  const root=new Element();dialog.append(root);const head=new Element('head');head.connected=true;
  const listeners={};
  globalThis.document={head,hidden:false,createElement:tag=>new Element(tag),querySelector:()=>head.children.find(node=>node.dataset.gameMatchesStyle!==undefined),addEventListener:(name,callback)=>{listeners[name]=callback;},removeEventListener:name=>{delete listeners[name];}};
  globalThis.location=new URL('https://www.muzikaz.com/hockey.html');
  globalThis.window={fetch:async path=>{requests++;assert.equal(path,'/api/matches');return {ok:true,json:async()=>({success:true,data:{matches:directory}})};}};
  globalThis.setInterval=callback=>{poll=callback;return 7;};globalThis.clearInterval=id=>{assert.equal(id,7);cleared=true;};globalThis.MutationObserver=undefined;
  let browser;
  try{
    browser=mountGameMatchBrowser(root,{game:'hockey',onJoin:(entry,options)=>{joined={entry,options};}});await flush();
    const list=root.children[4],card=list.children[0],join=card.children[3].children[0];
    assert.equal(join.textContent,'Join lobby');assert.equal(join.href,'https://www.muzikaz.com/hockey.html?environment=rink&matchmaking=1');
    document.activeElement=join;
    directory=[match('rink',{players:2,openSlots:10,slots:[{id:'home-1',label:'Home 1',occupied:true,name:'Alice'}]}),match('popular',{players:5,openSlots:7})];
    await browser.refresh();assert.equal(list.children[0],card);assert.equal(card.children[3].children[0],join,'the active control is updated in place');
    join.listeners.click({button:0,preventDefault(){}});await flush();assert.equal(joined.entry.players,2);assert.equal(joined.options.spectate,false);
    const before=requests;dialog.open=false;await browser.refresh();assert.equal(requests,before,'closed match panel makes no request');
    dialog.open=true;await browser.refresh();assert.equal(requests,before+1);
    root.remove();poll();assert.equal(cleared,true);assert.equal(listeners.visibilitychange,undefined);
  }finally{browser?.destroy();Object.assign(globalThis,previous);}
});
