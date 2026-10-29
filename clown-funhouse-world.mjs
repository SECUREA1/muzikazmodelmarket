import {FUNHOUSE_ID,FUNHOUSE_STATIONS,FUNHOUSE_LOCATIONS} from './public/js/clown-funhouse-config.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES,FUNHOUSE_ADVENTURE_RULES} from './public/js/funhouse-adventure-rules.js';
import {funhouseNativeComponents} from './public/js/clown-funhouse-builder.js';

export function clownFunhouseWorld(){
 return {
  id:FUNHOUSE_ID,name:'Midnight Laughs Funhouse',label:'Night Watch · haunted clown carnival',
  description:'A complete spooky clown carnival with a giant grinning horror house, crooked mirror maze, monster ball pit, surprise jack-in-the-box, impossible clown car, dizzy hat spinner, propeller hats, giant clown shoes and a playable water-gun gallery. Follow the six-clue Lost Laugh Trail through a lantern-lit midway, whispering wardrobe, clockwork theatre and haunted playroom. Brave the three-minute Night Watch to seal four haunted lanterns as shadow clowns, watching portraits and eerie whispers lead to a final ringmaster reveal. Enjoy original clown voices and carnival music with clear first-person views and tracked VR controls.',
  category:'Funhouse & carnival',game:'funhouse',indoor:true,outdoor:false,worldId:'crew-plaza',mapColor:'#e56ca8',
  permanent:true,publicDestination:true,proceduralLand:true,source:'repository',visibility:'public',playable:true,multiplayer:true,canDelete:false,canEdit:false,
  ownerId:'muzikaz',ownerName:'MUZIKAZ',scale:1,spaceScale:1,playableSize:120,
  thumbnailUrl:'/public/images/funhouse/midnight-laughs.svg',spawn:{x:0,y:.02,z:48,rotationY:0},streets:[],
  funhouse:{enabled:true,stations:FUNHOUSE_STATIONS,adventure:{start:FUNHOUSE_ADVENTURE_START,clues:FUNHOUSE_ADVENTURE_CLUES,durationMs:FUNHOUSE_ADVENTURE_RULES.durationMs}},
  builderScene:{version:3,name:'Midnight Laughs Funhouse',layout:'clown-funhouse',mapSize:120,objects:[],nativeComponents:funhouseNativeComponents(),weather:'clear',layoutMeta:{color:0x24152e,sky:0x100c21,locations:FUNHOUSE_LOCATIONS,funhouse:{enabled:true}},gameplay:{multiplayer:true,friendlyFire:false,radTox:false,funhouse:{enabled:true}}},
  playUrl:'model-explorer.html?environment='+FUNHOUSE_ID+'&house='+FUNHOUSE_ID+'&mode=multiplayer&autoplay=1'
 };
}
