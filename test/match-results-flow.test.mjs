import test from 'node:test';
import assert from 'node:assert/strict';
import {mountMatchResults} from '../public/js/match-results.js';
class Node {
 constructor(){this.children=[];this.nodes=new Map();this.events=new Map();this.open=false;}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(){}
 querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Node());return this.nodes.get(key);}
 addEventListener(key,fn){this.events.set(key,fn);}
 replaceChildren(...nodes){this.children=nodes;}
 showModal(){this.open=true;}
 close(){this.open=false;}
}
test('wave and level results do not interrupt movement, and remain available on demand',()=>{
 const previous=globalThis.document,body=new Node(),dock=new Node();let interruptions=0;
 globalThis.document={body,createElement:()=>new Node()};
 try{
  const results=mountMatchResults({dock,onOpen:()=>interruptions++}),dialog=body.children[0];
  const snapshot={serverTime:1000,players:{self:{health:100,combat:{deaths:0}}},match:{id:'run',level:1,state:'active',results:[]},radTox:{wave:1}};
  results.render(snapshot,'self');
  results.render({...snapshot,radTox:{wave:1,transition:{kind:'wave',at:2000,results:[]}}},'self');
  results.render({...snapshot,match:{...snapshot.match,state:'finished',outcome:'victory',startedAt:0,endedAt:1000}},'self');
  assert.equal(interruptions,0);assert.equal(dialog.open,false);
  dock.children[0].events.get('click')();assert.equal(dialog.open,true);assert.equal(interruptions,1);
  results.reset();assert.equal(dialog.open,false);
  results.render({...snapshot,players:{self:{health:0,combat:{deaths:1}}}},'self');
  assert.equal(dialog.open,true,'a defeated player can still access respawn');
 }finally{globalThis.document=previous;}
});
