import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeCatalogModel} from '../public/js/builder-catalog.js';
test('free builder catalogue accepts models, procedural assets and SVG props without ownership',()=>{
 assert.equal(normalizeCatalogModel({id:'free',glb_url:'/free.glb'},0).modelUrl,'/free.glb');
 assert.equal(normalizeCatalogModel({id:'sofa',buildAssetId:'sofa'},0).buildAssetId,'sofa');
 const image=normalizeCatalogModel({id:'art',format:'svg',thumbnailUrl:'/art.svg'},0);
 assert.equal(image.renderKind,'image');assert.equal(image.imageUrl,'/art.svg');
 assert.equal(normalizeCatalogModel({id:'private',modelUrl:'/p.glb',visibility:'private'},0),null);
});
test('toolkit SVG assets retain their exact images for placement and publishing',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../public/models/toolkit-assets.json',import.meta.url)));
 const images=manifest.assets.filter(asset=>asset.format==='svg');assert.ok(images.length>0);
 for(const asset of images){const model=normalizeCatalogModel(asset,0);assert.ok(model);assert.equal(model.imageUrl,asset.thumbnailUrl);}
});
