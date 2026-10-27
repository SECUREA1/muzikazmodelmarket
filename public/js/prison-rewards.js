import {PRISON_ITEMS} from './prison-items.js';

/** Earned once per account; security items and prison supplies stay in the room. */
export const PRISON_REWARDS=Object.freeze([
 ['prison-radio','radio','Tune Ironwood FM to earn your own portable radio.'],
 ['prison-chess-set','arcade','Complete the arcade round to earn a recreation-room chess set.'],
 ['prison-supply-crate','work','Complete a workshop shift to earn a furnished supply crate.'],
 ['prison-earned-trophy','escape','Finish the escape challenge to earn the Ironwood trophy.']
].map(([id,goal,instructions])=>Object.freeze({id,buildAssetId:id,goal,instructions,name:PRISON_ITEMS[id].name,description:PRISON_ITEMS[id].description,thumbnailUrl:PRISON_ITEMS[id].thumbnailUrl})));
export const prisonRewardFor=id=>PRISON_REWARDS.find(reward=>reward.id===id)||null;
