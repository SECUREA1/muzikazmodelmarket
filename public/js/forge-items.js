/** Canonical portable forge assets. Crafting and ownership stay server controlled. */
const item=(name,description,dimensions,kind,priceMzk,extra={})=>Object.freeze({name,description,dimensions:Object.freeze(dimensions),kind,priceMzk,...extra});
export const FORGE_ITEMS=Object.freeze({
 'forge-stock-rack':item('Forge Metal Stock Rack','Numbered steel racks storing iron, bronze and layered billets for traditional forging.',[3.6,2.2,1.4],'station',180,{station:'sourcing'}),
 'forge-hearth':item('Coal Fired Smithing Hearth','A brick charcoal hearth with a glowing firepot, steel hood and working air bellows.',[3.4,3.8,2.4],'station',360,{station:'heat'}),
 'forge-bellows':item('Leather Forge Bellows','A riveted leather and timber bellows for the smithing fire.',[1.5,1.3,2.2],'prop',90),
 'forge-anvil':item('Master Smith Anvil','A horned steel anvil on an oak stump, with hardy hole, striking face and tool ledge.',[1.8,1.25,.85],'station',240,{station:'hammer'}),
 'forge-quench-tank':item('Forge Quench Tank','A riveted quenching trough with water, lifting tongs and an alloy inspection gauge.',[2.8,1.25,1.5],'station',160,{station:'quench'}),
 'forge-tempering-oven':item('Tempering Oven','A refractory lined tempering oven with inspection window, temperature dial and cooling rack.',[3.2,2.5,2.3],'station',320,{station:'temper'}),
 'forge-grinding-wheel':item('Treadle Grinding Wheel','A stone wheel on a timber treadle frame with a guarded steel shaft.',[1.4,1.5,1.2],'prop',120),
 'forge-finishing-bench':item('Smith Finishing Bench','A leather covered workbench with a vice, sharpening stones and maker stamp for completed metalwork.',[3.4,2,1.5],'station',220,{station:'finish'}),
 'forge-coal-bin':item('Smithy Coal Bin','A braced timber coal bin with individual dark fuel lumps and a steel scoop.',[1.5,.95,1.4],'prop',65),
 'forge-hammer':item('Cross Peen Smithing Hammer','A balanced forged steel hammer with an ash grip and polished striking faces.',[.4,.7,.15],'tool',45),
 'forge-tongs':item('Blacksmith Tongs','Long handled steel tongs with a visible pivot and curved billet gripping jaws.',[.23,.9,.12],'tool',35),
 'forge-iron-ingot':item('Refined Iron Ingot','A stamped iron ingot ready for the forge stock rack.',[.6,.18,.28],'stock',18),
 'forge-bronze-ingot':item('Bronze Alloy Ingot','A warm bronze alloy ingot for guards, fittings and decorative metalwork.',[.6,.18,.28],'stock',24),
 'forge-steel-billet':item('Layered Steel Billet','A prepared laminated steel billet showing its stacked layers along the edge.',[.72,.17,.23],'stock',30),
 'forge-coal':item('Smithing Coal','A measured sack of forge fuel with a tied canvas neck and a coal sample.',[.55,.65,.45],'stock',8),
 'forge-damascus-blade':item('Stormfold Damascus Blade','A pattern welded blade with flowing steel layers, bronze guard and a leather wrapped hilt.',[.38,1.35,.12],'product',480,{product:'blade'}),
 'forge-warhammer':item('Emberstrike Warhammer','A forged steel warhammer with bronze cheek plates, peened rivets and a long ash grip.',[.7,1.25,.26],'product',420,{product:'warhammer'}),
 'forge-battle-axe':item('Ironwake Battle Axe','A crescent forged axe with a bright cutting bevel, decorated eye and leather wrapped haft.',[.65,1.3,.16],'product',390,{product:'axe'}),
 'forge-aegis-shield':item('Aegis Forged Shield','A dished steel shield with a bronze rim, raised central boss and leather carrying straps.',[.8,1.1,.2],'product',460,{product:'shield'}),
 'forge-spear':item('Ashenreach Spear','A leaf shaped forged steel spear with a bronze socket, long ash shaft and wrapped hand grip. Hold it and use the fire control for a measured reach strike.',[.34,2.4,.18],'product',510,{product:'spear'}),
 'forge-dagger':item('Cinderfang Dagger','A compact pattern welded dagger with a faceted bronze pommel, fullered blade and stitched leather grip. A fast close range forged weapon.',[.24,.64,.1],'product',280,{product:'dagger'}),
 'forge-pickaxe':item('Deepvein Pickaxe','A curved forged steel pick with a broad adze end, reinforced bronze eye and long ash handle. Hold it for a heavy controlled strike.',[1.05,1.3,.2],'product',340,{product:'pickaxe'}),
 'forge-iron-gate':item('Emberfall Iron Gate','A riveted wrought iron gate with spearpoint bars, a bronze maker crest, real hinge barrels and a latch. Use it to open or close an entrance in your map.',[3.2,3.1,.28],'product',620,{product:'gate',behavior:'door'}),
 'forge-lantern':item('Emberglass Lantern','A forged iron lantern with amber glass, protective ribs, a brass vented roof and a warm flame core. Use it to switch the lantern glow on or off.',[.62,1.05,.62],'product',210,{product:'lantern',behavior:'switch'}),
 'forge-bronze-bell':item('Resonant Bronze Bell','A cast and forged bronze workshop bell with a flared skirt, engraved waist, hanging yoke and visible clapper. Use it to ring the quartermaster’s call.',[1.25,1.75,.8],'product',380,{product:'bell',behavior:'interact',action:'use'}),
 'forge-master-smith':item('Brann Emberhand · Master Smith','An apron wearing forge mentor who explains hammer work, commissions and maker marks.',[.75,1.9,.6],'crew',300,{crew:'master',greeting:'Welcome to the forge. Choose a billet, heat it in the hearth, then work through hammering, quenching, tempering and finishing.'}),
 'forge-metallurgist':item('Dr. Sera Vale · Metallurgist','A goggle wearing alloy specialist who guides material selection and quality inspection.',[.72,1.85,.6],'crew',300,{crew:'metallurgist',greeting:'Each alloy has its own character. Follow the station order and inspect your work before it leaves the smithy.'}),
 'forge-quartermaster':item('Kade Ironledger · Forge Quartermaster','A ledger carrying supply keeper linking smithing commissions, MZK trading and the Backpack.',[.76,1.88,.6],'crew',300,{crew:'quartermaster',greeting:'Finished pieces go to your Backpack. Our forge equipment and metalwork use the same market catalog as every other world.'})
});
export const FORGE_MODEL_INFO=Object.freeze(Object.fromEntries(Object.entries(FORGE_ITEMS).map(([id,value])=>[id,[value.name,value.description,value.dimensions]])));
export function forgeItemSettings(id){
 const value=FORGE_ITEMS[id];if(!value)return null;
 const behavior=value.behavior||(value.kind==='crew'?'talk':value.station?'interact':value.kind==='prop'||value.kind==='stock'?'decor':'pickup');
 return {active:true,behavior,action:value.action||'none',destructible:false,damage:0,interactionKey:'e',interactionDistance:5,...(value.product==='lantern'?{forgeLantern:true}:value.product==='bell'?{forgeBell:true,cooldown:1}:{}),forgeStation:value.station||false,forgeCrew:value.crew||false,forgeProduct:value.kind==='product'?id:false,forgeMaterial:value.kind==='stock'?id:false,...(value.station?{forgeApproach:{x:0,y:0,z:5}}:{}),prompt:(value.kind==='crew'?'Talk to ':value.station?'Use ':behavior==='pickup'?'Pick up ':behavior==='door'?'Open / close ':behavior==='switch'?'Light / extinguish ':value.product==='bell'?'Ring ':'Inspect ')+value.name+' · E / Use'};
}
export function forgeNativeItem(id){
 const value=FORGE_ITEMS[id];if(!value)return null;
 const function_data=forgeItemSettings(id);
 return {id,buildAssetId:id,name:value.name,description:value.description,dimensions:value.dimensions,type:value.kind==='crew'?'avatar':value.station?'interactive':'interior',category:value.kind==='crew'?'characters':value.kind==='tool'?'tools':'forge',builderCategory:'forge',priceMzk:value.priceMzk,useCostMzk:0,behavior:function_data.behavior,action:function_data.action,size:82,color:'#c28b4a',procedural:true,assetKind:'premade',image:'/public/images/native-designs/'+id+'.svg?v=forge-metallurgy-20261031',function_data,...(value.greeting?{dialogueSettings:{text:value.greeting}}:{})};
}
