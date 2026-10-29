import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {publicProductVisual,publicProductFunctionData} from '../public-product-visual.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {previewDescriptor,previewModelSource} from '../public/js/market-item-preview.js';

const secret='PRIVATE-CREDENTIAL-SENTINEL';
const stroke={tool:'rectangle',width:12,points:[{x:120,y:90},{x:310,y:240}]};
const generated={generated:true,generator:'bottle',registry:{materials:{color:'#ab3281',token:secret},wallet:secret},configuration:{material:'wood',color:'#ba792a',scale:1.4,token:secret,session:{value:secret}},function_data:{behavior:'decor',action:'none',password:secret},ownerId:secret};

test('public product visuals retain render inputs without exposing arbitrary saved configuration',()=>{
 const result=publicProductVisual(generated);assert.equal(result.generated,true);assert.equal(result.generator,'bottle');assert.deepEqual(result.registry,{materials:{color:'#ab3281'}});assert.deepEqual(result.drawingSettings,{scale:1.4,material:'wood',color:'#ba792a'});assert.equal(JSON.stringify(result).includes(secret),false);assert.equal('configuration' in result,false);assert.equal('function_data' in result,false);assert.equal(previewModelSource(previewDescriptor(result)),'generated');
 const drawing=publicProductVisual({form:'sculpted',strokes:[stroke],drawingSettings:{depth:.45,bevel:.04,material:'metal',credential:secret},color:'#4488dd'});assert.deepEqual(drawing.strokes,[stroke]);assert.deepEqual(drawing.drawingSettings,{depth:.45,bevel:.04,material:'metal'});assert.equal(previewModelSource(previewDescriptor(drawing)),'drawing');assert.equal(previewDescriptor(drawing).form,'sculpted');
 const image=publicProductVisual({renderKind:'image',format:'png',thumbnailUrl:'/public/images/custom.png',configuration:{depth:28,bevel:6,extruded:true,depthMode:'relief',prompt:secret,quest:{password:secret}}});assert.equal(image.artwork,'/public/images/custom.png');assert.equal(previewModelSource(previewDescriptor(image)),'image');assert.equal(JSON.stringify(image).includes(secret),false);
 const layout=publicProductVisual({builderLayoutId:'mountain-pass'});assert.equal(previewModelSource(previewDescriptor(layout)),'layout');assert.deepEqual(publicProductVisual({visibility:'private',...generated}),{});
 assert.deepEqual(publicProductFunctionData({buildAssetId:'sofa',modelId:'native:sofa',device:'shared-video-player',behavior:'seat',action:'none',authorization:secret,configuration:{token:secret}}),{buildAssetId:'sofa',modelId:'native:sofa',device:'shared-video-player',behavior:'seat',action:'none'});
});

test('visual geometry and artwork metadata are finite, bounded and detached from source records',()=>{
 const source={strokes:Array.from({length:100},()=>({tool:'pencil',width:1e9,token:secret,points:Array.from({length:500},(_,index)=>({x:index*1000,y:-index*1000,password:secret}))})),drawingSettings:{depth:Infinity,bevel:-5,scale:200,orientation:10000,mirrored:true,collisionMask:[secret]},registry:{materials:{color:'#123456',apiKey:secret}},artwork:'https://images.test/custom.png?access_token='+secret};
 const result=publicProductVisual(source);assert.equal(result.strokes,undefined,'an oversized drawing never becomes a different truncated shape');assert.equal(result.previewCard,true);assert.equal(result.previewNote,'Detailed drawing: product card preview');assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(result.artwork,undefined);assert.equal(result.drawingSettings.depth,undefined);assert.equal(result.drawingSettings.bevel,0);assert.equal(result.drawingSettings.scale,5);
 for(const artwork of ['blob:https://site.test/local','javascript:alert(1)','data:text/html,evil','https://user:password@images.test/image.png','//images.test/image.png'])assert.equal(publicProductVisual({artwork}).artwork,undefined);
 assert.deepEqual(publicProductVisual({generator:'run-script',builderLayoutId:'../private',form:'run-html',strokes:[{tool:'script',points:stroke.points}]}),{previewCard:true,previewNote:'Detailed drawing: product card preview'});
});

test('long valid drawing strokes remain exact and unsupported drawings never expose partial geometry',()=>{
 const points=Array.from({length:200},(_,index)=>({x:-120+index*.37,y:340+Math.sin(index)*20})),source={form:'sculpted',strokes:[{tool:'pencil',width:14.5,points}]},result=publicProductVisual(source);
 assert.deepEqual(result.strokes,source.strokes,'a valid 200-point stroke keeps every original point and width');assert.equal(result.previewCard,undefined);assert.equal(previewModelSource(previewDescriptor(result)),'drawing');result.strokes[0].points[0].x=99;assert.equal(source.strokes[0].points[0].x,-120,'public point data is detached from the saved drawing');
 const edgePoints=Array.from({length:2048},(_,index)=>({x:index,y:0}));assert.deepEqual(publicProductVisual({strokes:[{tool:'pencil',width:5,points:edgePoints}]}).strokes[0].points,edgePoints,'the full supported point budget is retained');
 const invalids=[
  [{tool:'pencil',width:5,points:Array.from({length:2050},(_,index)=>({x:index,y:0}))}],
  Array.from({length:65},()=>stroke),
  [{...stroke,width:201}],
  [{...stroke,points:[...stroke.points,{x:4097,y:5}]}],
  [{...stroke,points:[...stroke.points,{x:Infinity,y:5}]}],
  [stroke,{tool:'script',points:stroke.points}]
 ];
 for(const strokes of invalids){const rejected=publicProductVisual({strokes});assert.equal(rejected.strokes,undefined);assert.equal(rejected.previewCard,true);assert.equal(rejected.previewNote,'Detailed drawing: product card preview');}
 const withModel=previewDescriptor({...publicProductVisual({strokes:invalids[0]}),modelUrl:'/public/models/actual-drawing.glb'});assert.equal(previewModelSource(withModel),'glb','an available complete model still wins over a product card');
});

test('active public player sales keep generated, drawing, image and layout visuals while private and inactive sales stay absent',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'public-sale-visual-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json'));
 const item=(id,visual,active=true)=>({id,name:id,type:'custom-item',...visual,listing:{active,priceMzk:35}});
 await database.put('visual-seller',{tokens:{MZK:100},items:[item('generated',generated),item('drawing',{form:'lightweight',strokes:[{...stroke,token:secret}],drawingSettings:{depth:.2,bevel:.01,secret}}),item('image',{format:'png',renderKind:'image',thumbnailUrl:'/public/images/custom.png',configuration:{extruded:true,depth:24,apiKey:secret}}),item('layout',{builderLayoutId:'mountain-pass'}),item('private',{visibility:'private',...generated}),item('inactive',generated,false)]});
 const before=await database.get('visual-seller'),listings=await database.marketListings(),byId=new Map(listings.map(item=>[item.itemId,item]));assert.equal(listings.length,4);assert.equal(previewModelSource(previewDescriptor(byId.get('generated'))),'generated');assert.equal(previewModelSource(previewDescriptor(byId.get('drawing'))),'drawing');assert.equal(previewModelSource(previewDescriptor(byId.get('image'))),'image');assert.equal(previewModelSource(previewDescriptor(byId.get('layout'))),'layout');assert.deepEqual(byId.get('generated').registry,{materials:{color:'#ab3281'}});assert.equal(JSON.stringify(listings).includes(secret),false);assert.deepEqual(await database.get('visual-seller'),before,'public catalog reading grants no ownership and rewrites no saved source configuration');
});

test('the anonymous combined market exposes only safe active Builder visual descriptions',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'public-builder-visual-')),previous={...process.env};let stopFixture;
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:directory,MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json'),MUZIKAZ_CUSTOM_MAPS_FILE:join(directory,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(directory,'environments.json'),MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatar-uploads'),MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'asset-uploads'),MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environment-uploads')});
 try{
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8'),source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server,userDatabase}; export async function stopFixture(){masterMaintenance=true;await drainServerState();}');
  const modulePath=join(directory,'server-fixture.mjs');await writeFile(modulePath,source);const fixture=await import(pathToFileURL(modulePath).href);stopFixture=fixture.stopFixture;
  await fixture.userDatabase.transaction(data=>{
   for(const [id,visibility,status]of [['public-generated','public','active'],['private-generated','private','active'],['inactive-generated','public','cancelled']]){
    data.builderAssets[id]={id,name:id,asset_usage:'game_builder',asset_type:'props',builder_category:'PROPS',visibility,function_data:{generated:true,generator:'bottle',registry:generated.registry,configuration:{password:secret},behavior:'decor',action:'none',apiKey:secret},configuration:generated.configuration};data.builderOwnership[id]={asset_id:id,owner_id:'visual-seller'};data.builderListings[id]={listing_id:id,asset_id:id,seller_id:'visual-seller',listing_status:status,price_mzk:35,created_at:'2026-10-29T00:00:00Z'};
   }
  });
  const handler=fixture.server.listeners('request')[0],request=Readable.from([]);Object.assign(request,{url:'/api/market/catalog',method:'GET',headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});
  const result={headers:{}};const response={setHeader(key,value){result.headers[key.toLowerCase()]=value;},getHeader(key){return result.headers[key.toLowerCase()];},writeHead(status,headers){result.status=status;for(const [key,value]of Object.entries(headers))this.setHeader(key,value);this.headersSent=true;},end(value){result.body=JSON.parse(value);}};await handler(request,response);assert.equal(result.status,200);
  const rows=result.body.data.filter(item=>item.source==='builder');assert.equal(rows.length,1);assert.equal(rows[0].id,'builder:public-generated');assert.equal(previewModelSource(previewDescriptor(rows[0])),'generated');assert.deepEqual(rows[0].asset.registry,{materials:{color:'#ab3281'}});assert.deepEqual(rows[0].asset.function_data,{behavior:'decor',action:'none'});assert.equal(JSON.stringify(rows).includes(secret),false);assert.equal('configuration' in rows[0].asset,false);
 }finally{await stopFixture?.();process.env=previous;await rm(directory,{recursive:true,force:true});}
});
