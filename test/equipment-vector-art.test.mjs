import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildEquipmentVectorArt,EQUIPMENT_VECTOR_DESIGNS,EQUIPMENT_VECTOR_VERSION,equipmentVectorSvg} from '../scripts/build-equipment-vector-art.mjs';
import {RANGED_WEAPONS} from '../public/js/game-weapons.js';
import {HELD_TOOL_DESIGN_IDS} from '../public/js/held-tool-design-finish.js';
import {NATIVE_BUILDER_ITEMS} from '../public/js/native-builder-items.js';
import {FUNHOUSE_ITEMS} from '../public/js/clown-funhouse-items.js';
import {GAME_ECONOMY} from '../game-economy.mjs';
import {nativeDesignThumbnail} from '../public/js/native-design-profile.js';
import {equipmentArtworkUrl,toolPreviewArt} from '../public/js/tool-preview-art.js';
import {EQUIPMENT_ART_IDS,EQUIPMENT_ART_REVISION} from '../public/js/equipment-art-profile.js';
import {previewDescriptor} from '../public/js/market-item-preview.js';

test('every ranged weapon, melee weapon and held tool resolves to its clean vector artwork',()=>{
 const expected=new Set([
  ...HELD_TOOL_DESIGN_IDS.map(id=>'tool:'+id),
  ...Object.keys(RANGED_WEAPONS).map(id=>'tool:'+id),
  ...Object.values(NATIVE_BUILDER_ITEMS).filter(item=>item.category==='weapons').map(item=>item.id),
  'funhouse-water-gun',
 ]);
 assert.deepEqual(new Set(EQUIPMENT_VECTOR_DESIGNS.map(item=>item.id)),expected);
 assert.deepEqual(new Set(EQUIPMENT_ART_IDS),expected);
 assert.equal(expected.size,29,'24 handheld designs, four melee designs and the carnival water blaster');
 for(const design of EQUIPMENT_VECTOR_DESIGNS){
  const url='/'+design.path+'?art='+EQUIPMENT_ART_REVISION;
  assert.equal(url,nativeDesignThumbnail(design.id));
  assert.equal(equipmentArtworkUrl(design.id),url);
  if(design.id.startsWith('tool:'))assert.ok(toolPreviewArt(design.id.slice(5)).includes('href="'+url+'"'));
  const offers=GAME_ECONOMY.filter(offer=>design.id.startsWith('tool:')?offer.toolId===design.id.slice(5):offer.buildAssetId===design.id);
  assert.ok(offers.length,design.id+' remains offered in the existing economy');
  for(const offer of offers)assert.equal(offer.thumbnailUrl,url,offer.sku+' uses this exact art');
 }
 assert.equal(FUNHOUSE_ITEMS['funhouse-water-gun'].thumbnailUrl,nativeDesignThumbnail('funhouse-water-gun'));
 assert.equal(equipmentArtworkUrl('unknown-weapon'),'');
 assert.equal(equipmentArtworkUrl('../scanner'),'');
 assert.equal(previewDescriptor({toolId:'laser',thumbnailUrl:'/public/images/native-designs/tool-laser.svg'}).image,equipmentArtworkUrl('laser'),'old saved equipment records refresh canonical artwork');
 assert.equal(previewDescriptor({buildAssetId:'plasma-sword',thumbnailUrl:'/old-weapon.svg'}).image,equipmentArtworkUrl('plasma-sword'));
 assert.equal(previewDescriptor({buildAssetId:'studio-desk',thumbnailUrl:'/desk.svg'}).image,'/desk.svg','other artwork routes stay intact');
});

test('equipment artwork is genuine bounded static vector data with explicit image dimensions',async()=>{
 let total=0;const bodies=new Set();
 for(const design of EQUIPMENT_VECTOR_DESIGNS){
  const svg=await readFile(new URL('../'+design.path,import.meta.url),'utf8'),bytes=Buffer.byteLength(svg);total+=bytes;
  assert.equal(svg,equipmentVectorSvg(design),design.id+' stays reproducible');
  assert.match(svg,/<svg[^>]+width="320" height="320" viewBox="0 0 320 320"/);
  assert.ok(svg.includes('data-native-vector="'+EQUIPMENT_VECTOR_VERSION+'"'));
  assert.match(svg,/<title id="title">.+<\/title><desc id="desc">.+<\/desc>/);
  assert.doesNotMatch(svg,/<(?:image|filter|script|animate|animateTransform|foreignObject)\b|data:image|\shref=|\son[a-z]+=/i,design.id+' has no raster, script, remote request or expensive effect');
  assert.ok(bytes<6500,design.id+' is below 6.5KB');
  const body=svg.match(/<g stroke-linejoin="round">([\s\S]+)<\/g><path d="M43 263h234"/)[1];
  assert.ok(!bodies.has(body),design.id+' has a distinct physical silhouette or semantic face');bodies.add(body);
 }
 assert.ok(total<128*1024,'the full 29-item collection stays under128KiB');
 assert.deepEqual(await buildEquipmentVectorArt({check:true}),{items:29,bytes:total});
});

test('native raster export preserves authored source vector thumbnails',async()=>{
 const exporter=await readFile(new URL('../scripts/render-native-designs.py',import.meta.url),'utf8');
 assert.match(exporter,/authored_vector = target\.exists\(\) and 'data-native-vector=' in target\.read_text\(\)/);
 assert.match(exporter,/if not authored_vector:\s+target\.write_text\(svg\)/);
});
