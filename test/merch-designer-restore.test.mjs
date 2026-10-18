import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const script=await readFile(new URL('../script.js',import.meta.url),'utf8');
function fn(name){const start=script.indexOf('function '+name+'(');assert.ok(start>=0);const next=script.indexOf('\nfunction ',start+1);return script.slice(start,next<0?undefined:next);}
test('dragging preserves the existing anchor and uses movement deltas rather than transformed image bounds',()=>{
 const context=vm.createContext({});vm.runInContext(fn('stagePercentPosition'),context);
 const stage={getBoundingClientRect:()=>({left:50,top:100,width:400,height:300})},anchor={left:50,top:40,pointerX:200,pointerY:180};
 let point=context.stagePercentPosition({clientX:200,clientY:180},stage,anchor,1);assert.equal(point.x,50);assert.equal(point.y,40);
 point=context.stagePercentPosition({clientX:240,clientY:210},stage,anchor,1);assert.equal(point.x,60);assert.equal(point.y,50);
 point=context.stagePercentPosition({clientX:241,clientY:211},stage,anchor,10);assert.equal(point.x,60);assert.equal(point.y,50);
});
test('duplicating art preserves its geometry, flips and position on the merch',()=>{
 const original={src:'data:image/png;base64,AA==',alt:'Logo custom uploaded design',style:{left:'32%',top:'61%',zIndex:'14'},dataset:{scale:'1.6',rotate:'25',flipX:'true',flipY:'false'}},layers=[original];let active=original;
 const context=vm.createContext({activeUploadLayer:()=>active,makeUploadLayer(){active={style:{},dataset:{}};layers.push(active);},applyLayerTransform(){},selectUploadLayer(){},renderOrderSummary(){},setDesignerStatus(){}});
 const code=fn('handleLayerAction').split('\n\nfunction')[0];vm.runInContext(code,context);context.handleLayerAction('duplicate');assert.equal(layers.length,2);assert.equal(active.style.left,'32%');assert.equal(active.style.top,'61%');assert.equal(active.style.zIndex,'15');for(const key of ['scale','rotate','flipX','flipY'])assert.equal(active.dataset[key],original.dataset[key]);
});
test('draft restore clears stale fields before restoring and retains the server draft workflow',async()=>{
 const restore=fn('restoreDesignerOrder');assert.ok(restore.indexOf('designerControls.reset()')<restore.indexOf('Object.entries(fields)'));
 const html=await readFile(new URL('../members.html',import.meta.url),'utf8');assert.ok(html.includes('<img class="sticker-cutline main-character"'));assert.ok(!html.includes('id="character-art-layer"'));
 for(const id of ['design-product','design-character','design-upload','upload-scale','upload-rotate','save-design','load-design','designer-order-summary'])assert.ok(html.includes('id="'+id+'"'));
 const member=await readFile(new URL('../public/js/member-designer.js',import.meta.url),'utf8');assert.ok(member.includes('/api/designer/drafts'));assert.ok(member.includes('bridge.restore(record.design)'));assert.ok(script.includes('null,order)'));
});
