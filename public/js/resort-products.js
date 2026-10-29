import {NATIVE_DESIGN_VERSION,nativeDesignThumbnail} from './native-design-profile.js';
// One catalogue for native 3D products, shop prices, saved props and public rooms.
const product=(id,name,collection,shape,dimensions,priceMzk,behavior,description,device=null)=>({id,name,collection,shape,dimensions,priceMzk,behavior,description,device});
export const RESORT_PRODUCTS=Object.freeze(Object.fromEntries([
 product('alpine-ski-service','Alpine Ski Valet','Alpine Luxury','locker',[2.4,2.3,.8],240,'interact','A walnut and brass ski rack. At Pixel Peaks, use it to equip or return skis.'),
 product('alpine-race-board','Alpine Club Noticeboard','Alpine Luxury','screen',[2.4,2.1,.65],320,'interact','Post shared race meetups and mountain club messages.','community-noticeboard'),
 product('alpine-first-aid','Alpine Recovery Cabinet','Alpine Luxury','aid',[1.1,1.7,.65],220,'heal','Use nearby to recover 25 health, with a 30-second cooldown.'),
 product('alpine-velvet-chaise','Alpine Velvet Chaise','Alpine Luxury','chaise',[2.5,1.15,1],180,'seat','A usable velvet chaise with walnut framing and brass feet.'),
 product('alpine-marble-hearth','Alpine Marble Hearth','Alpine Luxury','hearth',[2.8,1.9,.85],360,'decor','A sculpted marble fireplace with glowing flames and brass trim.'),
 product('alpine-lounge-jukebox','Alpine Listening Console','Alpine Luxury','console',[1.8,1.3,.75],300,'interact','Queue and control shared lodge music through the room audio system.','shared-jukebox'),
 product('tideglass-daybed','Tideglass Marina Daybed','Tideglass Luxury','chaise',[2.5,1.15,1],190,'seat','A usable ivory daybed with teak framing and champagne metalwork.'),
 product('tideglass-cinema','Tideglass Cinema Cabinet','Tideglass Luxury','screen',[2.4,2.1,.65],420,'interact','Upload or queue a video for the yacht club shared screen.','shared-video-player'),
 product('tideglass-dj-console','Tideglass Club Mixing Desk','Tideglass Luxury','console',[1.8,1.3,.75],400,'interact','Queue audio and adjust the club shared playback and volume.','dj-mixing-deck'),
 product('tideglass-concierge','Tideglass Concierge Market','Tideglass Luxury','kiosk',[1.3,1.9,.8],280,'interact','Open the live item marketplace and your own Backpack.','market-atm'),
 product('tideglass-planter','Tideglass Palm Planter','Tideglass Luxury','planter',[2,2.5,2],120,'decor','A sculpted brass planter with layered tropical foliage.'),
 product('tideglass-marble-table','Tideglass Marble Table','Tideglass Luxury','table',[1.8,.65,1],140,'decor','A veined stone lounge table with a recessed brass pedestal.'),
 product('aerie-vip-sofa','Aerie Executive Sofa','Aerie Luxury','sofa',[2.6,1.15,1],210,'seat','A usable upholstered airport club sofa with champagne trim.'),
 product('aerie-flight-board','Aerie Flight Club Board','Aerie Luxury','screen',[2.4,2.1,.65],320,'interact','Share flight plans and meetups on the public club noticeboard.','community-noticeboard'),
 product('aerie-executive-screen','Aerie Executive Media Wall','Aerie Luxury','screen',[2.4,2.1,.65],420,'interact','A shared video screen for the airport executive lounge.','shared-video-player'),
 product('aerie-club-radio','Aerie Club Radio','Aerie Luxury','console',[1.8,1.3,.75],300,'interact','Tune and share a direct audio stream with nearby club visitors.','radio-console'),
 product('aerie-boarding-kiosk','Aerie Equipment Concierge','Aerie Luxury','kiosk',[1.3,1.9,.8],280,'interact','Shop equipment and access your own Backpack before departure.','item-vending-machine'),
 product('aerie-coffee-table','Aerie Onyx Coffee Table','Aerie Luxury','table',[1.8,.65,1],150,'decor','A dark stone table with brass edging for executive seating areas.')
].map(item=>[item.id,item])));
export function resortProductSettings(product){return {behavior:product.behavior,interactionDistance:4,prompt:'Use '+product.name,destructible:false,...(product.device?{device:product.id}:{}),...(product.behavior==='seat'?{seatOffset:[0,.62,0],exitOffset:[0,0,1.6]}:{}),...(product.behavior==='heal'?{value:25,cooldown:30}:{})};}
export function resortProductPlacement(id,modelId,x,y,z,rotationY=0){const product=RESORT_PRODUCTS[modelId];if(!product)throw Error('Unknown resort product: '+modelId);return {id,modelId,name:product.name,placementAnchor:'collider-base',position:{x,y,z},rotation:{x:0,y:rotationY,z:0},scale:{x:1,y:1,z:1},functionalSettings:resortProductSettings(product)};}
export function resortBackpackProducts(){return Object.values(RESORT_PRODUCTS).map(product=>({id:'backpack-'+product.id,name:product.name,owner:'MUZIKAZ',type:'props',buildAssetId:product.id,builderCategory:product.behavior==='decor'?'props':'interactive',thumbnailUrl:nativeDesignThumbnail(product.id),visualDesign:{version:NATIVE_DESIGN_VERSION,thumbnailUrl:nativeDesignThumbnail(product.id)},format:'procedural-3d',visibility:'public',collection:product.collection,productTier:'luxury',priceMzk:product.priceMzk,description:product.description,behavior:product.behavior,function_data:resortProductSettings(product)}));}
