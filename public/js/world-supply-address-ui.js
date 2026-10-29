const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function factoryAddressOrderUrl(addressId,{itemId}={}){
 const query=new URLSearchParams({environment:'world-item-factory',autoplay:'1',supplyAddress:String(addressId||'')});
 if(itemId)query.set('supplyItem',String(itemId));
 return 'model-explorer.html?'+query.toString();
}
export function supplyAddressRecords(value){return Array.isArray(value)?value:value&&typeof value==='object'?Object.values(value):[];}
export function supplyAddressOwner(address={}){return address.owner?.name||address.ownerName||'Public world facility';}
export function supplyAddressMatches(address,query=''){
 const words=String(query).trim().toLowerCase().split(/\s+/).filter(Boolean),text=[address.name,address.addressLine,address.mapName,address.kind,supplyAddressOwner(address)].filter(Boolean).join(' ').toLowerCase();
 return words.every(word=>text.includes(word));
}
export function supplyAddressLabel(address={}){return [address.name||'Delivery address',address.addressLine].filter(Boolean).join(' · ');}
export function supplyAddressMarkup(address,{compact=false}={}){
 if(!address)return '<p class="supply-muted">Choose a public store, building or plot entrance to review its receiving address.</p>';
 const position=address.dropoff?.position||address.position,coordinates=position&&['x','y','z'].every(axis=>Number.isFinite(position[axis]))?'X '+position.x.toFixed(1)+' · Y '+position.y.toFixed(1)+' · Z '+position.z.toFixed(1):'';
 return '<article class="supply-address-card" data-receiving-address="'+esc(address.id)+'"><strong>'+esc(address.name||'Delivery address')+'</strong><span>'+esc(address.addressLine||address.mapName||address.mapId)+'</span><span>Owner / recipient: '+esc(supplyAddressOwner(address))+'</span>'+(compact?'':'<small>'+esc([address.mapName||address.mapId,coordinates].filter(Boolean).join(' · '))+'</small><p>Any signed-in sender can order supplies using their own MZK. Shipment stock reaches this map after the receiving drop-off; it does not transfer property ownership.</p>')+(address.canOrder===false?'<small>This address is currently unavailable for new orders.</small>':'')+'</article>';
}
export function supplyAddressRoute(data,addressId){return supplyAddressRecords(data?.deliveryRoutes).find(route=>route.addressId===addressId)||null;}
export function deliveryObjectId(node){
 let localId=null;
 for(let current=node;current;current=current.parent){
  if(!localId&&typeof current.userData?.deliveryAddressLocalId==='string')localId=current.userData.deliveryAddressLocalId;
  const id=current.userData?.builderObjectId||current.userData?.sharedId||current.userData?.authoredObjectId;
  if(typeof id==='string'&&id)return localId?id+'/'+localId:id;
 }
 return localId;
}
