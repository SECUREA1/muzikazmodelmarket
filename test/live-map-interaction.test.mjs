import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../public/js/live-map-interaction.js',import.meta.url),'utf8');
function fixture(){
 const target=()=>({listeners:new Map(),addEventListener(type,fn,capture){const list=this.listeners.get(type)||[];list.push({fn,capture:capture===true});this.listeners.set(type,list);},removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(entry=>entry.fn!==fn));},emit(type,fields={},phase){for(const entry of this.listeners.get(type)||[])if(phase===undefined||phase===entry.capture)entry.fn({type,pointerId:1,pointerType:'touch',isPrimary:true,...fields});}});
 const root=target(),window=target(),document=target(),scheduled=new Map();let next=0,draws=0;
 const schedule=fn=>{scheduled.set(++next,fn);return next;};
 const context=vm.createContext({window,document,setTimeout:schedule,clearTimeout:id=>scheduled.delete(id),requestAnimationFrame:schedule,cancelAnimationFrame:id=>scheduled.delete(id)});
 vm.runInContext(source.replace('export function','function'),context);
 const controller=context.holdLiveMapUpdates(root,()=>draws++);
 const flush=()=>{for(const [id,fn]of [...scheduled]){scheduled.delete(id);fn();}};
 return {root,window,document,controller,flush,get draws(){return draws;}};
}
test('live map updates wait for the active tap and survive releases over stopping panels',()=>{
 const f=fixture();f.root.emit('pointerdown');f.controller.update();assert.equal(f.draws,0);
 f.window.emit('pointerup',{},true);f.root.emit('click');f.flush();assert.equal(f.draws,1);
 f.controller.dispose();
});
test('a fresh primary map touch recovers a discarded terminal event without retaining an old finger',()=>{
 const f=fixture();f.root.emit('pointerdown');f.controller.update();
 f.root.emit('pointerdown',{pointerId:2});f.window.emit('pointerup',{pointerId:2});f.root.emit('click');f.flush();
 assert.equal(f.draws,1,'the old pointer cannot freeze future map snapshots');f.controller.dispose();
});
test('page suspension releases pending map updates and disposal removes lifecycle handlers',()=>{
 const f=fixture();f.root.emit('pointerdown');f.controller.update();f.window.emit('pagehide');f.flush();assert.equal(f.draws,1);
 f.controller.dispose();assert.equal([...f.window.listeners.values()].flat().length,0);assert.equal([...f.document.listeners.values()].flat().length,0);
});
test('a second simultaneous finger still holds map targets until both fingers finish',()=>{
 const f=fixture();f.root.emit('pointerdown');f.root.emit('pointerdown',{pointerId:2,isPrimary:false});f.controller.update();
 f.window.emit('pointerup');f.root.emit('click');f.flush();assert.equal(f.draws,0);
 f.window.emit('pointerup',{pointerId:2,isPrimary:false});f.root.emit('click');f.flush();assert.equal(f.draws,1);f.controller.dispose();
});
