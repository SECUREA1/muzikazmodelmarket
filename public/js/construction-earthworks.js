/** Authoritative, finite soil and gravel cells shared by terrain, controls and physics.
 * Cell volumes are cubic metres; each surface covers one cellSize square.
 */
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value,min)));
const EPS=1e-8;
export const earthCargoVolume=cargo=>Math.max(0,finite(cargo?.soil))+Math.max(0,finite(cargo?.gravel));
export const earthCargo=cargo=>({soil:Math.max(0,finite(cargo?.soil)),gravel:Math.max(0,finite(cargo?.gravel))});
export function earthworksPatch(config={},cellSize=2,index=0){
 cellSize=clamp(config.cellSize||cellSize,1,4);
 const width=clamp(config.width||finite(config.radius,10)*2,cellSize,128),depth=clamp(config.depth||finite(config.radius,10)*2,cellSize,128),columns=Math.ceil(width/cellSize),rows=Math.ceil(depth/cellSize),baseY=finite(config.baseY),minY=baseY-clamp(config.maxDepth??(config.kind==='excavation'?8:0),0,12),area=cellSize*cellSize;
 const patch={id:String(config.id||'earth-'+index),kind:config.kind||'excavation',origin:{x:finite(config.x)-columns*cellSize/2,z:finite(config.z)-rows*cellSize/2},cellSize,columns,rows,baseY,minY,heights:[],soil:[],gravel:[],initialSoil:[],initialVolume:0};
 for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
  const x=(column+.5)*cellSize-columns*cellSize/2,z=(row+.5)*cellSize-rows*cellSize/2,radius=finite(config.radius,Math.min(width,depth)/2),mound=clamp(config.height??0,0,6) * Math.max(0,1-Math.hypot(x,z)/radius),native=(baseY-minY)*area,soil=native+(config.material==='gravel'?0:mound*area),gravel=config.material==='gravel'?mound*area:0;
  patch.initialSoil.push(native);patch.soil.push(soil);patch.gravel.push(gravel);patch.heights.push(baseY+mound);patch.initialVolume+=soil+gravel;
 }
 return patch;
}
export function createEarthworks(config={}){
 const excavation=config.excavation||{x:25,z:17,radius:12},stockpile=config.stockpile||{x:30,z:39},settings=config.earthworks||{},definitions=[{id:'excavation',kind:'excavation',...excavation,maxDepth:excavation.maxDepth??8,depth:excavation.width?excavation.depth:undefined},{id:'spoil',kind:'stockpile',width:28,depth:16,maxDepth:0,...stockpile},...(settings.patches||[])].slice(0,16),ids=new Set();
 const patches=definitions.filter(definition=>{if(ids.has(definition.id))return false;ids.add(definition.id);return true;}).map((definition,index)=>earthworksPatch(definition,settings.cellSize,index));
 const earthworks={version:1,revision:1,patches,initialVolume:patches.reduce((sum,patch)=>sum+patch.initialVolume,0),excavated:0,deposited:0,pushed:0,totals:{}};
 refreshEarthworksTotals(earthworks);return earthworks;
}
export function earthworksSurfaceAt(earthworks,point){
 if(!earthworks||!Number.isFinite(point?.x)||!Number.isFinite(point?.z))return null;
 for(const patch of earthworks.patches||[]){const column=Math.floor((point.x-patch.origin.x)/patch.cellSize),row=Math.floor((point.z-patch.origin.z)/patch.cellSize);if(column<0||column>=patch.columns||row<0||row>=patch.rows)continue;const index=row*patch.columns+column;return {x:point.x,y:patch.heights[index],z:point.z,patchId:patch.id,patch,index,column,row,baseY:patch.baseY,minY:patch.minY,material:patch.gravel[index]>EPS?'gravel':'soil'};}
 return null;
}
/** Replace the original flat terrain inside an earth patch, retaining a real
 * higher object returned by the caller (deck, chassis or placed solid).
 */
export function earthworksGroundAt(earthworks,point,fallback,{clearance=.02}={}){
 const floor=typeof fallback==='function'?fallback(point):fallback,surface=earthworksSurfaceAt(earthworks,point);if(!surface)return floor;
 const other=typeof floor==='number'?{...point,y:floor}:floor;
 if(other&&other.y>surface.baseY+.1&&other.y>surface.y+clearance)return other;
 return {...point,y:surface.y+clearance,earthworks:true,patchId:surface.patchId};
}
function candidates(earthworks,point,radius,allowed){
 const result=[];
 for(const patch of earthworks.patches||[]){if(allowed&&!allowed.includes(patch.kind))continue;const size=patch.cellSize,minColumn=Math.max(0,Math.floor((point.x-radius-patch.origin.x)/size)),maxColumn=Math.min(patch.columns-1,Math.floor((point.x+radius-patch.origin.x)/size)),minRow=Math.max(0,Math.floor((point.z-radius-patch.origin.z)/size)),maxRow=Math.min(patch.rows-1,Math.floor((point.z+radius-patch.origin.z)/size));
  for(let row=minRow;row<=maxRow;row++)for(let column=minColumn;column<=maxColumn;column++){const x=patch.origin.x+(column+.5)*size,z=patch.origin.z+(row+.5)*size,distance=Math.hypot(Math.max(0,Math.abs(x-point.x)-size/2),Math.max(0,Math.abs(z-point.z)-size/2));if(distance<=radius)result.push({patch,index:row*patch.columns+column,x,z,distance:Math.hypot(x-point.x,z-point.z)});}
 }
 return result.sort((a,b)=>a.distance-b.distance);
}
function updateCell(patch,index){patch.heights[index]=patch.baseY+(patch.soil[index]+patch.gravel[index]-patch.initialSoil[index])/(patch.cellSize*patch.cellSize);}
function changed(earthworks){earthworks.revision++;refreshEarthworksTotals(earthworks);}
export function refreshEarthworksTotals(earthworks,cargo=null){
 let soil=0,gravel=0;for(const patch of earthworks.patches||[])for(let index=0;index<patch.heights.length;index++){soil+=patch.soil[index];gravel+=patch.gravel[index];}
 earthworks.totals={soil,gravel,carriedSoil:cargo?cargo.reduce((sum,item)=>sum+earthCargo(item).soil,0):(earthworks.totals?.carriedSoil||0),carriedGravel:cargo?cargo.reduce((sum,item)=>sum+earthCargo(item).gravel,0):(earthworks.totals?.carriedGravel||0)};return earthworks.totals;
}
export function earthworksTake(earthworks,point,requested,{radius=1.3,cutY=-Infinity,looseOnly=false,dryRun=false,onTake=null}={}){
 const cargo={soil:0,gravel:0};let remaining=Math.max(0,finite(requested));
 for(const {patch,index} of candidates(earthworks,point,radius)){
  const area=patch.cellSize*patch.cellSize,top=patch.heights[index],floor=Math.max(patch.minY,finite(cutY,-Infinity),looseOnly?patch.baseY:-Infinity);let capacity=Math.min(remaining,Math.max(0,(top-floor)*area));if(capacity<=EPS)continue;if(onTake)onTake(patch,index);
  for(const material of ['gravel','soil']){const amount=Math.min(capacity,patch[material][index]);cargo[material]+=amount;remaining-=amount;capacity-=amount;if(!dryRun)patch[material][index]-=amount;}
  if(!dryRun)updateCell(patch,index);if(remaining<=EPS)break;
 }
 if(!dryRun&&earthCargoVolume(cargo)>EPS){earthworks.excavated+=earthCargoVolume(cargo);changed(earthworks);}return cargo;
}
export function earthworksDeposit(earthworks,point,source,{radius=2.5,maxHeight=6,allowedKinds=null,dryRun=false,excludeCells=null,cellFilter=null}={}){
 const cargo=earthCargo(source),deposited={soil:0,gravel:0},cells=candidates(earthworks,point,radius,allowedKinds).filter(cell=>!excludeCells?.has(cell.patch.id+':'+cell.index)&&(!cellFilter||cellFilter(cell))).sort((a,b)=>a.patch.heights[a.index]-b.patch.heights[b.index]||a.distance-b.distance);
 for(const {patch,index}of cells){let capacity=Math.max(0,(Math.min(patch.baseY+maxHeight,finite(point.y,Infinity))-patch.heights[index])*patch.cellSize*patch.cellSize);for(const material of ['soil','gravel']){const amount=Math.min(capacity,cargo[material]);deposited[material]+=amount;cargo[material]-=amount;capacity-=amount;if(!dryRun)patch[material][index]+=amount;}if(!dryRun)updateCell(patch,index);if(earthCargoVolume(cargo)<=EPS)break;}
 if(!dryRun&&earthCargoVolume(deposited)>EPS){earthworks.deposited+=earthCargoVolume(deposited);changed(earthworks);}return deposited;
}
/** A blade moves existing material into a reachable receiving cell. The target
 * is checked first so a pass over a patch edge cannot destroy material.
 */
export function earthworksPush(earthworks,from,to,requested,{radius=1.8,cutY=from.y,looseOnly=true,dryRun=false}={}){
 const sourceCells=new Set(),available=earthworksTake(earthworks,from,requested,{radius,cutY,looseOnly,dryRun:true,onTake:(patch,index)=>sourceCells.add(patch.id+':'+index)}),accepted=earthworksDeposit(earthworks,to,available,{radius:1.3,dryRun:true,excludeCells:sourceCells});if(earthCargoVolume(accepted)<=EPS)return {soil:0,gravel:0};if(dryRun)return accepted;
 const taken=earthworksTake(earthworks,from,earthCargoVolume(accepted),{radius,cutY,looseOnly}),placed=earthworksDeposit(earthworks,to,taken,{radius:1.3,excludeCells:sourceCells});
 // Capacity was reserved synchronously above; this guard also handles unusual
 // overlapping source/target cells without changing the conserved total.
 const remainder={soil:taken.soil-placed.soil,gravel:taken.gravel-placed.gravel};if(earthCargoVolume(remainder)>EPS)earthworksDeposit(earthworks,{...from,y:Infinity},remainder,{radius,maxHeight:Infinity});earthworks.pushed+=earthCargoVolume(placed);return placed;
}
/** Solid columns expose cut/pile sides to the same SAT used by machinery.
 * The bucket and grading blade alone may penetrate diggable material.
 */
export function earthworksCollisionBoxes(earthworks,bounds=null){
 const boxes=[];for(const patch of earthworks?.patches||[]){const size=patch.cellSize;
  const minColumn=bounds?Math.max(0,Math.floor((bounds.min.x-patch.origin.x)/size)):0,maxColumn=bounds?Math.min(patch.columns-1,Math.floor((bounds.max.x-patch.origin.x)/size)):patch.columns-1,minRow=bounds?Math.max(0,Math.floor((bounds.min.z-patch.origin.z)/size)):0,maxRow=bounds?Math.min(patch.rows-1,Math.floor((bounds.max.z-patch.origin.z)/size)):patch.rows-1;
  for(let row=minRow;row<=maxRow;row++)for(let column=minColumn;column<=maxColumn;column++){const index=row*patch.columns+column,top=patch.heights[index],bottom=Math.min(patch.minY,patch.baseY-.15);if(top<=bottom+1e-6||bounds&&(top<bounds.min.y-.05||bottom>bounds.max.y+.05))continue;const center={x:patch.origin.x+(column+.5)*size,y:(top+bottom)/2,z:patch.origin.z+(row+.5)*size};boxes.push({part:'earth-'+patch.id,objectId:'earth:'+patch.id+':'+index,center,size:{x:size,y:top-bottom,z:size},matrix:[1,0,0,0,0,1,0,0,0,0,1,0,center.x,center.y,center.z,1],diggable:true,earthworks:true,patchId:patch.id,cellIndex:index});}
 }return boxes;
}
