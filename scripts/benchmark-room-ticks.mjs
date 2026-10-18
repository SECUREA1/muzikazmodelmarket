// Run with an optional baseline module path to compare room-store revisions.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const moduleUrl=process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../shared-room-store.mjs',import.meta.url);
const {SharedRoomStore}=await import(moduleUrl);
const fixture={};
for(let i=0;i<100;i++)fixture['world-'+i]={revision:1,objects:Object.fromEntries(Array.from({length:200},(_,j)=>['item-'+j,{id:'item-'+j,position:[j,0,j],scale:[1,1,1],rotation:[0,0,0],paint:[123,456],materialId:'brick'}]))};
fixture.active={revision:1,objects:{},simulation:{players:{alice:{position:{x:0,y:0,z:0}}}}};
// Measure the in-memory tick only; this benchmark never writes its fixture.
const store=new SharedRoomStore('/tmp/unused-room-tick-benchmark.json');store.data=structuredClone(fixture);
const start=performance.now();for(let i=0;i<30;i++)await store.updateMany(['active'],room=>{room.simulation.players.alice.position.x++;});
console.log(JSON.stringify({storedWorlds:101,savedObjects:20000,ticks:30,millisecondsPerTick:Number(((performance.now()-start)/30).toFixed(3))}));
