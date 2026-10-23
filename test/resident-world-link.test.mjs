import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {residentWorldUrl,mountResidentWorldLink} from '../public/js/resident-world-link.js';

test('resident walkthrough links preserve each exact map and start its shared walkable experience',()=>{
 for(const id of ['neon-junction','hockey-arena','member-custom-floor','Echo garden / 雪']){
  const target=new URL(residentWorldUrl(id,'https://example.test/worlds/arcade.html?environment=old&mode=solo#match'));
  assert.equal(target.origin,'https://example.test');assert.equal(target.pathname,'/worlds/model-explorer.html');assert.equal(target.hash,'');
  assert.deepEqual(Object.fromEntries(target.searchParams),{environment:id,house:id,walkthrough:'1',mode:'multiplayer',autoplay:'1'});
 }
});

test('identifier punctuation cannot replace the destination, append another mode or execute a scheme',()=>{
 for(const id of ['../other?mode=solo#escape','map&environment=wrong&mode=solo','javascript:alert(1)','"><script>alert(1)</script>','%26house%3Dother']){
  const target=new URL(residentWorldUrl(id,'https://example.test/hockey.html'));
  assert.equal(target.pathname,'/model-explorer.html');assert.equal(target.origin,'https://example.test');assert.equal(target.searchParams.get('environment'),id);assert.equal(target.searchParams.get('house'),id);assert.equal(target.searchParams.get('mode'),'multiplayer');assert.equal([...target.searchParams].length,5);
 }
 for(const id of [null,undefined,'','   ',{},123])assert.equal(residentWorldUrl(id,'https://example.test/'),'');
 for(const base of ['not a URL','javascript:alert(1)','data:text/html,x','file:///local/arcade.html'])assert.equal(residentWorldUrl('valid',base),'');
});

class Anchor{
 constructor(){this.attributes=new Map();this.listeners=new Map();this.dataset={};this.style={};}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
 removeAttribute(name){this.attributes.delete(name);}
 addEventListener(type,listener){this.listeners.set(type,listener);}
 set href(value){this.setAttribute('href',value);}
 get href(){return this.getAttribute('href')||'';}
 set tabIndex(value){this.setAttribute('tabindex',value);}
 dispatch(type){const event={prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};this.listeners.get(type)?.(event);return event;}
}
function fixture(){const parent={children:[],ownerDocument:{createElement(tag){assert.equal(tag,'a');return new Anchor();}},append(node){this.children.push(node);}};return parent;}

test('one persistent accessible link follows dynamic map changes before keyboard, pointer and menu navigation',()=>{
 let id='garden';const parent=fixture(),link=mountResidentWorldLink(parent,()=>id,{compact:true,baseUrl:'https://example.test/index.html'});
 assert.equal(parent.children[0],link);assert.equal(link.textContent,'People & favors');assert.match(link.getAttribute('aria-label'),/People & favors/);
 assert.equal(new URL(link.href).searchParams.get('environment'),'garden');
 id='new map&part=1';link.dispatch('focus');assert.equal(new URL(link.href).searchParams.get('house'),id);
 id='hockey-custom';assert.equal(link.dispatch('pointerdown').stopped,true);assert.equal(new URL(link.href).searchParams.get('environment'),id);
 id='park-custom';link.dispatch('contextmenu');assert.equal(new URL(link.href).searchParams.get('environment'),id);
 id='final';const event=link.dispatch('click');assert.equal(event.prevented,false);assert.equal(event.stopped,true);assert.equal(new URL(link.href).searchParams.get('environment'),id);assert.equal(parent.children.length,1);
 assert.equal(link.dispatch('keydown').stopped,true,'focused navigation does not also steer or trigger the match');
});

test('an unresolved map stays visibly disabled and recovers when a destination becomes available',()=>{
 let id;const parent=fixture(),link=mountResidentWorldLink(parent,()=>id,{baseUrl:'https://example.test/'});
 assert.equal(link.href,'');assert.equal(link.getAttribute('aria-disabled'),'true');assert.equal(link.dispatch('click').prevented,true);
 id='restored-map';link.dispatch('focus');assert.equal(link.getAttribute('aria-disabled'),null);assert.equal(link.getAttribute('tabindex'),null);assert.equal(new URL(link.href).searchParams.get('environment'),id);
 id=null;link.dispatch('pointerdown');assert.equal(link.href,'');assert.equal(link.getAttribute('aria-disabled'),'true');
});

test('native arcade and hockey expose same-map People links in menus and controls that survive match-bar hiding',async()=>{
 const [arcade,hockey]=await Promise.all(['arcade-game.js','hockey-game.js'].map(file=>readFile(new URL('../public/js/'+file,import.meta.url),'utf8')));
 for(const source of [arcade,hockey])assert.match(source,/import \{mountResidentWorldLink\} from '\.\/resident-world-link\.js'/);
 assert.match(arcade,/mountResidentWorldLink\(lobby\.querySelector\('\.lobby-body'\),environmentId/);
 assert.match(arcade,/mountResidentWorldLink\(arcadePeopleToolbar,environmentId/);
 assert.match(arcade,/Explore the arcade.*environmentId/);
 assert.match(hockey,/mountResidentWorldLink\(accessBar,mapId\)/);
 assert.match(hockey,/mountResidentWorldLink\(\$\('#lobby'\),mapId\)/);
 assert.match(hockey,/mountResidentWorldLink\(hockeyPanels\.match,mapId\)/);
 assert.match(hockey,/mountResidentWorldLink\(hockeyPeopleToolbar,mapId/);
});
