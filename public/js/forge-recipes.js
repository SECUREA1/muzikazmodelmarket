/** The forge buys and consumes a complete material kit for each workpiece.
 * These are game timings; clients cannot supply prices, materials or results. */
export const FORGE_MATERIALS=Object.freeze({
 'forge-iron-ingot':{name:'Iron ingot',priceMzk:18},
 'forge-bronze-ingot':{name:'Bronze ingot',priceMzk:24},
 'forge-steel-billet':{name:'Steel billet',priceMzk:30},
 'forge-coal':{name:'Forge coal',priceMzk:8}
});
const recipe=(id,name,materials,hammerStrikes,description)=>Object.freeze({id,name,buildAssetId:id,materials:Object.freeze(materials.map(([id,quantity])=>Object.freeze({id,quantity}))),costMzk:materials.reduce((total,[id,quantity])=>total+FORGE_MATERIALS[id].priceMzk*quantity,0),heatMs:4000,hammerStrikes,temperMs:3500,description});
export const FORGE_RECIPES=Object.freeze([
 recipe('forge-damascus-blade','Stormfold Damascus Blade',[['forge-steel-billet',2],['forge-coal',2]],6,'Layer a steel billet, draw the blade at the anvil, quench, temper and polish its patterned finish.'),
 recipe('forge-warhammer','Emberstrike Warhammer',[['forge-iron-ingot',4],['forge-steel-billet',1],['forge-coal',2]],8,'Shape the heavy iron head, harden its steel face and finish a balanced forged warhammer.'),
 recipe('forge-battle-axe','Ironwake Battle Axe',[['forge-steel-billet',2],['forge-coal',2]],6,'Draw a steel axe head, quench its edge and temper it before fitting the finished haft.'),
 recipe('forge-aegis-shield','Aegis Forged Shield',[['forge-iron-ingot',2],['forge-bronze-ingot',2],['forge-coal',2]],8,'Raise an iron shield, forge its bronze rim and complete the heat treatment and finishing inspection.')
]);
export const FORGE_STAGE_ORDER=Object.freeze(['heat','hammer','quench','temper','finish']);
export const FORGE_STRIKE_COOLDOWN_MS=450;
export const forgeRecipe=id=>FORGE_RECIPES.find(recipe=>recipe.id===id)||null;
