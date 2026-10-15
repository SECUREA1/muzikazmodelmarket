export const plotSpaceId=deed=>`plot-${deed.id}`;
export function plotPlayUrl(deed){const id=encodeURIComponent(plotSpaceId(deed));return `model-explorer.html?environment=${id}&house=${id}&autoplay=1`;}
export function memberPlotEnvironment(deed,bases){
 const available=bases.filter(base=>!base.memberPlot&&base.playable!==false&&base.visibility!=='private');
 const base=available.find(item=>item.id===deed.hostedSpace?.environmentId)||available.find(item=>item.id==='muzikaz-main')||available[0];
 if(!base)return null;
 const id=plotSpaceId(deed),name=deed.hostedSpace?.name||`${deed.name} · Member plot`;
 return {...base,id,aliases:[],name,label:'Member-hosted plot',description:`${deed.ownerName||'MUZIKAZ member'}’s multiplayer plot · ${base.name}`,category:'Member plots',source:'member-plot',memberPlot:true,ownerId:deed.ownerId,ownerName:deed.ownerName||'MUZIKAZ member',deedId:deed.id,worldId:deed.worldId,baseEnvironmentId:base.id,playUrl:plotPlayUrl(deed),visibility:'public',playable:true,multiplayer:true,live:true,roomId:id,canEdit:false,canDelete:false,builderScene:base.builderScene?{...base.builderScene,id,name}:undefined,createdAt:deed.acquiredAt,updatedAt:deed.updatedAt};
}
