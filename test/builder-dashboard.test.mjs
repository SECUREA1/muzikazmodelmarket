import test from 'node:test';
import assert from 'node:assert/strict';
import {builderSections,libraryModels,libraryCounts} from '../public/js/builder-library.js';

test('dashboard categories separate media, shops, seating and shared arcade aliases by their authored use',()=>{
 const models=[
  {id:'custom-audio',buildAssetId:'media-boombox',name:'Music'},
  {id:'custom-screen',function_data:{device:'shared-video-player'},name:'Screen'},
  {id:'photo',buildAssetId:'digital-photo-frame',name:'Frame'},
  {id:'shop',buildAssetId:'market-atm',name:'Shop'},
  {id:'seat',behavior:'seat',name:'Bench'},
  {id:'custom-arcade',function_data:{device:'commons-arcade'},name:'Games'},
  {id:'plain',category:'props',name:'Prop'}
 ];
 for(const [category,ids]of [['audio',['custom-audio']],['video',['custom-screen','photo']],['services',['shop']],['seating',['seat']],['arcade',['custom-arcade']]]){
  assert.deepEqual(libraryModels(models,category).map(m=>m.id),ids);assert.equal(libraryCounts(models)[category],ids.length);
 }
 assert.ok(builderSections(models[5]).has('interactive'));
 assert.deepEqual(libraryModels(models,'audio','Frame'),[]);
 assert.equal(libraryModels(models,'all').length,models.length);
});
