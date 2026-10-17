import {ARCADE_GAMES} from './arcade-games.js';
import {EXTRA_ARCADE_GAMES} from './extra-arcade-games.js';
export const ARCADE_LIBRARY=Object.freeze([
 ...Object.values(ARCADE_GAMES).map(game=>({...game,id:game.game,kind:'arcade'})),
 ...EXTRA_ARCADE_GAMES.map(game=>({...game,id:game.game})),
 {id:'slots',kind:'slots',name:'Arcade Slots',description:'Three-reel practice-credit slots.'},
 {id:'poker',kind:'poker',name:'Video Poker',description:'Deal, hold and draw a five-card practice hand.'},
 {id:'trivia',kind:'trivia',name:'Trivia Challenge',description:'Answer shared-world questions.'}
].map(Object.freeze));
export const MULTI_ARCADE_PROFILE=Object.freeze({name:'Commons Arcade · 30 games',kind:'arcade',game:'tictactoe',multiGame:true,description:'One shared cabinet with a full game library, server-controlled play and spectator screens.',color:0x76dfff,shape:'arcade'});
