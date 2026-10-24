import {isFitnessEnvironment,fitnessStations} from './fitness-config.js';
import {isCasinoEnvironment} from './casino-config.js';

// Contracts add room score only. Native workout and favor rewards keep their
// own rules; accepting a contract never starts a workout, favor, or wager.
export function siteWorkOffers(environment){
 const prefix='map:'+encodeURIComponent(environment?.id||'local')+':';
 const shared={kind:'site-work',mode:'foot',timeLimit:1200,winBonus:0};
 const offers=[];
 if(isFitnessEnvironment(environment)&&fitnessStations(environment).length)offers.push({...shared,id:prefix+'fitness-set',siteWork:'fitness-set',title:'Coach’s fresh-set challenge',description:'Walk to a fitness station, start a new training set and finish with at least 480 timing points. Only a set started after accepting this challenge counts.',reward:400});
 if(isCasinoEnvironment(environment))offers.push({...shared,id:prefix+'casino-favor',siteWork:'casino-favor',title:'Casino hospitality shift',description:'Ask a host, guard or refreshments vendor for a favor. Accept a new favor, walk its public route and report back. No wager or purchase is required.',reward:350});
 return offers;
}
