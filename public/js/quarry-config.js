export const QUARRY_ID='surface-mine-quarry';
export const QUARRY_MATERIALS=Object.freeze({
 sand:{name:'Screened garden sand',color:0xd9c68a,priceMzk:4},fines:{name:'Stone fines',color:0xb5aca0,priceMzk:3},stone:{name:'Screened garden stone',color:0x8d979a,priceMzk:6},crushed:{name:'Crushed stone aggregate',color:0x9ca8ac,priceMzk:5},topsoil:{name:'Screened seed-ready topsoil',color:0x624730,priceMzk:4},mulch:{name:'Organic mulch',color:0x765239,priceMzk:2}
});
export const quarryConfig=environment=>environment?.quarry||environment?.builderScene?.layoutMeta?.quarry||environment?.builderScene?.sourceQuarry||null;
export const QUARRY_MODEL_INFO=Object.freeze({
 'quarry-screening-plant':['Mobile Screening Plant','A vibrating twin-deck screen, feed hopper, guarded conveyor and sorting chutes.',[7,5,11]],
 'quarry-jaw-crusher':['Jaw Crusher','A guarded jaw crusher with flywheels, feed hopper and discharge belt.',[6,4.5,9]],
 'quarry-stacker':['Radial Stockpile Stacker','An articulated conveyor stacker with supports, rollers and discharge chute.',[4,6,16]],
 'quarry-conveyor':['Transfer Conveyor','A guarded transfer conveyor with moving rollers and mineral flow.',[2.5,3,12]],
 'quarry-garden-bed':['Prepared Quarry Garden Bed','Screened topsoil and mulch in a seed-ready raised garden bed.',[2.4,.35,2.4]],
 'quarry-gravel-pad':['Aggregate Path Section','A graded aggregate path or building base.',[2.4,.2,2.4]],
 'quarry-storage-bin':['Deed Aggregate Storage Bay','A recoverable material crib for deed inventory and construction jobs.',[2.4,1.3,2.4]]
});
export const quarryMaterialItem=key=>({id:'quarry:'+key,supplyId:'quarry:'+key,sku:'quarry:'+key,name:QUARRY_MATERIALS[key].name,description:'One cubic metre of finite quarry output for deed gardens, paths and construction.',kind:'aggregate',assetType:'materials',factoryVariant:true,renderKind:'image',quarryMaterial:key,priceMzk:QUARRY_MATERIALS[key].priceMzk,thumbnailUrl:'/public/images/construction/surface-mine-quarry.svg'});
