/** Free practice uses the local court, separate from the shared live match. */
export function isBasketballFreePlay(value) {
 const url=new URL(value);
 return url.searchParams.get('mode')==='solo'&&url.searchParams.get('basketballMode')==='freeplay';
}

export function basketballWorldModeUrl(value,mode) {
 if(!['freeplay','solo','multiplayer'].includes(mode))throw Error('Choose Free play, Solo vs AI or Live multiplayer.');
 const url=new URL(value);
 url.searchParams.set('mode',mode==='freeplay'?'solo':mode);
 if(mode==='freeplay')url.searchParams.set('basketballMode','freeplay');else url.searchParams.delete('basketballMode');
 url.searchParams.set('autoplay','1');url.searchParams.delete('matchmaking');
 return url.href;
}

export function prepareBasketballFreePlay(sim,player,now) {
 const game=sim.basketball,ball=sim.actors?.[game?.ballId];
 if(!game||game.state!=='ready'||!ball||!player)throw Error('Open a new practice court before starting free play.');
 player.position={x:0,y:0,z:-8};player.yaw=0;player.floor=0;player.velocityY=0;player.grounded=true;player.input={};player.lastSeen=now;player.heldId=null;
 ball.position={x:.5,y:0,z:-8.75};ball.ballFloor=0;ball.holderId=null;
 delete ball.ballVelocity;delete ball.basketballShot;delete ball.ballCatchSegment;
 game.lastPlay='Free play · catch, pass and shoot. No timer or opponents.';
 return game;
}
