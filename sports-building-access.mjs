// Match membership grants access to the shared building layer, never match control.
export function sportsBuildingAccess(hockey,arcade,actorId,now=Date.now()){
 const seen=hockey?.seen?.get(actorId);
 if(Number.isFinite(seen)&&now-seen<15000){const player=hockey.state.players.find(player=>player.human===actorId);return {hostId:hockey.state.host,position:player?{x:player.x,y:0,z:player.z}:null};}
 const member=arcade?.members?.get(actorId);
 if(member&&now-member.at<15000)return {hostId:arcade.host,position:null};
 return null;
}
