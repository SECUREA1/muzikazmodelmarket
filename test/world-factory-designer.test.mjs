import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryDesignerModels,factoryDesignerConfiguration} from '../public/js/world-factory-designer.js';

test('factory designer offers only owned, usable model identities and deduplicates model URLs',()=>{
 const owned={id:'owned-a',name:'Owned phone',modelUrl:'/public/models/phone.glb'},copy={...owned,id:'owned-b'},custom={id:'custom-owned',modelUrl:'https://models.example/item.gltf?v=3'};
 const rejected=[{id:'javascript',modelUrl:'javascript:alert(1).glb'},{id:'data',modelUrl:'data:model/gltf-binary;base64,aaa.glb'},{id:'protocol-relative',modelUrl:'//outside.example/a.glb'},{id:'windows',modelUrl:'public\\models\\a.glb'},{id:'control',modelUrl:'/model\n.glb'},{id:'drawing',modelUrl:'/item.png'},{id:'earned',modelUrl:'/earned.glb',earnedOnly:true},{id:'bound',modelUrl:'/bound.glb',tradable:false},{id:'portstock',modelUrl:'/stock.glb',shippingSupplyId:'cargo'},null];
 assert.deepEqual(factoryDesignerModels([owned,copy,...rejected,custom]),[owned,custom]);
 assert.deepEqual(factoryDesignerModels(),[]);
 assert.equal(owned.buildAssetId,undefined,'choosing a model does not change the authoritative owned record');
});

test('factory design transforms stay inside gameplay bounds and keep drawings at their actual scale',()=>{
 const values={material:'custom-script',color:'url(javascript:bad)',colorBlend:200,scale:100,orientation:-1000,depth:10000,bevel:-7,behavior:'grant-money'};
 const model=factoryDesignerConfiguration(values,true),drawing=factoryDesignerConfiguration(values);
 assert.equal(model.material,'original');assert.equal(model.color,'#89dac6');assert.equal(model.colorBlend,100);assert.equal(model.scale,5);assert.equal(model.orientation,-360);assert.equal(model.depth,100);assert.equal(model.bevel,0);assert.equal(model.behavior,'decor');
 assert.equal(drawing.scale,1,'drawing dimensions match the geometry/collision renderer');
 const valid=factoryDesignerConfiguration({material:'metal',color:'#F0ab12',colorBlend:72,scale:1.8,orientation:45,depth:32,bevel:4,behavior:'pickup'},true);
 assert.equal(valid.material,'metal');assert.equal(valid.color,'#F0ab12');assert.equal(valid.scale,1.8);assert.equal(valid.behavior,'pickup');assert.equal(valid.groundAligned,true);assert.equal(valid.extruded,true);
});
