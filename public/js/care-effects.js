// Only fresh, server-confirmed receipts can affect this running game session.
export class CareEffects {
 constructor({apply,startedAt=Date.now()}){this.apply=apply;this.startedAt=startedAt;this.seen=new Set();}
 accept(state){for(const receipt of state.recentCare||[state.receipt]){
  if(!receipt||receipt.type!=='RPG_USE'||receipt.walletId!==state.owner_id||Date.parse(receipt.createdAt)<this.startedAt||!Number.isFinite(Date.parse(receipt.createdAt)))continue;
  const key=receipt.walletId+':'+receipt.id;if(this.seen.has(key))continue;this.seen.add(key);this.apply(receipt.effect);
 }}
}
