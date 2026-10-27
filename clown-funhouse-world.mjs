import {FUNHOUSE_ID,FUNHOUSE_STATIONS,FUNHOUSE_LOCATIONS} from './public/js/clown-funhouse-config.js';
import {funhouseNativeComponents} from './public/js/clown-funhouse-builder.js';

export function clownFunhouseWorld(){
 return {
  id:FUNHOUSE_ID,name:'Midnight Laughs Funhouse',label:'Horror house · clown carnival & splash games',
  description:'A complete spooky clown carnival with a giant grinning horror house, crooked mirror maze, monster ball pit, surprise jack-in-the-box, impossible clown car, dizzy hat spinner, propeller hats, giant clown shoes and a playable water-gun gallery. Explore the neon midway with friends and meet the clown hosts.',
  category:'Funhouse & carnival',game:'funhouse',indoor:true,outdoor:false,worldId:'crew-plaza',mapColor:'#e56ca8',
  permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,
  ownerId:'muzikaz',ownerName:'MUZIKAZ',scale:1,spaceScale:1,playableSize:120,
  thumbnailUrl:'/public/images/funhouse/midnight-laughs.svg',spawn:{x:0,y:.02,z:48,rotationY:0},streets:[],
  funhouse:{enabled:true,stations:FUNHOUSE_STATIONS},
  builderScene:{version:3,name:'Midnight Laughs Funhouse',layout:'clown-funhouse',mapSize:120,objects:[],nativeComponents:funhouseNativeComponents(),weather:'clear',layoutMeta:{color:0x24152e,sky:0x100c21,locations:FUNHOUSE_LOCATIONS,funhouse:{enabled:true}},gameplay:{multiplayer:true,friendlyFire:false,radTox:false,funhouse:{enabled:true}}},
  playUrl:'model-explorer.html?environment='+FUNHOUSE_ID+'&house='+FUNHOUSE_ID+'&mode=multiplayer&autoplay=1'
 };
}
