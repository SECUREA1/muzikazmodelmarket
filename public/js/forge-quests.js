import {FORGE_RECIPES} from './forge-recipes.js?v=forge-atelier-20261031';

const quest=(id,name,contact,description,objective,rewardMzk,badge,extra={})=>Object.freeze({id,name,contact,description,objective,rewardMzk,badge,...extra});
/** Commissions count protected workshop and commerce records. Displayed progress
 * never authorizes a reward; the forge account transaction makes that decision. */
export const FORGE_QUESTS=Object.freeze([
 quest('first-maker-mark','Your first maker’s mark','Brann Emberhand','Take one workpiece through every heat treatment and finishing stage. Your first completed piece earns the smithy’s apprentice mark.','Finish any forge recipe.',15,'Apprentice’s Mark',{kind:'pieces',target:1}),
 quest('steady-hammer','The steady hammer','Brann Emberhand','Complete three workpieces to show that your first success was a repeatable craft. Every finished piece remains yours.','Finish three forge workpieces.',20,'Steady Hammer',{kind:'pieces',target:3,requires:['first-maker-mark']}),
 quest('armory-of-ember','Armory of Emberfall','Brann Emberhand','Master five different forged weapons: a pattern-welded blade, warhammer, axe, spear and dagger.','Forge every weapon design once.',45,'Emberfall Armorer',{kind:'designs',recipeIds:['forge-damascus-blade','forge-warhammer','forge-battle-axe','forge-spear','forge-dagger'],requires:['first-maker-mark']}),
 quest('alloy-studies','The voice of bronze','Dr. Sera Vale','Compare structural iron with bronze fittings by forging an Aegis shield and a bronze bell. Follow each work order’s treatment sequence.','Forge an Aegis Shield and Bronze Bell.',25,'Alloy Scholar',{kind:'designs',recipeIds:['forge-aegis-shield','forge-bronze-bell'],requires:['first-maker-mark']}),
 quest('works-for-the-world','Metalwork for a living world','Kade Ironledger','Supply useful metalwork: a working gate, lantern, bell and pickaxe. These pieces carry their own functions into the Backpack and Builder.','Forge the gate, lantern, bell and pickaxe.',30,'World Smith',{kind:'designs',recipeIds:['forge-iron-gate','forge-lantern','forge-bronze-bell','forge-pickaxe'],requires:['first-maker-mark']}),
 quest('master-of-patterns','Master of every pattern','Dr. Sera Vale','Complete each design in the forge collection. Your permanent design record follows your account across reconnects and wallet linking.','Forge every listed recipe once.',60,'Master of Patterns',{kind:'catalogue',requires:['steady-hammer']}),
 quest('first-market-sale','A maker’s first sale','Kade Ironledger','List one of your crafted pieces in Trading Market and complete a sale to another member. Listing alone does not complete the commission.','Complete a verified sale of your crafted forge item.',15,'Trading Smith',{kind:'commerce',counter:'sales',target:1,requires:['first-maker-mark'],destination:'market'}),
 quest('first-harbor-delivery','Across the shipping lanes','Kade Ironledger','Send your crafted metalwork through the warehouse and complete its verified freight delivery. Stock must reach its destination before this commission is complete.','Complete a verified delivery of your forge stock.',20,'Harbor Smith',{kind:'commerce',counter:'deliveries',target:1,requires:['first-maker-mark'],destination:'shipping'}),
 quest('first-store-order','On the shop floor','Kade Ironledger','Connect your metalwork to the world’s in-store economy by completing a verified store-stock order. A pending order is not a completed handover.','Complete a verified forge store-stock order.',20,'Shop Supplier',{kind:'commerce',counter:'stockOrders',target:1,requires:['first-maker-mark'],destination:'supply'})
]);
export const forgeQuest=id=>FORGE_QUESTS.find(quest=>quest.id===id)||null;
const count=value=>Number.isSafeInteger(value)&&value>0?value:0;
export function forgeQuestView(state={}){
 const accepted=state.quests?.accepted||{},claimed=state.quests?.claimed||{},byRecipe=state.byRecipe||{};
 return FORGE_QUESTS.map(quest=>{
  const recipeIds=quest.kind==='catalogue'?FORGE_RECIPES.map(recipe=>recipe.id):quest.recipeIds||[],target=recipeIds.length||quest.target||1;
  const current=quest.kind==='pieces'?count(state.completedItems):quest.kind==='commerce'?count(state.commerce?.[quest.counter]):recipeIds.filter(id=>count(byRecipe[id])>0).length;
  const unlocked=(quest.requires||[]).every(id=>Object.hasOwn(claimed,id)),isAccepted=Object.hasOwn(accepted,quest.id),isClaimed=Object.hasOwn(claimed,quest.id),complete=current>=target;
  return {...quest,current:Math.min(current,target),target,unlocked,accepted:isAccepted,complete,claimed:isClaimed,status:isClaimed?'claimed':!unlocked?'locked':!isAccepted?'available':complete?'ready':'active',missingDesigns:recipeIds.filter(id=>!count(byRecipe[id])).map(id=>({id,name:FORGE_RECIPES.find(recipe=>recipe.id===id)?.name||id.replace(/^forge-/,'').replaceAll('-',' ')}))};
 });
}
