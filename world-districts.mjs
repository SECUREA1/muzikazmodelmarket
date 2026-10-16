import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const spaces=JSON.parse(readFileSync(new URL('./public/models/land-spaces.json',import.meta.url),'utf8')).spaces;
const scenery=['ancient-oak','lamp-post','stone-tower','canopy-tree','market-stall','palm-cluster','desert-cactus','giant-mushrooms'];
const ground=[0x34334f,0x434037,0x304454,0x284c35,0x493541,0x294849,0x5a4534,0x3c4058];
const colors=['#af8cff','#ffd45c','#68dbff','#7bea99','#ff8dbb','#52e0da','#ff9e64','#acb7ff'];
export const WORLD_DISTRICTS=spaces.map((space,index)=>({id:space.locationId,name:space.name,color:colors[index%colors.length],scenery:scenery[index],ground:ground[index]}));
export const DISTRICT_PAGE_SIZE=24;
export const districtMapId=(id,page=0)=>'world-district-'+id+(page?'-'+(page+1):'');
export function districtFor(location){
 const text=[location.worldId,location.baseEnvironmentId,location.mapId||location.id,location.name].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g,'-');
 return WORLD_DISTRICTS.find(region=>text.includes(region.id))||WORLD_DISTRICTS[createHash('sha256').update(String(location.ownerId||location.mapId||location.id)).digest().readUInt32BE()%WORLD_DISTRICTS.length];
}
