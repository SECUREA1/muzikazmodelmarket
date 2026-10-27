import {FUNHOUSE_ID,funhouseStations} from './clown-funhouse-config.js';

export const FUNHOUSE_ADVENTURE_RULES=Object.freeze({durationMs:600000,cluePoints:25,maximumBonus:100});
export const FUNHOUSE_ADVENTURE_START=Object.freeze({id:'funhouse-adventure',name:'The Lost Laugh Trail',position:Object.freeze({x:0,y:.02,z:40}),interactionDistance:5});
const clue=(id,name,x,z,hint,discovery,scare)=>Object.freeze({id,name,position:Object.freeze({x,y:.02,z}),interactionDistance:3.2,hint,discovery,scare});
export const FUNHOUSE_ADVENTURE_CLUES=Object.freeze([
 clue('ticket-trick','The Vanishing Ticket',38,36,'Search beside Tickets & Tricks on the east midway.','A ticket unfolds by itself: “The costume keeper heard the next laugh.”','ticket'),
 clue('wardrobe-whisper','The Whispering Wardrobe',-38,34,'Find the whispering wardrobe beside the clown dressing room.','The wardrobe answers with a giggle: “Follow the splashes to a drowned mask.”','wardrobe'),
 clue('drowned-mask','The Drowned Mask',-30,15,'Look for the dripping mask near the water-gun gallery.','The mask bubbles: “A shadow is waiting beside the giant spinner hat.”','mask'),
 clue('spinner-shadow','The Shadow Under the Hat',36,3,'Search the moonlit side of the dizzy spinner.','A second shadow points toward the monster playroom inside the house.','shadow'),
 clue('playroom-secret','The Playroom Secret',10,-16,'Enter the grinning doorway and inspect the playroom secret on the right.','A toy chest opens: “Take the crooked mirror passages to the final laugh.”','chest'),
 clue('last-laugh','The Last Laugh Lantern',-18,-38,'Follow the mirror maze passages to the lantern near the exit bell.','The lantern fills with six lost laughs. The midway has its voice again!','lantern')
]);

/** The trail markers belong to the complete permanent scenery, not to a single
 * purchased attraction or an editable copy that can delete those markers. */
export function funhouseAdventureAvailable(environment){
 return environment?.id===FUNHOUSE_ID&&funhouseStations(environment).some(station=>station.kind==='welcome'&&station.source!=='placed');
}
export function funhouseAdventureNextClue(adventure){
 return adventure?.status==='active'&&Number.isInteger(adventure.clueIndex)?FUNHOUSE_ADVENTURE_CLUES[adventure.clueIndex]||null:null;
}
export function funhouseAdventureNear(position,target){
 return Boolean(position&&target&&Math.hypot(position.x-target.position.x,(position.y||0)-target.position.y,position.z-target.position.z)<=target.interactionDistance);
}
