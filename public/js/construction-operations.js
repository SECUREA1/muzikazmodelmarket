/** Site objectives measure actual shared ground, never button presses or free material. */
export const CONSTRUCTION_OPERATIONS=Object.freeze([
 {id:'pavement-reclamation',label:'Rip up the old pavement',type:'strip',target:.24,guide:'Excavator or lowered dozer blade → load truck → haul reclaimed gravel to recycling or the new road.'},
 {id:'new-road',label:'Create the aggregate road',type:'road',target:.2,guide:'Haul gravel or reclaimed pavement here. Tip in small lifts, then spread with the dozer to a level 20 cm road base.'},
 {id:'utility-trench',label:'Dig the utility trench',type:'cut',target:3,guide:'Park on the shoulder. Swing and scoop along the marked 64 m trench; haul spoil away. Target depth: 3 m.'},
 {id:'basement-cut',label:'Excavate the basement',type:'cut',target:6,guide:'Dig successive reachable lifts, load the truck and haul spoil to receiving bays. Target depth: 6 m.'},
 {id:'recycled-aggregate',label:'Stockpile reclaimed aggregate',type:'stockpile',target:30,guide:'Load reclaimed pavement as gravel, haul it here and raise the truck body above clear receiving ground. Target: 30 m³.'},
 {id:'earth-platform',label:'Fill and level the earth platform',type:'fill',target:.3,guide:'Haul soil or gravel, tip thin lifts and push with the lowered blade. Grade the whole platform to 30 cm.'},
 {id:'tower',label:'Erect the skyscraper steel',type:'steel',guide:'Crane: align pickup → attach → hoist → align tower → place beam. Four secured beams raise one floor.'}
]);
const clamp=value=>Math.max(0,Math.min(1,value));
export function constructionOperations(site={}){
 return CONSTRUCTION_OPERATIONS.flatMap(definition=>{
  if(definition.type==='steel'){
   if(!site.tower)return [];
   const total=site.tower.maxFloors*4,placed=site.tower.placed||0;
   return [{...definition,x:site.tower.x,z:site.tower.z,progress:total?clamp(placed/total):0,detail:`${placed} / ${total} steel members · ${site.tower.floors||0} floors`}];
  }
  const patch=site.earthworks?.patches?.find(patch=>patch.id===definition.id);if(!patch)return [];
  const area=patch.cellSize**2,count=patch.heights.length;let amount=0,finished=0;
  for(let index=0;index<count;index++){
   const height=patch.heights[index]-patch.baseY,gravel=patch.gravel[index]||0;
   if(definition.type==='strip'){amount+=clamp(((patch.surfaceThickness||.24)-Math.max(0,height))/(patch.surfaceThickness||.24));}
   else if(definition.type==='cut'){amount+=clamp(-height/definition.target);}
   else if(definition.type==='stockpile'){amount+=gravel;}
   else {
    // A tall heap is not a road: both coverage and level matter at every cell.
    const depth=definition.type==='road'?Math.min(height,gravel/area):height;
    amount+=clamp(depth/definition.target);
    if(depth>=definition.target-.02&&Math.abs(height-definition.target)<=.08)finished++;
   }
  }
  const graded=definition.type==='road'||definition.type==='fill';
  const progress=definition.type==='stockpile'?clamp(amount/definition.target):graded?(amount/count+finished/count)/2:amount/count;
  const detail=definition.type==='stockpile'?`${amount.toFixed(1)} / ${definition.target} m³ gravel`:graded?`${Math.round(amount/count*100)}% material coverage · ${Math.round(finished/count*100)}% at grade`:`${Math.round(progress*100)}% ${definition.type==='strip'?'pavement removed':'target excavation'}`;
  return [{...definition,x:patch.origin.x+patch.columns*patch.cellSize/2,z:patch.origin.z+patch.rows*patch.cellSize/2,progress,detail}];
 });
}
