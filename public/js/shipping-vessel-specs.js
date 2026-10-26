// Metres at the waterline. Physics, collision and the bridge camera share these
// dimensions, so the rendered stern never slips through a quay or another ship.
export const SHIPPING_VESSELS=Object.freeze({
 'shipping-feeder':Object.freeze({name:'Gulf Feeder',beam:6.4,length:20,height:7.4,speed:10,turnRate:.27,thrust:18,seat:Object.freeze([0,5.4,5]),capacity:12,slots:4}),
 'shipping-container':Object.freeze({name:'Strait Container Carrier',beam:10,length:40,height:11.5,speed:11,turnRate:.18,thrust:20,seat:Object.freeze([0,8.4,13]),capacity:30,slots:8}),
 'shipping-tanker':Object.freeze({name:'Oman Product Tanker',beam:11,length:46,height:12.5,speed:9,turnRate:.15,thrust:18,seat:Object.freeze([0,9.4,16]),capacity:48,slots:12})
});
export const shippingVesselType=actor=>SHIPPING_VESSELS[typeof actor==='string'?actor:actor?.modelId||actor?.asset?.buildAssetId]||null;
export const isShippingVessel=actor=>!!shippingVesselType(actor);
