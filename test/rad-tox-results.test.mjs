import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMatchResults,radToxPhaseStatus,roundCountdown,tournamentStandings,waveCountdown} from '../public/js/match-results.js';

test('wave clock uses server time and advances locally without changing phase authority',()=>{
 const snapshot={serverTime:10000,radTox:{state:'active',phaseKind:'wave',wave:2,normalWaveCount:4,endsAt:130000}};
 const before=structuredClone(snapshot);
 assert.deepEqual(waveCountdown(snapshot),{wave:2,normalWaves:4,seconds:120,clock:'2:00'});
 assert.equal(waveCountdown(snapshot,60000).clock,'1:00');assert.equal(waveCountdown(snapshot,119999).clock,'0:01');assert.equal(waveCountdown(snapshot,140000).clock,'0:00');
 assert.match(radToxPhaseStatus(snapshot,140000),/waiting for the server/);assert.deepEqual(snapshot,before);
 assert.equal(waveCountdown({...snapshot,radTox:{...snapshot.radTox,phaseKind:'boss',wave:5,endsAt:null}}),null);
 assert.match(radToxPhaseStatus({...snapshot,radTox:{...snapshot.radTox,phaseKind:'boss',wave:5,endsAt:null}}),/defeat your boss/);
 assert.equal(waveCountdown({serverTime:1000,radTox:{state:'active',wave:1,endsAt:null}}),null);
 assert.equal(waveCountdown({radTox:{state:'active',wave:1,endsAt:120000}}),null);
});

test('fourth-wave results announce the boss; level and retry transitions retain server countdowns',()=>{
 const snapshot={serverTime:1000,radTox:{state:'cleared',wave:4,transition:{kind:'wave',at:11000}}};
 assert.equal(waveCountdown(snapshot),null);assert.equal(radToxPhaseStatus(snapshot),'Boss battle in 10s · starts together');
 assert.equal(radToxPhaseStatus(snapshot,10001),'Waiting for the server to start the next phase…');
 assert.equal(radToxPhaseStatus({...snapshot,radTox:{...snapshot.radTox,wave:3}}),'Next wave in 10s · starts together');
 assert.deepEqual(roundCountdown({...snapshot,radTox:{transition:{kind:'level',at:11000}}},5000),{kind:'level',seconds:5});
 assert.match(radToxPhaseStatus({...snapshot,radTox:{transition:{kind:'retry',at:11000}}}),/^Level retry in 10s/);
 assert.equal(roundCountdown({serverTime:1,radTox:{transition:{kind:'wave',at:NaN}}}),null);
});

test('tournament standings rank cumulative totals independently of new level scores',()=>{
 const results=[{id:'b',username:'B',score:150,enemyKills:4,playerKills:1,shots:4,hits:3,connected:false},{id:'a',username:'A',score:150,kills:7,shots:0,hits:0,bossKills:2,accuracy:0,connected:true},{id:'c',username:'C',score:70,kills:7,shots:3,hits:1}];
 const snapshot={match:{level:2,results:[{id:'a',score:0}]},tournament:{id:'season',results}},before=structuredClone(snapshot);
 const standings=tournamentStandings(snapshot);
 assert.deepEqual(standings.map(({id,rank,score})=>({id,rank,score})),[{id:'a',rank:1,score:150},{id:'b',rank:2,score:150},{id:'c',rank:3,score:70}]);
 assert.equal(standings[0].bossKills,2);assert.equal(standings[1].kills,5);assert.equal(standings[1].accuracy,75);assert.equal(standings[1].connected,false);assert.equal(standings[2].accuracy,33.3);
 assert.deepEqual(snapshot,before);assert.deepEqual(tournamentStandings({}),[]);
});

class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.hidden=false;this.open=false;this.disabled=false;this.className='';this.textContent='';}
 set innerHTML(value){
  if(value.includes('data-results-close')){
   this.nodes=new Map([['h2',new Element('h2')]]);
   for(const match of value.matchAll(/data-([a-z-]+)/g))this.nodes.set(`[data-${match[1]}]`,new Element());
  }
 }
 querySelector(selector){return this.nodes?.get(selector)||null;}
 setAttribute(name,value){this[name]=String(value);}
 append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
 replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);}
 remove(){if(this.parentElement){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;}}
 addEventListener(name,callback){(this.listeners[name]??=[]).push(callback);}
 click(){if(!this.disabled)for(const listener of this.listeners.click||[])listener({target:this});}
 close(){this.open=false;}
 showModal(){this.open=true;this.shown=(this.shown||0)+1;}
}

test('results show separate level and tournament scores, tick locally and auto-open fourth-wave and boss results once',()=>{
 const previous={document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval},oldNow=Date.now;
 const body=new Element('body'),dock=new Element();let timer,now=100000,cleared=false;
 globalThis.document={body,createElement:tag=>new Element(tag)};globalThis.setInterval=callback=>{timer=callback;return 17;};globalThis.clearInterval=value=>{assert.equal(value,17);cleared=true;};Date.now=()=>now;
 let api;
 try{
  api=mountMatchResults({dock,onNext(){},onRespawn(){}});
  const dialog=body.children[0],button=dock.children[0],levelRow={id:'self',username:'You',connected:true,score:10,shots:4,hits:2,accuracy:50,kills:1,items:['Shield']};
  const snapshot={serverTime:1000,players:{self:{health:100,combat:{deaths:0}}},match:{id:'level-2',level:2,state:'active',startedAt:1000,results:[levelRow]},radTox:{state:'active',phaseKind:'wave',wave:1,normalWaveCount:4,endsAt:121000},tournament:{id:'season',results:[{...levelRow,score:50},{id:'other',username:'Leader',connected:false,score:90,kills:9}]}};
  api.render(snapshot,'self');assert.equal(dialog.open,false);button.click();assert.equal(dialog.open,true);
  assert.equal(dialog.querySelector('[data-level-head]').children[1].textContent,'Level score');assert.equal(dialog.querySelector('[data-tournament-head]').children[2].textContent,'Tournament total');
  const level=dialog.querySelector('[data-level-body]').children[0],tournament=dialog.querySelector('[data-tournament-body]').children;
  assert.equal(level.children[1].textContent,'10');assert.equal(level.children[14].textContent,'Shield');assert.equal(tournament[0].children[2].textContent,'90');assert.equal(tournament[1].children[2].textContent,'50');assert.equal(tournament[1].className,'is-self');assert.match(tournament[0].children[1].textContent,/disconnected/);
  assert.match(dialog.querySelector('[data-results-summary]').textContent,/enemies and combat are local/);
  now+=60000;timer();assert.equal(dialog.querySelector('[data-results-phase]').textContent,'Wave 1 / 4 · 1:00 remaining');
  dialog.querySelector('[data-results-close]').click();assert.equal(dialog.open,false);
  const fourth={...snapshot,radTox:{state:'cleared',wave:4,phaseKind:'wave',transition:{kind:'wave',at:11000}}};
  api.render(fourth,'self');assert.equal(dialog.open,true);assert.equal(dialog.shown,2);assert.equal(dialog.querySelector('h2').textContent,'Wave 4 complete');assert.match(dialog.querySelector('[data-results-next]').textContent,/Boss battle in 10s/);assert.equal(dialog.querySelector('[data-level-body]').children[0].children[1].textContent,'10','transition without a frozen row uses the current authoritative level results');
  dialog.querySelector('[data-results-close]').click();api.render(fourth,'self');assert.equal(dialog.open,false,'the same completed wave does not reopen results after dismissal');
  const boss={...snapshot,radTox:{state:'active',wave:5,phaseKind:'boss',endsAt:null}};api.render(boss,'self');assert.equal(dialog.open,false);assert.match(dialog.querySelector('[data-results-phase]').textContent,/Boss battle/);
  const final={...boss,match:{...snapshot.match,state:'finished',outcome:'victory',endedAt:181000},radTox:{...boss.radTox,state:'finished',transition:{kind:'level',at:11000}}};
  api.render(final,'self');assert.equal(dialog.open,true);assert.equal(dialog.shown,3);assert.equal(dialog.querySelector('h2').textContent,'Level 2 · Victory');assert.match(dialog.querySelector('[data-results-next]').textContent,/Next level in 10s/);
 }finally{api?.destroy();Date.now=oldNow;Object.assign(globalThis,previous);}
 assert.equal(cleared,true);
});
