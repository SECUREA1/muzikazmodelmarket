// Shared quest rules; rewards are room score, never wallet currency.
export function questInteraction(player, input, fallbackId) {
 const quest=input||{},id=String(quest.id||fallbackId).slice(0,100),title=String(quest.title||'Neighborhood job').slice(0,140);
 const required=Array.isArray(quest.requiredItems)?[...new Set(quest.requiredItems.map(String).filter(Boolean))].slice(0,16):[];
 player.quests ||= {};
 if(player.quests[id]==='complete')return title+': already completed.';
 if(player.quests[id]!=='active'){player.quests[id]='active';return title+': '+(required.length?'Find '+required.join(', ')+', then return.':'Return to finish this job.');}
 const missing=required.filter(item=>!player.inventory?.includes(item));
 if(missing.length)return title+': still need '+missing.join(', ')+'.';
 player.quests[id]='complete';
 const score=Number(quest.rewardScore??quest.reward??25);player.score=(player.score||0)+(Number.isFinite(score)?Math.max(0,Math.min(50,score)):0);
 return title+': complete!';
}
