import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';

// Recipes describe arcade manufacturing, not instructions for building real
// equipment. Only trusted catalog metadata selects a recipe; saved/requested
// recipe names, durations and container capacities are never read from items.
const watercraft=new Set(['harbor-skiff','harbor-sailboat','harbor-yacht','harbor-patrol','harbor-fishing-boat',...Object.keys(SHIPPING_VESSELS)]);
const rocketCollectibles=new Set(['factory-training-missile','factory-cargo-rocket']);
const phaseIds=['sourcing','assembly','quality','packing'];
const recipe=(id,name,description,unitsPerContainer,unitBuildMs,minimumBuildMs,phases,weights=[20,45,20,15])=>Object.freeze({id,name,description,unitsPerContainer,unitBuildMs,minimumBuildMs,stages:Object.freeze(phases.map(([name,description],index)=>Object.freeze({id:phaseIds[index],name,description,weight:weights[index]})))});
const recipes={
 rocketCollectibles:recipe('rocket-collectibles','Rocket model assembly','Assemble fictional display modules, verify their game presentation and secure each collectible individually.',1,8000,16000,[
  ['Stage display modules','Prepare the catalog collectible sections and display fixtures.'],
  ['Assemble collectible models','Fit the fictional model sections and their game display cradles.'],
  ['Verify collectible configuration','Check the game scale, appearance and configured display animation.'],
  ['Crate models individually','Secure one complete collectible and its cradle in each freight container.']
 ],[20,40,30,10]),
 materials:recipe('materials','Material processing','Prepare, form and grade construction materials before palletizing them.',1000,10,8000,[
  ['Source feedstock','Collect the catalog material inputs and prepare the processing line.'],
  ['Form material pieces','Process and form the batch into matching construction pieces.'],
  ['Grade the batch','Check dimensions, finish and batch consistency.'],
  ['Palletize materials','Count and wrap the pieces on labeled shipping pallets.']
 ],[25,40,20,15]),
 tools:recipe('tools','Tool assembly','Prepare components, assemble tools and verify their game functions.',1000,40,9000,[
  ['Prepare components','Pick the tool components and prepare their assembly fixtures.'],
  ['Assemble tools','Fit and finish the catalog tool assemblies.'],
  ['Test tool functions','Verify each tool batch against its catalog function.'],
  ['Pack tool cases','Count the finished tools into labeled protective cases.']
 ],[20,45,25,10]),
 care:recipe('care','Care supply production','Prepare, batch and inspect game care supplies before sealing their cases.',1000,20,8000,[
  ['Prepare supply inputs','Gather the approved game supply inputs and clean the batch line.'],
  ['Prepare the supply batch','Create the catalog supply batch and fill its game containers.'],
  ['Verify supply quality','Check batch identity, item counts and game effect metadata.'],
  ['Seal supply cases','Seal and label the care supply cases for transport.']
 ],[25,35,25,15]),
 furniture:recipe('furniture','Furniture assembly','Prepare frames and finishes, assemble furniture and protect it for shipping.',50,400,10000,[
  ['Prepare frames and finishes','Pick the furniture components and prepare their surfaces.'],
  ['Assemble furniture','Fit frames, panels, upholstery and catalog fixtures.'],
  ['Inspect fit and stability','Check alignment, finish and supported interactions.'],
  ['Protect and crate','Wrap surfaces and secure the furniture in shipping crates.']
 ]),
 props:recipe('props','General item fabrication','Prepare components, fabricate the catalog item and inspect its finished batch.',100,200,9000,[
  ['Prepare item components','Pick the catalog components and prepare the fabrication line.'],
  ['Fabricate item assemblies','Form and assemble the item geometry and catalog parts.'],
  ['Inspect finished items','Check appearance, scale and configured game interactions.'],
  ['Pack item crates','Count, protect and label the finished items for freight.']
 ]),
 electronics:recipe('electronics','Device assembly','Assemble device housings and controls, then verify their game interfaces.',250,160,12000,[
  ['Prepare device parts','Pick housings, control parts and catalog device modules.'],
  ['Assemble device modules','Fit the device modules and install the configured interface.'],
  ['Run device checks','Verify controls, displays and catalog interaction settings.'],
  ['Pack protected devices','Count the devices into protective transport cases.']
 ],[15,45,30,10]),
 vehicles:recipe('vehicles','Vehicle assembly','Build vehicle assemblies, verify their game controls and secure them for freight.',4,4000,16000,[
  ['Stage vehicle components','Prepare frames, running gear and catalog vehicle components.'],
  ['Assemble vehicles','Fit body assemblies and configured game vehicle systems.'],
  ['Verify vehicle controls','Check the game controls, collision dimensions and seats.'],
  ['Secure vehicle freight','Count and brace the vehicles for transport.']
 ],[15,50,25,10]),
 aircraft:recipe('aircraft','Aircraft assembly','Assemble game airframes, check their configured flight controls and crate them individually.',1,8000,16000,[
  ['Stage airframe components','Prepare catalog airframe sections and game system modules.'],
  ['Assemble airframes','Join the airframe sections and install the game systems.'],
  ['Verify flight configuration','Check configured controls, seats and game dimensions.'],
  ['Secure aircraft freight','Protect and secure each aircraft assembly for transport.']
 ],[15,45,30,10]),
 watercraft:recipe('watercraft','Watercraft assembly','Assemble game hulls, verify their vessel configuration and secure them individually.',1,8000,16000,[
  ['Stage hull components','Prepare catalog hull sections and deck components.'],
  ['Assemble watercraft','Join hull and deck assemblies with the configured game systems.'],
  ['Verify vessel configuration','Check the game helm, cargo fittings and vessel dimensions.'],
  ['Secure vessel freight','Protect and secure each vessel assembly for transport.']
 ],[15,45,30,10]),
 buildings:recipe('buildings','Building module assembly','Build and inspect catalog structures as individually packed game modules.',1,10000,16000,[
  ['Stage structural modules','Prepare the catalog structure panels and fixtures.'],
  ['Assemble building modules','Fit the structural sections and authored interior components.'],
  ['Inspect structure access','Check collision dimensions, openings and game access points.'],
  ['Pack building modules','Label and secure the complete structure module for freight.']
 ]),
 environments:recipe('environments','World module assembly','Prepare, assemble and inspect an authored map module before shipping.',1,12000,16000,[
  ['Prepare world components','Collect the authored map sections and environment components.'],
  ['Assemble world modules','Build the catalog environment module and its configured layout.'],
  ['Verify world configuration','Check module scale, authored geometry and environment settings.'],
  ['Pack world modules','Label and secure the complete environment module for transport.']
 ]),
 avatars:recipe('avatars','Character assembly','Prepare character assets, assemble their configured parts and verify their game presentation.',100,250,12000,[
  ['Prepare character components','Prepare catalog character geometry and appearance components.'],
  ['Assemble character assets','Fit the character parts and catalog animation configuration.'],
  ['Verify character setup','Check scale, appearance and configured game animations.'],
  ['Pack character assets','Count and label the finished character units for freight.']
 ],[20,45,25,10])
};
const lower=value=>String(value||'').toLowerCase();
const includes=(values,choices)=>values.some(value=>choices.includes(value));

export function worldFactoryRecipe(item={}){
 item ||= {};
 const id=lower(item.buildAssetId||item.modelId||''),kind=lower(item.kind),types=[item.assetType,item.type].map(lower),categories=[item.category,item.builderCategory].map(lower),behavior=lower(item.behavior||item.function_data?.behavior),mode=lower(item.vehicleSettings?.mode||item.function_data?.vehicleMode||item.action||item.function_data?.action);
 if(rocketCollectibles.has(id))return recipes.rocketCollectibles;
 if(kind==='material'||item.materialId)return recipes.materials;
 if(kind==='care'||String(item.sku||item.supplyId||'').startsWith('care:')||item.effect&&typeof item.effect==='object')return recipes.care;
 if(kind==='tool'||item.toolId||includes(types,['tool','tools']))return recipes.tools;
 if(Object.hasOwn(AIRCRAFT_TYPES,id)||includes(types,['aircraft','airplane','helicopter'])||['fly','flight','aircraft'].includes(mode))return recipes.aircraft;
 if(watercraft.has(id)||includes(types,['watercraft','boat','boats','ship','ships','vessel'])||['boat','sail','watercraft'].includes(mode))return recipes.watercraft;
 if(item.builderLayoutId||includes(types,['environment','environments','map','maps','room','rooms','land','lands'])||includes(categories,['environments','scene-layouts','rooms']))return recipes.environments;
 if(includes(types,['building','buildings','structure','structures'])||includes(categories,['building','buildings']))return recipes.buildings;
 if(Object.hasOwn(ROAD_VEHICLES,id)||id==='utility-cargo-trailer'||includes(types,['vehicle','vehicles'])||behavior==='vehicle')return recipes.vehicles;
 if(includes(types,['avatar','avatars','character','characters','enemy','creature','creatures','pets'])||includes(categories,['characters','creatures']))return recipes.avatars;
 if(item.function_data?.device||includes(types,['electronic','electronics','device','devices'])||includes(categories,['electronics','audio','video','arcade & card machines'])||/(?:^|-)(?:computer|terminal|console|screen|radio|jukebox|projector|boombox|vending|atm)(?:-|$)/.test(id)||/^arcade-(?!part-)/.test(id))return recipes.electronics;
 if(behavior==='seat'||includes(types,['furniture'])||includes(categories,['furniture','builder furniture','seating','interior'])||/(?:^|-)(?:chair|armchair|sofa|bench|table|desk|bed|daybed|chaise|wardrobe|bookshelf|vanity|fireplace|dining-set)(?:-|$)/.test(id))return recipes.furniture;
 return recipes.props;
}

export function worldFactoryPlan(item,quantity,{minimumBuildMs=3000,maximumBuildMs=120000}={}){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw new RangeError('Choose 1 to 10,000 whole items.');
 if(!Number.isSafeInteger(minimumBuildMs)||minimumBuildMs<0||!Number.isSafeInteger(maximumBuildMs)||maximumBuildMs<4)throw new RangeError('Factory timing bounds must be whole milliseconds with room for all four stages.');
 const recipe=worldFactoryRecipe(item),ceiling=Math.min(120000,maximumBuildMs),floor=Math.min(ceiling,Math.max(minimumBuildMs,recipe.minimumBuildMs)),buildMs=Math.min(ceiling,Math.max(floor,recipe.minimumBuildMs+recipe.unitBuildMs*quantity));
 const totalWeight=recipe.stages.reduce((sum,stage)=>sum+stage.weight,0);
 // Reserve one millisecond per phase before dividing the remainder. The final
 // phase takes rounding residue, keeping every duration positive and the sum
 // exact even when a caller chooses unusually small timing bounds.
 let startedOffsetMs=0;
 const stages=recipe.stages.map((stage,index)=>{
  const durationMs=index===recipe.stages.length-1?buildMs-startedOffsetMs:1+Math.floor((buildMs-recipe.stages.length)*stage.weight/totalWeight);
  const result={id:stage.id,name:stage.name,description:stage.description,startedOffsetMs,durationMs};startedOffsetMs+=durationMs;return result;
 });
 return {recipe,buildMs,stages};
}
