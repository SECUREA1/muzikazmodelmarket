// The account identity stays stable when a member connects a wallet. Move the
// private gameplay ledger with its wallet record; never copy or reseed stock.
const fields=new Set(['walletId','ownerId','owner_id','captainId','issuedTo','sellerId','buyerId','counterpartyId','from','to','creatorId','creator','user_id']);
const own=(object,key)=>Object.hasOwn(object,key);
export function migrateGameplayWallet(data,previousWallet,wallet){
 if(previousWallet===wallet)return;
 function rekey(store,separator=''){
  if(!store||typeof store!=='object')return;
  for(const key of Object.keys(store)){
   if(key!==previousWallet&&(!separator||!key.startsWith(previousWallet+separator)))continue;
   const next=wallet+key.slice(previousWallet.length);
   if(own(store,next)&&JSON.stringify(store[next])!==JSON.stringify(store[key]))throw Object.assign(new Error('This wallet has conflicting saved gameplay records. The account connection was not changed.'),{statusCode:409});
   store[next]=store[key];delete store[key];
  }
 }
 const stores=['factory','factoryTesting','factoryLogistics','shipping','fishing','fitness','prison'];
 for(const name of stores)rekey(data[name]?.accounts);
 rekey(data.factoryLogistics?.productionCredits);
 rekey(data.factoryModelOwnership,'\n');
 rekey(data.worldSupply?.receipts,':');
 function walk(value){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(walk);return;}
  if(value.releasedReservations)rekey(value.releasedReservations,':');
  for(const [key,child] of Object.entries(value)){
   if(fields.has(key)&&child===previousWallet)value[key]=wallet;
   else if(child&&typeof child==='object')walk(child);
  }
 }
 // Proof ids and stable room actor ids are deliberately left untouched.
 for(const name of [...stores,'factoryModelOwnership','worldSupply'])walk(data[name]);
}
