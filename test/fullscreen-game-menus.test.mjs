import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('game pickers use modal containment, right-side scrolling and shared close cleanup',()=>{
 const source=readFileSync('public/js/house-explorer-glb.js','utf8');
 const helper=readFileSync('public/js/fullscreen-panels.js','utf8');
 assert.ok(helper.includes("document.createElement('dialog')"));
 assert.ok(helper.includes('dialog.showModal()'));
 assert.ok(helper.includes("dialog.addEventListener('cancel',hide)"));
 assert.ok(helper.includes("observer.observe(panel,{attributes:true,attributeFilter:['hidden','class']})"));
 assert.ok(source.includes('overflow-y:scroll!important'));
 assert.ok(source.includes('scrollbar-gutter:stable'));
 assert.ok(source.includes('height:100dvh!important'));
 assert.ok(source.includes('[explorerOptions,sprayTools,buildingPopup,inventoryPack,questPanel,buildMenu,rangeOpsPanel,avatarMenu]'));
 assert.ok(source.includes('fullscreenPanel(library'));
});

test('building paint remains editable before equip and menus block background gameplay input',()=>{
 const source=readFileSync('public/js/house-explorer-glb.js','utf8');
 assert.ok(source.includes('data-building-paint-label'));
 assert.ok(source.includes('data-building-natural'));
 assert.ok(source.includes('data-building-equip>Select item'));
  const catalog=source.slice(source.indexOf('<aside class="building-design-controls">'),source.indexOf('<section class="building-catalog-functions"'));
  assert.ok(catalog.includes('building-paint-options'));assert.ok(!catalog.includes('data-build-transform'));assert.ok(!catalog.includes('New piece staged'));
 assert.ok(source.includes("buildingPopup.hidden=true;closeTools()"));
 assert.ok(!source.includes("this.setTool('brick');buildingPopup.hidden=true"));
 assert.ok(source.includes('keys.clear();mobile.clear()'));
 assert.ok(source.includes("if(!document.querySelector('dialog[open]'))toxicBubbleSystem.update"));
});
