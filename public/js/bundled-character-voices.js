// Licensed neural recordings ship with the page so map guides do not depend
// on a live synthesis request. Newly authored dialogue still uses the server.
const normalize=value=>String(value??'').replace(/\s+/g,' ').trim();
export const BUNDLED_PREVIEW_TEXT='Hello. This is your selected voice. You are ready to explore the world.';
export const BUNDLED_VOICE_TEXTS=Object.freeze([
 "Beach-bar drinks have independent two-minute buzz effects.",
 "Choose a call to travel, accept a job or join a team when ready.",
 "Choose a ride, skill challenge or adventure and follow its on-screen objectives.",
 "Choose an arcade machine and open its controls to play.",
 "Choose an available aircraft on the local map, then use Tower radio for runway clearance.",
 "Crew Dispatch offers supply, escort and rescue assignments.",
 "Explore the beaches and resort activities with the standard world controls.",
 "Follow the marked consoles and solve the containment power puzzle to reach the deeper bunker.",
 "Follow the marked site objectives.",
 "Follow the puck, your team objectives and the live score.",
 "Follow your team objectives and the live score.",
 "Load evenly, secure your cargo, then follow the chart to dock and unload.",
 "Meet the A I residents, accept Quests, or board a boat from the map.",
 "Open Quests for local practice objectives.",
 "Open Shipping to choose a cargo contract.",
 "Open World radio for new jobs and players calling for help.",
 "Open the construction controls to choose a machine or assign crew work.",
 "Open the game controls whenever you need help getting started.",
 "Open the range controls to join a firing lane, choose a practice session or enter an available competition.",
 "Open the ski controls to join a race or explore the mountain.",
 "Quests offers cargo and rescue flights.",
 "Read the posted instructions and follow the available role and activity objectives.",
 "Speak with the hosts for favors, or approach a table to see its rules before playing.",
 "Supported games let you join another player or watch their round.",
 "The coaches can help you choose a workout.",
 "Use the court controls to join a team or watch the game.",
 "Use the local map to find a free boat and nearby docks.",
 "Use the local map to find nearby places and Quests to choose a walking route or activity.",
 "Use the local map to find the marked prison areas.",
 "Use the match controls to join a team or watch.",
 "Use the resort map to find the lifts and runs.",
 "Use the testing controls to prepare a saved factory model, deploy it on the pad and follow the launch checklist.",
 "Visit the factory stations to choose a recipe, fabricate an item, load it and complete its dispatch job.",
 "Walk to a training station and use its controls to start a set.",
 "Walk to an attraction to see its controls.",
 "Welcome to Atlas Factory Proving Grounds.",
 "Welcome to Atlas Missile and Rocket Factory.",
 "Welcome to Bassline Badlands, Deed Fields.",
 "Welcome to Bassline Badlands.",
 "Welcome to Crew Plaza Entrance.",
 "Welcome to Crew Plaza Interior.",
 "Welcome to Crew Plaza Outdoors.",
 "Welcome to Crew Plaza, Deed Fields.",
 "Welcome to Crew Plaza.",
 "Welcome to Echo Gardens, Deed Fields.",
 "Welcome to Echo Gardens.",
 "Welcome to Firing Range, Force Training.",
 "Welcome to Ice Hockey Arena.",
 "Welcome to Ironwood Prison.",
 "Welcome to Island Adventure, Tropical Resort.",
 "Welcome to Jail Cells.",
 "Welcome to Kitchen Upper Deck.",
 "Welcome to Kitchen.",
 "Welcome to MUZIKAZ Basketball Arena.",
 "Welcome to MUZIKAZ Fitness Centre.",
 "Welcome to MUZIKAZ Full House.",
 "Welcome to MUZIKAZ International Airport.",
 "Welcome to MUZIKAZ Live Firing Range.",
 "Welcome to MUZIKAZ Main Floor.",
 "Welcome to MUZIKAZ Upper Deck.",
 "Welcome to Midnight Laughs Funhouse.",
 "Welcome to Mountain Nuclear Research Compound.",
 "Welcome to Neon Docks, Deed Fields.",
 "Welcome to Neon Docks.",
 "Welcome to Neon Junction, Arcade Park.",
 "Welcome to Pixel Peaks Ski Resort.",
 "Welcome to Pixel Peaks, Deed Fields.",
 "Welcome to Pixel Peaks.",
 "Welcome to Public Commons.",
 "Welcome to Sheep Base.",
 "Welcome to Skyline Construction, Crane and Earthworks.",
 "Welcome to Skyline Deck, Deed Fields.",
 "Welcome to Skyline Deck.",
 "Welcome to Starlight Grand Casino.",
 "Welcome to Strait of Hormuz, Shipping Academy.",
 "Welcome to Studio Ridge Interior.",
 "Welcome to Studio Ridge Outdoors.",
 "Welcome to Studio Ridge, Deed Fields.",
 "Welcome to Studio Ridge.",
 "Welcome to Volt City, Deed Fields.",
 "Welcome to Volt City.",
 "Welcome to World Item Factory.",
 "Welcome to this world.",
 "Your guide will announce objective changes as you explore."
]);
const known=new Set(BUNDLED_VOICE_TEXTS);
export function bundledVoiceId(value){let result=2166136261;for(const character of normalize(value)){result^=character.codePointAt(0);result=Math.imul(result,16777619);}return (result>>>0).toString(16).padStart(8,'0');}
export function bundledVoiceURL(value,gender='female'){
 if(!['female','male'].includes(gender))return null;
 const line=normalize(value);
 if(line===BUNDLED_PREVIEW_TEXT)return '/public/audio/voices/'+gender+'-preview.wav';
 return known.has(line)?'/public/audio/voices/world/'+gender+'-'+bundledVoiceId(line)+'.mp3':null;
}
export function splitBundledSpeech(value){
 const line=normalize(value),chunks=[];
 function append(sentence){
  let remaining=sentence.trim();
  while(remaining.length>180){
   let end=remaining.lastIndexOf(' ',180);if(end<1)end=180;
   if(end===180&&/[\uD800-\uDBFF]/.test(remaining[end-1])&&/[\uDC00-\uDFFF]/.test(remaining[end]))end--;
   chunks.push(remaining.slice(0,end).trim());remaining=remaining.slice(end).trim();
  }
  if(remaining)chunks.push(remaining);
 }
 let start=0;
 for(const match of line.matchAll(/[.!?]+["')\]]*(?=\s|$)/g)){const end=match.index+match[0].length;append(line.slice(start,end));start=end;}
 append(line.slice(start));return chunks;
}
