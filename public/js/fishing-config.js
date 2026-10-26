// One shared catalog and water-zone contract for the server, maps and tackle shop.
// Forgiving mobile pacing. The server owns these timings and the reel lease;
// client animation and local timers cannot advance a catch.
export const FISHING_RULES=Object.freeze({
 biteWindowMs:6000,reelLeaseMs:1500,castSpeedLimit:.6,sessionLimitMs:90000,
 baitWaitMs:Object.freeze([2000,4500]),lureWaitMs:Object.freeze([1500,3000]),
 dragEaseAt:.78,dragRecoverAt:.52
});
export const FISHING_GEAR=Object.freeze([
 {id:'fishing-rod',name:'Coastal Spinning Rod',kind:'rod',priceMzk:0,basic:true,icon:'🎣',color:'#79dfd2',description:'Starter spinning rod with working reel, guides and line. Cast from a fishing station or a marked shore.'},
 {id:'fishing-pro-rod',name:'Deepwater Carbon Rod',kind:'rod',priceMzk:120,icon:'🎣',color:'#ffc46b',description:'Carbon rod for difficult fish and longer controlled fights.'},
 {id:'fishing-bait',name:'Renewable Bait Tin',kind:'bait',baitType:'natural',priceMzk:0,basic:true,icon:'🪱',color:'#f2b886',description:'Reusable practice bait for freshwater and coastal fish.'},
 {id:'fishing-reel',name:'Precision Drag Reel',kind:'reel',priceMzk:90,icon:'⚙️',color:'#c3dae0',description:'A smooth adjustable drag reel for the fishing loadout.'},
 {id:'fishing-lure',name:'Silver Spoon Lure',kind:'bait',baitType:'lure',priceMzk:60,icon:'🐟',color:'#c7edff',description:'Reusable lure that attracts stronger fish.'},
 {id:'fishing-tackle-box',name:'Angler Tackle Box',kind:'tackle',priceMzk:80,icon:'🧰',color:'#e8b16c',description:'Organized hooks, floats and tackle for your fishing loadout.'},
 {id:'fishing-net',name:'Landing Net',kind:'net',priceMzk:45,icon:'🥅',color:'#a1dec9',description:'A landing net for bringing catches aboard.'}
].map(Object.freeze));
export const FISH_SPECIES=Object.freeze([
 {id:'perch',name:'Yellow Perch',water:'fresh',rarity:'common',weight:[.2,1.6],value:6,difficulty:.26},
 {id:'bass',name:'Largemouth Bass',water:'fresh',rarity:'uncommon',weight:[.8,5.5],value:12,difficulty:.48},
 {id:'trout',name:'Silver Lake Trout',water:'fresh',rarity:'rare',weight:[.6,7],value:18,difficulty:.65},
 {id:'carp',name:'Golden Carp',water:'fresh',rarity:'legendary',weight:[2,12],value:30,difficulty:.8},
 {id:'mackerel',name:'Harbor Mackerel',water:'salt',rarity:'common',weight:[.3,2],value:7,difficulty:.3},
 {id:'snapper',name:'Coral Snapper',water:'salt',rarity:'uncommon',weight:[1,6],value:14,difficulty:.5},
 {id:'tuna',name:'Bluefin Tuna',water:'salt',rarity:'rare',weight:[3,18],value:22,difficulty:.72},
 {id:'marlin',name:'Neon Marlin',water:'salt',rarity:'legendary',weight:[8,30],value:38,difficulty:.9}
].map(species=>Object.freeze({...species,weight:Object.freeze(species.weight)})));
export const FISHING_ZONES=Object.freeze([
 {id:'marina-fishing',name:'Marina Fishing Grounds',x:151,z:-37,radius:42,water:'salt',description:'Begin at Captain Mara’s pier. Anchor the Angler boat, choose a side and cast.'},
 {id:'beacon-reef',name:'Beacon Reef Fishing',x:260,z:80,radius:58,water:'salt',description:'Reef fish and ocean trophies beyond Beacon Island.'},
 {id:'palm-shoals',name:'Palm Shoals Fishing',x:-185,z:-125,radius:60,water:'salt',description:'A coastal fishing ground south of Palm Key.'},
 {id:'crescent-lake-fishing',name:'Crescent Lake Fishing',x:-390,z:280,radius:55,water:'fresh',description:'Perch, bass and rare golden carp in sheltered freshwater.'},
 {id:'silver-lake-fishing',name:'Silver Lake Fishing',x:430,z:-280,radius:47,water:'fresh',description:'Cool freshwater with trout and bass.'}
].map(Object.freeze));
export const FISHING_GUIDES=Object.freeze([
 {id:'captain-mara',name:'Captain Mara',role:'Fishing coach & tournament host',position:{x:124,y:0,z:-35},dialogue:'Welcome, angler! Use the free Coastal Spinning Rod and Renewable Bait Tin in Tools. Choose a fishing destination and sail there in the Angler. Once stopped, choose port or starboard and Cast; the boat anchors for you. Wait for a bite, tap Hook, then hold Reel. Automatic drag protects the line; releasing Reel lowers tension faster and keeps your progress. Keep a catch to sell it, or release it for conservation progress. Join the server fishing tournament before casting to compete with other anglers and AI rivals.'},
 {id:'ranger-reed',name:'Ranger Reed',role:'Freshwater fishing guide',position:{x:-446,y:0,z:276},dialogue:'Crescent Lake has perch, bass, trout and golden carp. Fish from the pier or take the lake Angler boat into the marked freshwater zone. Release trophy fish to build conservation progress.'}
].map(guide=>Object.freeze({...guide,position:Object.freeze(guide.position)})));
export const isFishingBoat=actor=>(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-fishing-boat';
export function fishingZones(environment){
 const harbor=environment?.builderScene?.layoutMeta?.harbor;
 return harbor?(Array.isArray(harbor.fishingZones)?harbor.fishingZones:FISHING_ZONES):[];
}
export function fishingZoneAt(environment,point,zoneId=null){
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.z))return null;
 return fishingZones(environment).find(zone=>(!zoneId||zone.id===zoneId)&&Math.hypot(point.x-zone.x,point.z-zone.z)<=(zone.radius||0))||null;
}
export function fishingStationPosition(boat,side='port'){
 const yaw=boat?.rotation?.y||0,x=side==='starboard'?1.15:-1.15,z=.8,position=boat?.position||{x:0,y:0,z:0};
 return {x:position.x+x*Math.cos(yaw)+z*Math.sin(yaw),y:(position.y||0)+.55,z:position.z-x*Math.sin(yaw)+z*Math.cos(yaw)};
}
