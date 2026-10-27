import {cleanWallet} from './user-json-database.mjs';
import {SHIPPING_ID} from './public/js/shipping-config.js';
import {bindFactoryShipping,returnFactoryShipping} from './server-factory-logistics.mjs';

const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
const active=job=>job&&['loading','secured','sailing','unloading'].includes(job.phase);

/** Only a staged, durable manifest makes the Atlas voyage available. This is
 * account state for the operator; public port boards never expose its item id. */
export function factoryShippingExportState(data,wallet){
 const store=data.factoryLogistics,id=store?.accounts?.[wallet]?.activeManifestId,manifest=store?.manifests?.[id];
 if(!manifest||manifest.walletId!==wallet||manifest.destinationId!=='atlas-export'||manifest.status!=='staged')return null;
 return {manifestId:manifest.id,name:manifest.itemName||manifest.name||'Certified Atlas model',status:manifest.status};
}

/** Called immediately after the room has accepted an authored Atlas route.
 * Failed binding cancels that new runtime job; the staged model stays sealed. */
export async function bindFactoryShippingVoyage(database,walletId,player,command={},now=Date.now()){
 const wallet=cleanWallet(walletId),job=player.shipping?.job;
 if(job?.contractId!=='atlas-export')return null;
 if(job.environmentId!==SHIPPING_ID||job.phase!=='loading'||player.vehicleId!==job.vesselId||player.health<=0)fail('Accept the Atlas voyage aboard your cargo vessel at Jebel Ali.');
 const manifest=await database.transaction(data=>{
  const ready=factoryShippingExportState(data,wallet),manifestId=command.manifestId||ready?.manifestId;
  if(!manifestId)fail('Stage a certified factory model at the Atlas export desk before accepting this voyage.');
  return bindFactoryShipping(data,wallet,{manifestId,deliveryId:job.id,contractId:job.contractId,now});
 });
 job.factoryManifestId=manifest.id;
 return manifest;
}

/** Existing freight cancels on travel, leaving the vessel or disconnecting.
 * Keep the model sealed until its owner collects it from the export desk. */
export async function reconcileFactoryShippingVoyage(database,walletId,player,now=Date.now()){
 const wallet=cleanWallet(walletId);
 const returned=await database.transaction(data=>{
  const store=data.factoryLogistics,id=store?.accounts?.[wallet]?.activeManifestId,manifest=store?.manifests?.[id];
  if(!manifest||manifest.walletId!==wallet||manifest.status!=='in-transit')return null;
  const job=player?.shipping?.job;
  if(active(job)&&job.id===manifest.voyageId&&job.contractId==='atlas-export'&&job.factoryManifestId===manifest.id)return null;
  return returnFactoryShipping(data,wallet,{manifestId:manifest.id,deliveryId:manifest.voyageId,reason:'The sea voyage ended before verified unloading. Return to the Jebel Ali Atlas export desk to recover the sealed model.',now});
 });
 if(player?.shipping?.job&&!active(player.shipping.job))delete player.shipping.job.factoryManifestId;
 return returned;
}
