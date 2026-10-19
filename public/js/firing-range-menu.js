import {FIRING_RANGE_MODES,FIRING_RANGE_WEAPONS} from './firing-range.js';
import {RANGED_WEAPONS} from './game-weapons.js';

const modeNames={freeplay:'Open practice',precision:'Precision',rapid:'Rapid fire',endurance:'Endurance',moving:'Moving targets'};
const next=(values,current)=>values[(values.indexOf(current)+1)%values.length];

/** The headset uses the same authoritative actions, rules, and equipment as the range panel. */
export function firingRangeMenu({range,actorId,tool,onAction,onWeapon,onMarket,onBackpack,onPanel,onExit}){
 if(!range)return [];
 const self=range.participants?.[actorId],player=self?.role==='player';
 const host=player&&(!range.hostId||range.hostId===actorId),active=['countdown','live','intermission'].includes(range.state),practice=active&&range.settings.mode==='freeplay';
 const items=[],settings=range.settings;
 if(practice&&!player)items.push({label:'Join open practice',run:()=>onAction('range-practice')});
 if(host&&!active)items.push({label:'Start open practice',run:()=>onAction('range-practice')},{label:'Start tournament · '+modeNames[settings.mode],run:()=>onAction('range-start')});
 if(host&&active)items.push({label:practice?'End open practice':'End tournament',run:()=>onAction('range-stop')});
 items.push({label:'Spectate from the safe lobby',run:()=>onAction('range-watch')});
 items.push({label:'Armory & optics',run:()=>onPanel('armory')},{label:'Marketplace · permanent upgrades',run:()=>onMarket({category:'weapons',intent:'browse'})},{label:'Your Backpack',run:onBackpack});
 if(host&&!active){
  for(const mode of FIRING_RANGE_MODES)items.push({label:`${settings.mode===mode?'✓ ':''}Event: ${modeNames[mode]}`,run:()=>onAction('range-settings',{settings:{mode}})});
  for(const [key,label,values]of [
   ['durationSeconds','Round seconds',[10,30,45,60,90,120,180,300,600]],
   ['rounds','Rounds',[1,2,3,4,5,6,7,8,9,10]],
   ['shotLimit','Shots per round',[1,10,12,20,30,40,60,100,200]],
   ['targetSpeed','Target speed',[.25,.5,1,1.5,2,3]],
   ['countdownSeconds','Countdown seconds',[0,1,3,5,10]]
  ])items.push({label:`${label}: ${settings[key]}`,run:()=>onAction('range-settings',{settings:{[key]:next(values,settings[key])}})});
  items.push({label:'Competition: '+(settings.teamMode?'Red vs Blue':'Individual'),run:()=>onAction('range-settings',{settings:{teamMode:!settings.teamMode}})});
 }
 if(player){
  const weapons=active&&!practice?[settings.weapon]:FIRING_RANGE_WEAPONS;
  for(const weapon of weapons)items.push({label:`${tool===weapon?'✓ ':''}${active&&!practice?'Tournament weapon':'Range loan'}: ${RANGED_WEAPONS[weapon].label}`,run:()=>onWeapon(weapon)});
  if(host&&!active)for(const weapon of FIRING_RANGE_WEAPONS)items.push({label:'Tournament weapon: '+RANGED_WEAPONS[weapon].label,run:()=>onAction('range-settings',{settings:{weapon}})});
 }
 if(!active||practice)for(const location of range.locations||[])for(const lane of location.lanes||[]){
  const occupied=Object.values(range.participants||{}).some(member=>member.id!==actorId&&member.role==='player'&&member.online!==false&&member.locationId===location.id&&member.lane===lane.index);
  if(!occupied)items.push({label:`${location.name} · Lane ${lane.index+1}`,run:()=>onAction('range-join',{locationId:location.id,lane:lane.index,team:self?.team||'red'})});
 }
 if(player&&!active)items.push({label:'Team: '+(self.team==='blue'?'Blue':'Red'),run:()=>onAction('range-join',{locationId:self.locationId,lane:self.lane,team:self.team==='blue'?'red':'blue'})});
 items.push({label:'Tournament setup & results',run:()=>onPanel('tournament')},{label:'Exit VR',run:onExit});
 return items;
}
