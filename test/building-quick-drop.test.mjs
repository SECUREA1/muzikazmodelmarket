import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('selecting an item closes the catalog and dropping registers it without opening the editor',()=>{
 const source=readFileSync('public/js/house-explorer-glb.js','utf8');
 assert.ok(source.includes('if(material){toxicBubbleSystem.setBrickMaterial(material);buildingPopup.hidden=true;closeTools()'));
 const drop=source.slice(source.indexOf('    placeBrick('),source.indexOf('    brickAtRay('));
 assert.ok(drop.includes('this.bricks.push(brick)'));assert.ok(drop.includes('applyDropSettings(THREE,brick,this.dropSettings)'));
 assert.ok(!drop.includes('beginBuildingEdit'));assert.ok(!drop.includes('showModal'));
 assert.ok(source.includes("['x','y','z'].map(axis"));assert.ok(source.includes('data-adjust-axis="scale"'));
 assert.ok(source.includes('data-adjust-target="last"'));assert.ok(source.includes("placementAdjustDialog.addEventListener('close'"));
});
