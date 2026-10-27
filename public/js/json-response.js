// Game requests can receive an HTML proxy/error page during a deployment.
// Keep that failure distinct from saved game data and preserve abort semantics.
export async function readJsonResponse(response,{label='The game server'}={}){
 const invalid=cause=>Object.assign(new Error(label+(response.status>=500?' is temporarily unavailable':' returned an invalid game-data response')+'. Please try again.'),{code:'INVALID_JSON_RESPONSE',status:response.status,cause});
 const contentType=response.headers?.get?.('content-type')||'';
 if(/(?:text\/html|application\/xhtml\+xml)/i.test(contentType))throw invalid();
 let payload;
 try{payload=await response.json();}catch(error){if(error?.name==='AbortError')throw error;throw invalid(error);}
 if(payload===null||typeof payload!=='object')throw invalid();
 return payload;
}
