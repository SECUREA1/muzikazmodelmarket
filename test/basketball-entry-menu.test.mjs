import test from 'node:test';
import assert from 'node:assert/strict';
import {basketballEntryTeam,basketballScoreboardState,createBasketballEntryFlow} from '../public/js/basketball-hud.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('arrival waits for the current server snapshot and opens once across updates and reconnects',()=>{
  const changes=[];let opens=0,closes=0;
  const flow=createBasketballEntryFlow({open:()=>opens++,close:()=>closes++,onChange:value=>changes.push(value)});
  flow.begin();assert.equal(flow.pending,true);flow.sync(false);assert.equal(opens,0);
  flow.sync(true);assert.equal(opens,1);
  for(const ready of [true,true,false,true])flow.sync(ready);
  assert.equal(opens,1,'polling and a reconnect do not reopen the arrival choice');
  flow.release();flow.sync(true);assert.equal(opens,1);assert.equal(closes,1);assert.equal(flow.pending,false);
  flow.begin();flow.sync(true);assert.equal(opens,2,'an explicit later map entry gets its own menu');
  assert.deepEqual(changes,[true,false,true]);
});

test('Join waits for server success, keeps failures visible and prevents duplicate requests',async()=>{
  let resolveJoin,requests=0,closes=0,status='';
  const flow=createBasketballEntryFlow({close:()=>closes++,onStatus:value=>{status=value;},choose:()=>{requests++;return new Promise(resolve=>{resolveJoin=resolve;});}});
  flow.begin();flow.sync(true);
  const first=flow.choose('join'),duplicate=flow.choose('join');assert.equal(first,duplicate);assert.equal(flow.busy,true);
  await flush();assert.equal(requests,1);assert.equal(closes,0);assert.match(status,/Joining/);
  resolveJoin(false);assert.equal(await first,false);assert.equal(flow.pending,true);assert.equal(flow.busy,false);assert.equal(closes,0);assert.match(status,/try again/);
  const retry=flow.choose('join');await flush();resolveJoin(true);assert.equal(await retry,true);
  assert.equal(requests,2);assert.equal(flow.pending,false);assert.equal(flow.busy,false);assert.equal(closes,1);
});

test('free play and spectating release the court only after their asynchronous callbacks complete',async()=>{
  for(const choice of ['freeplay','spectate']){
    let complete,closes=0;const choices=[];
    const flow=createBasketballEntryFlow({close:()=>closes++,choose:mode=>{choices.push(mode);return new Promise(resolve=>{complete=resolve;});}});
    flow.begin();const pending=flow.choose(choice);await flush();assert.deepEqual(choices,[choice]);assert.equal(flow.pending,true);assert.equal(closes,0);
    complete();assert.equal(await pending,true);assert.equal(flow.pending,false);assert.equal(closes,1);
  }
});

test('server errors allow retries and an old response cannot release a different map entry',async()=>{
  let complete,status='',closes=0,fail=true;
  const flow=createBasketballEntryFlow({close:()=>closes++,onStatus:value=>{status=value;},choose:()=>{if(fail)throw new Error('Server unavailable. Retry.');return new Promise(resolve=>{complete=resolve;});}});
  flow.begin();assert.equal(await flow.choose('spectate'),false);assert.equal(flow.pending,true);assert.equal(status,'Server unavailable. Retry.');
  fail=false;const stale=flow.choose('spectate');await flush();flow.reset();flow.begin();complete(true);assert.equal(await stale,false);assert.equal(flow.pending,true);assert.equal(closes,0);
});

test('Join offers actual human vacancies, keeps existing membership and supports live AI takeover',()=>{
  const settings={teamSize:3,homeHumans:1,awayHumans:2};
  const players={host:{basketballTeam:'home',username:'Host'},bot:{basketballTeam:'away',basketballAI:true},viewer:{basketballRole:'spectator',basketballTeam:'away'}};
  const visitor={basketballRole:'spectator',basketballTeam:'home'};
  assert.equal(basketballEntryTeam({state:'ready',settings},visitor,players),'away');
  assert.equal(basketballEntryTeam({state:'ready',settings},visitor,players,'home'),null,'a full configured human side cannot be selected');
  assert.equal(basketballEntryTeam({state:'ready',settings},players.host,players,'home'),'home');
  assert.equal(basketballEntryTeam({state:'live',settings},visitor,players,'home'),'home','live games can replace AI with human players');
  assert.equal(basketballEntryTeam({state:'ready',settings:{...settings,homeHumans:0,awayHumans:0}},visitor,{}),null);
});

test('untimed practice is labelled free play until a real match starts',()=>{
  const ready={state:'ready',homeScore:0,awayScore:0,clockMs:720000,shotClockMs:24000,quarter:1,settings:{quarters:4}};
  assert.deepEqual(basketballScoreboardState(ready,{freeplay:true}),{home:0,away:0,phase:'FREE PLAY',gameClock:'—',shotClock:'—',possession:null});
  const live=basketballScoreboardState({...ready,state:'live'},{freeplay:true});assert.equal(live.phase,'Q1');assert.equal(live.gameClock,'12:00');assert.equal(live.shotClock,'24');
  assert.equal(basketballScoreboardState({...ready,state:'finished'},{freeplay:true}).phase,'FINAL','completed solo matches retain the result');
});

// A small DOM adapter lets the real HUD mount and render without a browser.
class Element {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.className='';this.open=false;
    this.classList={contains:name=>this.className.split(' ').includes(name),toggle:(name,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));if(on??!names.has(name))names.add(name);else names.delete(name);this.className=[...names].join(' ');},add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false)};
  }
  get isConnected(){return this.connected||Boolean(this.parentElement?.isConnected);}
  set textContent(value){for(const child of this.children)child.parentElement=null;this.children=[];this.text=String(value);}
  get textContent(){return (this.text||'')+this.children.map(child=>child.textContent).join('');}
  set innerHTML(html){
    this.replaceChildren();const stack=[this];
    for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){
      if(token.startsWith('</')){stack.pop();continue;}
      if(token.startsWith('<')){
        const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;
        const node=new Element(tag),attrs=token.slice(tag.length+1,-1);
        for(const match of attrs.matchAll(/([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(match[1],match[2]??match[3]??match[4]??'');
        stack.at(-1).append(node);if(!['input','br','hr','link'].includes(tag))stack.push(node);
      }else stack.at(-1).text=(stack.at(-1).text||'')+token;
    }
    for(const select of this.querySelectorAll('select'))select.value=select.children[0]?.value||'';
  }
  setAttribute(name,value){this.attributes[name]=String(value);if(name==='class')this.className=String(value);else if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);else if(['value','name','type'].includes(name))this[name]=String(value);else if(['hidden','disabled','open'].includes(name))this[name]=true;}
  getAttribute(name){return name==='class'?this.className:this.attributes[name]??null;}
  append(...nodes){for(const node of nodes)this.insertBefore(node,null);}
  prepend(node){this.insertBefore(node,this.children[0]||null);}
  insertBefore(node,before){node.remove();const index=before?this.children.indexOf(before):-1;this.children.splice(index<0?this.children.length:index,0,node);node.parentElement=this;return node;}
  replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.text='';this.append(...nodes);}
  replaceWith(node){this.parentElement.insertBefore(node,this);this.remove();}
  insertAdjacentHTML(position,html){assert.equal(position,'beforeend');const holder=new Element();holder.innerHTML=html;this.append(...holder.children.slice());}
  remove(){if(this.parentElement){const parent=this.parentElement;parent.children.splice(parent.children.indexOf(this),1);this.parentElement=null;}}
  matches(selector){
    return selector.split(',').some(part=>{
      const token=part.trim(),attribute=token.match(/^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
      if(attribute){const value=this.getAttribute(attribute[1]);return value!==null&&(attribute[2]===undefined||value===attribute[2]);}
      return token.startsWith('.')?this.classList.contains(token.slice(1)):this.tagName===token.toUpperCase();
    });
  }
  closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
  querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(name,callback){(this.listeners[name]??=[]).push(callback);}
  removeEventListener(name,callback){this.listeners[name]=this.listeners[name]?.filter(value=>value!==callback);}
  getClientRects(){for(let node=this;node;node=node.parentElement)if(node.hidden||(node.tagName==='DIALOG'&&!node.open))return [];return this.isConnected?[{}]:[];}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  showModal(){this.open=true;this.shown=(this.shown||0)+1;}
  close(){if(!this.open)return;this.open=false;for(const listener of this.listeners.close||[])listener({target:this});}
  click(){
    if(this.disabled||this.hidden)return;
    let stopped=false;const event={target:this,stopPropagation(){stopped=true;},preventDefault(){}};
    const result=this.onclick?.(event);
    for(let node=this;node&&!stopped;node=node.parentElement)for(const listener of node.listeners.click||[])listener(event);
    return result;
  }
}

test('mounted HUD fills the login lobby before opening and releases Join, Spectate and Free play only on success',async()=>{
  const previous={document:globalThis.document,location:globalThis.location,window:globalThis.window,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,MutationObserver:globalThis.MutationObserver};
  const head=new Element('head'),body=new Element('body'),parent=new Element(),stage=new Element();head.connected=true;body.connected=true;body.append(parent);parent.append(stage);
  globalThis.document={head,body,hidden:false,createElement:tag=>new Element(tag),querySelector:selector=>head.querySelector(selector)||body.querySelector(selector),addEventListener(){},removeEventListener(){},exitPointerLock(){}};
  globalThis.location=new URL('https://www.muzikaz.com/basketball.html?mode=multiplayer');
  globalThis.window={fetch:async()=>({ok:true,json:async()=>({success:true,data:{matches:[]}})})};
  globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};globalThis.MutationObserver=undefined;
  const actions=[],worldModes=[];let successful=false;
  try{
    const {mountBasketballHud}=await import('../public/js/basketball-hud.js');
    const hud=mountBasketballHud({stage,actionParent:parent,onAction:async(action,options)=>{actions.push([action,options]);return successful;},onWorldMode:async mode=>{worldModes.push(mode);return successful;}});
    const self={actorId:'viewer',basketballRole:'spectator'},players={viewer:self,host:{username:'Alice',basketballTeam:'home'}};
    const game={state:'ready',hostId:'host',hostName:'Alice',settings:{teamSize:3,homeHumans:1,awayHumans:2}};
    const dialog=parent.querySelector('.basketball-match-menu');
    hud.beginEntry();hud.render(null,null,true,{});assert.equal(dialog.open,false);
    hud.render(game,self,true,players);assert.equal(dialog.open,true);assert.equal(dialog.shown,1);
    assert.equal(await hud.beginMatch(),false);assert.deepEqual(actions,[],'public Begin cannot bypass the entry choice');assert.equal(hud.entryPending,true);assert.equal(dialog.open,true);
    assert.match(dialog.querySelector('[data-lobby-home-roster]').textContent,/Alice/);assert.match(dialog.querySelector('[data-lobby-status]').textContent,/Alice is hosting/);
    const join=dialog.querySelector('[data-basketball-entry="join"]');await join.click();
    assert.deepEqual(actions.at(-1),['basketball-team',{team:'away'}]);assert.equal(dialog.open,true);assert.equal(hud.entryPending,true);assert.match(dialog.querySelector('[data-entry-status]').textContent,/try again/);
    successful=true;await join.click();assert.equal(dialog.open,false);assert.equal(hud.entryPending,false);
    hud.render(game,self,true,players);assert.equal(dialog.shown,1);
    hud.beginEntry();hud.render(game,self,true,players);await dialog.querySelector('[data-basketball-entry="spectate"]').click();assert.deepEqual(actions.at(-1),['basketball-watch',{}]);assert.equal(dialog.open,false);
    hud.beginEntry();hud.render(game,self,true,players);await dialog.querySelector('[data-basketball-entry="freeplay"]').click();assert.deepEqual(worldModes,['freeplay']);assert.equal(dialog.open,false);
    const returningHost={actorId:'host',basketballTeam:'home'};hud.beginEntry();hud.render(game,returningHost,true,{host:returningHost});const beforeBegin=actions.length;assert.equal(await hud.beginMatch(),false);assert.equal(actions.length,beforeBegin,'a returning host cannot start before choosing how to enter');assert.equal(hud.entryPending,true);
    globalThis.location=new URL('https://www.muzikaz.com/basketball.html?mode=multiplayer&basketballMode=freeplay');hud.render(game,returningHost,true,{host:returningHost});assert.equal(stage.querySelector('[data-period]').textContent,'PRE GAME','a stale freeplay marker does not label a server game as practice');
    hud.beginEntry();hud.render({...game,state:'live'},self,true,players);await dialog.querySelector('[data-basketball-entry="join"]').click();assert.deepEqual(actions.at(-1),['basketball-join-spot',{team:'away'}]);assert.equal(dialog.open,false);
  }finally{Object.assign(globalThis,previous);}
});
