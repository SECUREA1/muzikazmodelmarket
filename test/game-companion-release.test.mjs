import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

for(const [file,prefix]of [['world-resident-ui.js','resident'],['transport-activity.js','transport']]){
 test(prefix+' companion releases only actual open and close transitions',()=>{
  const source=readFileSync(new URL('../public/js/'+file,import.meta.url),'utf8');
  const start=source.indexOf(' const open='),end=source.indexOf(';toggle.onclick',start);
  assert.ok(start>=0&&end>start,'exercise the companion panel’s real lifecycle');
  const releases=[],panel={hidden:true,scrollTop:12,querySelector:()=>({focus(){}})},attributes={};
  const context=vm.createContext({panel,toggle:{setAttribute:(key,value)=>attributes[key]=value,focus(){}},shell:{contains:()=>false},document:{exitPointerLock(){},activeElement:null},worldRadio:{refresh(){}},requestGameInputRelease:reason=>releases.push(reason),revealGameViewControl:()=>false,render(){},fit(){},fitPanel(){}});
  vm.runInContext(source.slice(start,end+1)+';globalThis.setPanelOpen=open;',context);
  context.setPanelOpen(false);assert.deepEqual(releases,[],'closed-panel snapshot updates preserve fresh input');
  context.setPanelOpen(true);assert.equal(panel.hidden,false);assert.equal(attributes['aria-expanded'],'true');
  assert.deepEqual(releases,[prefix+'-panel-open']);
  context.setPanelOpen(true);assert.equal(releases.length,1,'refreshing an open companion does not release fresh input again');
  context.setPanelOpen(false);assert.equal(panel.hidden,true);assert.equal(attributes['aria-expanded'],'false');
  assert.deepEqual(releases,[prefix+'-panel-open',prefix+'-panel-close']);
  context.setPanelOpen(false);assert.equal(releases.length,2);
  context.setPanelOpen(true);assert.equal(panel.hidden,false);assert.equal(releases.length,3,'a new open still releases previous controls');
 });
}
