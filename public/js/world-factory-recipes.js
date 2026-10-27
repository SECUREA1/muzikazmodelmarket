import {AIRCRAFT_TYPES} from './aircraft-types.js';
import {ROAD_VEHICLES} from './road-vehicles.js';
import {SHIPPING_VESSELS} from './shipping-vessel-specs.js';

// Recipes describe arcade manufacturing, not instructions for building real
// equipment. Only trusted catalog metadata selects a recipe; saved/requested
// recipe names, durations and container capacities are never read from items.
const watercraft=new Set(['harbor-skiff','harbor-sailboat','harbor-yacht','harbor-patrol','harbor-fishing-boat',...Object.keys(SHIPPING_VESSELS)]);
const phaseIds=['sourcing','assembly','quality','packing'];
const recipe=(id,name,description,unitsPerContainer,unitBuildMs,minimumBuildMs,phases,weights=[20,45,20,15])=>Object.freeze({id,name,description,unitsPerContainer,unitBuildMs,minimumBuildMs,stages:Object.freeze(phases.map(([name,description],index)=>Object.freeze({id:phaseIds[index],name,description,weight:weights[index]})))});
const recipes={
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

function profileFor(item={}){
 item ||= {};
 const id=lower(item.buildAssetId||item.modelId||''),kind=lower(item.kind),types=[item.assetType,item.type].map(lower),categories=[item.category,item.builderCategory].map(lower),behavior=lower(item.behavior||item.function_data?.behavior),mode=lower(item.vehicleSettings?.mode||item.function_data?.vehicleMode||item.action||item.function_data?.action);
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

const RECIPE_VERSION=2;
const profileDetails={
 materials:{components:'catalog feedstock and finishing components',fixture:'material forming fixtures',assembly:'Form material units',verification:'construction-piece settings',packaging:'labeled material pallets',stations:['Materials receiving','Material processing line','Material grading bench','Pallet wrapping line']},
 tools:{components:'tool body and game function modules',fixture:'tool assembly fixtures',assembly:'Fit tool assemblies',verification:'the configured tool action',packaging:'protective tool cases',stations:['Tool component intake','Tool assembly bench','Tool function test bench','Tool case packing line']},
 care:{components:'game supply components and unit containers',fixture:'the game supply batch line',assembly:'Prepare supply units',verification:'the configured game care effect',packaging:'sealed supply cases',stations:['Care supply intake','Care batch line','Care batch inspection','Care case sealing line']},
 furniture:{components:'catalog frames, panels and finish components',fixture:'furniture assembly fixtures',assembly:'Fit furniture assemblies',verification:'catalog furniture interactions',packaging:'surface-protected furniture crates',stations:['Furniture parts intake','Furniture assembly cell','Furniture fit inspection','Furniture crating line']},
 props:{components:'catalog body, finish and interaction components',fixture:'item fabrication fixtures',assembly:'Fabricate catalog units',verification:'the configured item interactions',packaging:'labeled item crates',stations:['Item component intake','Item fabrication cell','Item inspection bench','Item crating line']},
 electronics:{components:'device housings, interface and game control modules',fixture:'device assembly fixtures',assembly:'Fit device modules',verification:'the configured device interface',packaging:'protected device cases',stations:['Device parts intake','Device assembly bench','Device interface test bench','Device case packing line']},
 vehicles:{components:'catalog frame, body and game vehicle modules',fixture:'vehicle assembly fixtures',assembly:'Fit vehicle assemblies',verification:'the configured vehicle controls and seats',packaging:'braced vehicle freight modules',stations:['Vehicle parts staging','Vehicle assembly cell','Vehicle configuration test bay','Vehicle securing bay']},
 aircraft:{components:'catalog airframe sections and game flight modules',fixture:'airframe assembly fixtures',assembly:'Fit catalog airframes',verification:'the configured game flight controls and seats',packaging:'individual protected aircraft modules',stations:['Airframe parts staging','Game airframe assembly cell','Flight configuration test bay','Aircraft securing bay']},
 watercraft:{components:'catalog hull, deck and game helm modules',fixture:'hull assembly fixtures',assembly:'Fit catalog watercraft',verification:'the configured game helm and vessel dimensions',packaging:'individual protected vessel modules',stations:['Hull parts staging','Game hull assembly cell','Vessel configuration test bay','Vessel securing bay']},
 buildings:{components:'catalog structural sections and interior components',fixture:'building module fixtures',assembly:'Fit building modules',verification:'catalog collision, access and interaction settings',packaging:'individual structural freight modules',stations:['Structural module intake','Building module assembly cell','Structure access inspection','Building module securing bay']},
 environments:{components:'authored environment sections and layout components',fixture:'world module assembly fixtures',assembly:'Fit world modules',verification:'authored environment and layout settings',packaging:'individual world freight modules',stations:['World component intake','World module assembly cell','World configuration inspection','World module securing bay']},
 avatars:{components:'catalog character geometry and appearance components',fixture:'character assembly fixtures',assembly:'Fit character assets',verification:'character scale, animation and game behavior',packaging:'labeled character asset cases',stations:['Character component intake','Character assembly cell','Character configuration test bench','Character case packing line']}
};
const blueprintFields=['kind','assetType','type','behavior','action','toolId','materialId','builderLayoutId','dimensions','targetHeight','scale','collision','function_data','vehicleSettings','movementSettings','aiSettings','questSettings','dialogueSettings','environmentSettings','animationState','effect','configuration'];
function normalizeRef(value){
 const text=String(value||'').trim();
 try{return decodeURIComponent(text).replace(/^(?:\.\/|\/)+/,'');}catch{return text.replace(/^(?:\.\/|\/)+/,'');}
}
function sortedCopy(value){
 if(Array.isArray(value))return value.map(sortedCopy);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined&&typeof value[key]!=='function').map(key=>[key,sortedCopy(value[key])]));
 return value;
}
function freeze(value){
 if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;
}
// Non-security fingerprint: two integer accumulators keep identities stable in
// browsers and Node without a crypto dependency or asynchronous hashing.
function fingerprint(value){
 const text=typeof value==='string'?value:JSON.stringify(sortedCopy(value));let first=0x811c9dc5,second=0x9e3779b9;
 for(let index=0;index<text.length;index++){const code=text.charCodeAt(index);first=Math.imul(first^code,0x01000193);second=Math.imul(second^code,0x85ebca6b);}
 return (first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
}
const abstractInput=(id,name,quantityPerUnit=1,unit='component')=>({id,name,quantityPerUnit,unit,abstract:true});

export function worldFactoryRecipe(item={}){
 item ||= {};
 const profile=profileFor(item),details=profileDetails[profile.id],buildAssetId=String(item.buildAssetId||item.modelId||''),modelUrl=String(item.modelUrl||item.glb_url||''),modelRef=normalizeRef(modelUrl),sku=String(item.supplyId||item.economySku||item.sku||'');
 const itemId=sku||(profile.id==='care'&&item.id?'care:'+item.id:String(item.id||item.catalogId||''))||(buildAssetId?'native:'+buildAssetId:modelRef?'model:'+modelRef:'catalog:'+profile.id+':'+fingerprint(String(item.name||profile.id)));
 const itemName=String(item.name||item.title||buildAssetId||item.id||profile.name);
 const blueprint=sortedCopy({itemId,sku:sku||itemId,name:itemName,buildAssetId:buildAssetId||null,modelUrl:modelUrl||null,modelRef:modelRef||null,format:item.format||(modelRef?'authored-model':buildAssetId?'procedural-3d':'catalog-item'),...Object.fromEntries(blueprintFields.filter(key=>item[key]!==undefined).map(key=>[key,item[key]]))});
 if(!blueprint.behavior)blueprint.behavior=String(item.function_data?.behavior||item.toolId||'decor');
 const identityFingerprint=fingerprint({recipeVersion:RECIPE_VERSION,profileId:profile.id,blueprint:{...blueprint,modelUrl:modelRef||null}}),itemPlanId='world-factory-v'+RECIPE_VERSION+':'+fingerprint(itemId)+':'+identityFingerprint;
 const qualityChecks=[
  {id:itemPlanId+':identity',name:'Verify '+itemName+' identity',description:'Compare the output with the exact catalog item and model blueprint.',expected:{itemId,sku:blueprint.sku,buildAssetId:blueprint.buildAssetId,modelRef:blueprint.modelRef}},
  {id:itemPlanId+':geometry',name:'Check '+itemName+' configuration',description:'Match the authored scale, dimensions and asset type for this item.',expected:sortedCopy({itemId,assetType:blueprint.assetType||blueprint.type||profile.id,dimensions:blueprint.dimensions||null,targetHeight:blueprint.targetHeight||null,scale:blueprint.scale||null,collision:blueprint.collision||null})},
  {id:itemPlanId+':behavior',name:'Verify '+itemName+' game behavior',description:'Compare '+details.verification+' with the saved catalog blueprint.',expected:sortedCopy({itemId,behavior:blueprint.behavior,...Object.fromEntries(blueprintFields.filter(key=>!['dimensions','targetHeight','scale','collision','assetType','type','kind'].includes(key)&&blueprint[key]!==undefined).map(key=>[key,blueprint[key]]))})}
 ];
 const billOfMaterials=[abstractInput(itemPlanId+':body-components',itemName+' · '+details.components),abstractInput(itemPlanId+':blueprint-kit',itemName+' · catalog configuration kit'),abstractInput(itemPlanId+':packaging',itemName+' · freight protection kit',1,'packaging kit')];
 const prepared=abstractInput(itemPlanId+':prepared-kit',itemName+' · prepared component kit',1,'kit'),assembled=abstractInput(itemPlanId+':assembled',itemName+' · assembled unit',1,'item'),verified=abstractInput(itemPlanId+':verified',itemName+' · verified unit',1,'item'),output=abstractInput(itemId,itemName,1,'item');
 const operations=[
  [
   ['identify','Load item blueprint','Load the exact '+itemName+' identity, model reference and catalog function data.'],
   ['stage-components','Stage '+itemName+' components','Prepare '+details.components+' as an abstract game batch for this item.'],
   ['prepare-fixtures','Prepare production fixtures','Prepare '+details.fixture+' for the saved '+itemName+' blueprint.']
  ],
  [
   ['assemble',details.assembly,'Assemble '+itemName+' using its catalog component and geometry configuration.'],
   ['apply-model',modelRef?'Bind authored model':buildAssetId?'Build native geometry':'Apply catalog blueprint',modelRef?'Preserve the authored model reference '+modelRef+'.':buildAssetId?'Preserve the native build identity '+buildAssetId+'.':'Preserve the catalog identity '+itemId+'.'],
   ['configure','Apply game configuration','Preserve '+itemName+' function data, configured behavior and interaction settings.']
  ],
  [
   ['verify-identity','Inspect item identity',qualityChecks[0].description],
   ['verify-geometry','Inspect authored configuration',qualityChecks[1].description],
   ['verify-behavior','Verify game behavior',qualityChecks[2].description]
  ],
  [
   ['count','Count approved '+itemName+' units','Count the verified output under catalog item '+itemId+'.'],
   ['protect','Protect freight units','Secure '+itemName+' in '+details.packaging+' with '+profile.unitsPerContainer+' units per container.'],
   ['label','Issue item freight labels','Carry the exact item blueprint and output quantity into the shipping manifest.']
  ]
 ];
 const stageInputs=[[...billOfMaterials.slice(0,2)],[prepared],[assembled],[verified,billOfMaterials[2]]],stageOutputs=[[prepared],[assembled],[verified],[output]];
 return freeze({...profile,profileId:profile.id,recipeVersion:RECIPE_VERSION,itemPlanId,fingerprint:identityFingerprint,itemName,name:itemName+' · '+profile.name,description:'Produce '+itemName+' from its saved catalog blueprint. '+profile.description,blueprint,qualityChecks,billOfMaterials,
  processingDetails:{modelMode:modelRef?'authored-model':buildAssetId?'native-geometry':'catalog-item',componentMode:'abstract-game-bom',consumesRawStock:false,preservesFunctionData:true,qualityMode:'catalog-verification',outputUnit:'item'},
  stages:profile.stages.map((stage,index)=>({...stage,description:stage.description+' Item: '+itemName+'.',station:{id:'factory-'+profile.id+'-'+stage.id,name:details.stations[index]},inputs:stageInputs[index],outputs:stageOutputs[index],...(stage.id==='quality'?{qualityChecks}:{}),operations:operations[index].map(([id,name,description],operationIndex)=>({id:stage.id+':'+id,name,description,weight:operationIndex===1?40:30}))}))
 });
}

function intervals(records,total,offset=0,minimumFor=()=>1){
 const minimums=records.map(minimumFor),minimum=minimums.reduce((sum,value)=>sum+value,0),totalWeight=records.reduce((sum,record)=>sum+record.weight,0);let used=0;
 return records.map((record,index)=>{
  const durationMs=index===records.length-1?total-used:minimums[index]+Math.floor((total-minimum)*record.weight/totalWeight),result={...record,startedOffsetMs:offset+used,durationMs};used+=durationMs;return result;
 });
}

export function worldFactoryPlan(item,quantity,{minimumBuildMs=3000,maximumBuildMs=120000}={}){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)throw new RangeError('Choose 1 to 10,000 whole items.');
 const recipe=worldFactoryRecipe(item),minimumOperations=recipe.stages.reduce((sum,stage)=>sum+stage.operations.length,0);
 if(!Number.isSafeInteger(minimumBuildMs)||minimumBuildMs<0||!Number.isSafeInteger(maximumBuildMs)||maximumBuildMs<minimumOperations)throw new RangeError('Factory timing bounds must be whole milliseconds with room for every operation.');
 const ceiling=Math.min(120000,maximumBuildMs),floor=Math.min(ceiling,Math.max(minimumBuildMs,recipe.minimumBuildMs)),buildMs=Math.min(ceiling,Math.max(floor,recipe.minimumBuildMs+recipe.unitBuildMs*quantity));
 const amounts=records=>records.map(record=>({...record,quantity:record.quantityPerUnit*quantity}));
 const stages=intervals(recipe.stages,buildMs,0,stage=>stage.operations.length).map(stage=>({...stage,inputs:amounts(stage.inputs),outputs:amounts(stage.outputs),operations:intervals(stage.operations,stage.durationMs,stage.startedOffsetMs).map(operation=>({...operation,stageOffsetMs:operation.startedOffsetMs-stage.startedOffsetMs}))}));
 return freeze({recipeVersion:RECIPE_VERSION,itemPlanId:recipe.itemPlanId,fingerprint:recipe.fingerprint,blueprint:recipe.blueprint,recipe,quantity,buildMs,stages,billOfMaterials:amounts(recipe.billOfMaterials),packaging:{quantity,unitsPerContainer:recipe.unitsPerContainer,containers:Math.ceil(quantity/recipe.unitsPerContainer)}});
}
