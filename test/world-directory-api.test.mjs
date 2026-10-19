import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {UserJsonDatabase} from '../user-json-database.mjs';

test('public atlas and environment API list repository maps, uploads, user maps and deed destinations from the same saved directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'world-api-')),previous={...process.env};
 Object.assign(process.env,{MUZIKAZ_DATA_DIR:dir,MUZIKAZ_USER_DATABASE_FILE:join(dir,'users.json'),MUZIKAZ_ACCOUNTS_FILE:join(dir,'accounts.json'),MUZIKAZ_PAYMENT_ORDERS_FILE:join(dir,'orders.json'),MUZIKAZ_CUSTOM_MAPS_FILE:join(dir,'custom-maps.json'),MUZIKAZ_ENVIRONMENT_DATA_FILE:join(dir,'environments.json')});
 try{
  await writeFile(join(dir,'custom-maps.json'),JSON.stringify([{id:'saved-layout',name:'Alice saved layout',source:'custom-builder',ownerId:'account:alice',ownerName:'Alice',visibility:'public',builderScene:{layout:'grand-floor',objects:[]}}]));
  await writeFile(join(dir,'environments.json'),JSON.stringify([{id:'uploaded-room',name:'Uploaded room',visibility:'public',modelUrl:'/uploads/environments/test.glb'},{id:'hidden-room',name:'Hidden room',visibility:'private',modelUrl:'/uploads/hidden.glb'}]));
  const db=new UserJsonDatabase(join(dir,'users.json'));await db.put('alice',{tokens:{MZK:5000},memory:{profile:{displayName:'Alice'}}});const deed=await db.claimLand({walletId:'alice',worldId:'volt-city',name:'Volt home',priceMzk:4000,requestId:'purchase'});await db.configurePlot('alice',deed.id,{environmentId:'saved-layout',name:'Alice estate'});
  const original=await readFile(new URL('../server.mjs',import.meta.url),'utf8'),source=original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`).replace(/server\.listen\(port,[^\n]+\);/,'export {server};').replace(/\nsnapshotServer\(\)\.catch[^\n]+/,'').replace(/\nbackgroundJob\(\(\)=>snapshotServer\(\)\);/,'');
  const filename=join(dir,'server-handler.mjs');await writeFile(filename,source);const {server}=await import(pathToFileURL(filename).href),handler=server.listeners('request')[0];
  async function get(url){const req=Readable.from([]);Object.assign(req,{url,method:'GET',headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});const out={};const res={setHeader(){},getHeader(){},writeHead(status){out.status=status;this.headersSent=true;},end(data){out.body=JSON.parse(data);}};await handler(req,res);assert.equal(out.status,200);return out.body.data;}
  const atlas=await get('/api/world-atlas'),maps=await get('/api/environments'),ids=new Set(atlas.locations.map(place=>place.mapId));
  const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
  for(const map of repository.filter(map=>map.visibility!=='private'&&map.playable!==false))assert.ok(ids.has(map.id),'repository map '+map.id+' is indexed');
  for(const id of ['saved-layout','uploaded-room','plot-'+deed.id])assert.ok(ids.has(id),id+' is indexed');assert.ok(!ids.has('hidden-room'));
  const arena=maps.find(map=>map.id==='basketball-arena'),arenaLocation=atlas.locations.find(place=>place.mapId==='basketball-arena');assert.ok(arena.permanent&&arena.publicDestination&&arena.sharedWorld);assert.equal(arena.canDelete,false);assert.equal(arena.canEdit,false);assert.equal(arena.roomId,'basketball-arena');assert.equal(arenaLocation.permanent,true);assert.equal(arenaLocation.thumbnailUrl,'/public/images/backpack/basketball-arena.svg');
  const range=maps.find(map=>map.id==='firing-range'),rangeLocation=atlas.locations.find(place=>place.mapId==='firing-range');assert.ok(range.permanent&&range.publicDestination&&range.sharedWorld&&range.multiplayer);assert.equal(range.canDelete,false);assert.equal(range.canEdit,false);assert.equal(range.roomId,'firing-range');assert.equal(rangeLocation.permanent,true);assert.equal(rangeLocation.thumbnailUrl,'/public/images/backpack/firing-range.svg');assert.match(rangeLocation.playUrl,/environment=firing-range/);assert.ok(atlas.connections.some(edge=>edge.from===rangeLocation.districtId&&edge.to===range.id));
  const plot=atlas.locations.find(place=>place.deedId===deed.id);assert.equal(plot.ownerName,'Alice');assert.equal(plot.kind,'deed');assert.equal(plot.baseEnvironmentId,'saved-layout');assert.ok(atlas.connections.some(edge=>edge.from===plot.districtId&&edge.to===plot.mapId));
  const district=maps.find(map=>map.id===plot.districtId);assert.ok(district.builderScene.objects.some(object=>object.atlasDestination===plot.mapId));assert.ok(maps.find(map=>map.id===plot.mapId).builderScene);
 }finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});}
});
