import {writeFile} from 'node:fs/promises';
import {authoredPublicWorlds} from './audit-world-items.mjs';
import {mapDeliveryAddresses,publicDeliveryAddress,deliveryAddressId} from '../world-delivery-addresses.mjs';
import {ENTERABLE_BUILDINGS} from '../public/js/building-districts.js';
import {memberPlotEnvironment} from '../member-plots.mjs';
import {LAND_LOTS} from '../public/js/land-lots.js';

// Inspect authored public records only. No game state, ownership or stock is
// created; live placed stores are covered separately by API/browser tests.
const worlds=await authoredPublicWorlds(),data={users:{},landDeeds:{}},results=[],failures=[];
for(const map of worlds){
 const addresses=mapDeliveryAddresses(data,map),ids=new Set(addresses.map(address=>address.id));
 if(!ids.has(deliveryAddressId(map.id,'entrance')))failures.push({mapId:map.id,reason:'Missing map delivery entrance'});
 for(const item of map.builderScene?.objects||map.placementScene?.objects||[]){
  const modelId=item.asset?.buildAssetId||item.buildAssetId||item.modelId;
  if(!ENTERABLE_BUILDINGS[modelId]||item.hidden||item.deleted||item.active===false||item.visible===false)continue;
  if(!ids.has(deliveryAddressId(map.id,item.id)))failures.push({mapId:map.id,objectId:item.id,reason:'Missing authored building address'});
 }
 for(const address of addresses){
  const record=publicDeliveryAddress(address);
  if(!record.owner?.name||!record.addressLine||!['x','y','z'].every(axis=>Number.isFinite(record.dropoff?.position?.[axis])))failures.push({mapId:map.id,addressId:address.id,reason:'Invalid owner, address or receiving point'});
  if('recipientId' in record)failures.push({mapId:map.id,addressId:address.id,reason:'Internal recipient identity exposed'});
 }
 if(ids.size!==addresses.length)failures.push({mapId:map.id,reason:'Duplicate address identity'});
 results.push({mapId:map.id,addresses:addresses.length,stores:addresses.filter(address=>address.kind==='store').length,buildings:addresses.filter(address=>address.kind==='building').length});
}
for(const lot of LAND_LOTS){
 const deed={id:'audit-'+lot.id,name:lot.name,status:'active',ownerId:'address-audit-owner',lot,hostedSpace:{environmentId:lot.mapId}};
 const map=memberPlotEnvironment(deed,worlds),snapshot={users:{'address-audit-owner':{memory:{profile:{displayName:'Audit deed holder'}}}},landDeeds:{[lot.id]:deed}},addresses=mapDeliveryAddresses(snapshot,map),entrance=addresses.find(address=>address.objectId==='entrance');
 if(!entrance||entrance.deedId!==deed.id||entrance.owner.name!=='Audit deed holder'||entrance.dropoff.mapId!==map.id)failures.push({mapId:map.id,reason:'Incorrect regional deed receiving address'});
}
const report={maps:results.length,addresses:results.reduce((sum,row)=>sum+row.addresses,0),stores:results.reduce((sum,row)=>sum+row.stores,0),buildings:results.reduce((sum,row)=>sum+row.buildings,0),regionalPlots:LAND_LOTS.length,failures,results};
const index=process.argv.indexOf('--report');if(index>=0&&process.argv[index+1])await writeFile(process.argv[index+1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,results:undefined},null,2));if(failures.length)process.exitCode=1;
