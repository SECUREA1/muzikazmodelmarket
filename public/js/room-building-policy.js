export function buildingPolicy(room={},environment={}){
 return {enabled:room.building?.enabled??environment.builderScene?.gameplay?.building?.enabled??true,hostId:room.building?.hostId||null};
}
export function requireBuildingAllowed(room,environment){
 if(!buildingPolicy(room,environment).enabled)throw Object.assign(Error('Building is paused by the room host.'),{statusCode:403});
}
export function changeBuildingPolicy(room,actorId,enabled,hostId=buildingPolicy(room).hostId){
 if(typeof enabled!=='boolean')throw Object.assign(Error('Choose whether building is allowed.'),{statusCode:400});
 if(!hostId||actorId!==hostId)throw Object.assign(Error('Only the room host can change building permissions.'),{statusCode:403});
 room.building={enabled,hostId};return room.building;
}
