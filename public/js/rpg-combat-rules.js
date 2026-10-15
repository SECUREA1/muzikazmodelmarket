export const PLAYER_HIT_CAPACITY=45;
export function healthAfterHit(health){return Math.max(0,Math.round(Number(health)*PLAYER_HIT_CAPACITY/100)-1)*100/PLAYER_HIT_CAPACITY;}
export function hitsRemaining(health){return Math.max(0,Math.round(Number(health)*PLAYER_HIT_CAPACITY/100));}
