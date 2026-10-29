import {writeFile} from 'node:fs/promises';
import {authoredPublicWorlds} from './audit-world-items.mjs';
import {memberPlotEnvironment} from '../member-plots.mjs';
import {LAND_LOTS} from '../public/js/land-lots.js';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {planDeedDelivery} from '../world-delivery-routing.mjs';

// Dry-run only: exercise real authored collision without buying land, creating
// rooms, changing maps, reserving cargo or modifying player inventories.
const args=process.argv.slice(2),selected=args.includes('--map')?args[args.indexOf('--map')+1]:null,output=args.includes('--report')?args[args.indexOf('--report')+1]:null;
const worlds=await authoredPublicWorlds(),collision=new ServerBuilderCollision(),cases=[];
for(const base of worlds)if(!selected||base.id===selected){
 const deed={id:'audit-'+base.id,name:base.name,ownerId:'delivery-audit',status:'active',hostedSpace:{environmentId:base.id}};
 cases.push({base:base.id,deed,environment:memberPlotEnvironment(deed,worlds)});
}
if(!selected||selected==='deed-fields')for(const lot of LAND_LOTS){
 const deed={id:'audit-'+lot.id,name:lot.name,ownerId:'delivery-audit',status:'active',lot,hostedSpace:{environmentId:lot.mapId}};
 cases.push({base:lot.mapId,lotId:lot.id,deed,environment:memberPlotEnvironment(deed,worlds)});
}
const results=[];
try{
 for(const row of cases){
  const started=performance.now();let route,attempts=0;
  try{do{
   attempts++;route=planDeedDelivery({deed:row.deed,environment:row.environment,room:{objects:{}},portId:'muscat',now:0,collision});
   if(route.status==='ready'||!route.retryable)break;
   // Match the live service's retry policy for a transient calculation budget;
   // an obstructed floor or doorway never gets retried into a fictitious path.
   await new Promise(resolve=>setImmediate(resolve));
  }while(attempts<3);}
  catch(error){route={status:'blocked',reason:error.message};}
  const result={baseMapId:row.base,...(row.lotId?{lotId:row.lotId}:{}),status:route.status,accessMode:route.accessMode||'truck-and-courier',dropoff:route.dropoff,truckDistanceMeters:route.truckDistanceMeters||0,courierDistanceMeters:route.courierDistanceMeters||0,estimatedDurationMs:route.estimatedDurationMs||0,...(route.reason?{reason:route.reason}:{}),...(route.retryable?{retryable:true}:{}),attempts,calculationMs:Math.round(performance.now()-started)};
  results.push(result);console.log(result.baseMapId+(result.lotId?' / '+result.lotId:'')+': '+result.status+' · '+result.accessMode+(result.reason?' · '+result.reason:''));
  collision.releaseWorld(row.environment.id);
 }
}finally{collision.clearWorlds();}
const report={cases:results.length,ready:results.filter(row=>row.status==='ready').length,blocked:results.filter(row=>row.status!=='ready').length,results};
if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.cases,ready:report.ready,blocked:report.blocked}));
if(args.includes('--strict')&&report.blocked)process.exitCode=1;
