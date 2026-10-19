// Preserve discrete actions during an in-flight request, with a bounded backlog.
export function createGameActionQueue(limit=8){
 const actions=[];
 return {push(action){if(actions.length>=limit)return false;actions.push(action);return true;},shift:()=>actions.shift(),clear:()=>{actions.length=0;},get length(){return actions.length;}};
}
