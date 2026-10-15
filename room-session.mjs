export async function resolveAccountProof(store,bearerToken,cookieToken){
 for(const [token,mechanism]of [[bearerToken,'bearer'],[cookieToken,'cookie']]){
  if(!token)continue;const session=await store.authenticateSession(token);if(session)return {...session,token,session,mechanism};
 }
 return null;
}
// This recovers gameplay only. Callers must not use a game proof to authorize
// wallet writes, purchases or account administration.
export async function recoverRoomSession(accounts,games,proof){
 if(!proof)return null;
 const game=await games.authenticateSession(proof,{extend:true});if(!game)return null;
 const parent=await accounts.authenticateById(game.accountSessionId);
 return parent&&parent.accountId===game.accountId?{...parent,session:parent,mechanism:'game'}:null;
}
