const fail=message=>{throw Object.assign(Error(message),{statusCode:400});};
// The server accepts transforms, never client-provided ownership or asset data.
export function validateOwnedPlacement(value,player){
 if(!value||typeof value!=='object')fail('Choose a placement before locking this item.');
 for(const key of ['position','rotation','scale'])if(!Array.isArray(value[key])||value[key].length!==3||!value[key].every(Number.isFinite))fail('Invalid item transform.');
 const [x,y,z]=value.position;
 if(Math.hypot(x-player.position.x,y-player.position.y,z-player.position.z)>20)fail('Place items within 20 metres of your player.');
 if(value.position.some(n=>Math.abs(n)>100000)||value.rotation.some(n=>Math.abs(n)>Math.PI*8)||value.scale.some(n=>n<.1||n>8))fail('Item position, rotation or scale is out of range.');
 return {position:{x,y,z},rotation:Object.fromEntries(['x','y','z'].map((axis,index)=>[axis,value.rotation[index]])),scale:Object.fromEntries(['x','y','z'].map((axis,index)=>[axis,value.scale[index]]))};
}
