import {ARCADE_GAMES} from './arcade-games.js';
export const INTERACTIVE_DEVICES=Object.freeze({
 ...Object.fromEntries(Object.entries(ARCADE_GAMES).map(([id,item])=>[id,{...item,kind:'arcade'}])),
 'market-atm':{name:'MZK Market ATM',kind:'market',description:'Open the live item marketplace and your Backpack.',color:0x96f04e,shape:'kiosk'},
 'item-vending-machine':{name:'Item Vending Machine',kind:'market',description:'Shop equipment and building supplies using your own account.',color:0x36dccc,shape:'kiosk'},
 'shared-video-player':{name:'Community Video Player',kind:'video',description:'Anyone nearby can upload a video or add a link to the shared queue.',color:0x51b8ff,shape:'screen'},
 'cinema-screen':{name:'Cinema Wall',kind:'video',description:'A wide shared screen for community movie sessions.',color:0xad81ff,shape:'cinema'},
 'media-boombox':{name:'Crew Boombox',kind:'audio',description:'A shared audio queue with distance-based volume.',color:0xffc14b,shape:'speaker'},
 'shared-jukebox':{name:'Neon Jukebox',kind:'audio',description:'Queue music and share playback with the room.',color:0xff69a3,shape:'jukebox'},
 'radio-console':{name:'Radio Console',kind:'audio',description:'Tune a direct audio stream for nearby listeners.',color:0x60dfba,shape:'speaker'},
 'dj-mixing-deck':{name:'DJ Mixing Deck',kind:'audio',description:'Control the shared track, seek position and room volume.',color:0xb3f653,shape:'deck'},
 'karaoke-machine':{name:'Karaoke Stage',kind:'audio',description:'Queue backing tracks alongside the existing room voice chat.',color:0xff79e7,shape:'karaoke'},
 'video-projector':{name:'Video Projector',kind:'video',description:'A projector station with a shared display.',color:0x7bc9ff,shape:'projector'},
 'digital-photo-frame':{name:'Community Photo Frame',kind:'image',description:'Share an image on an in-world frame.',color:0xf5bc78,shape:'screen'},
 'community-noticeboard':{name:'Community Noticeboard',kind:'board',description:'Post a shared message for everyone in this space.',color:0x91c7fa,shape:'board'},
 'trivia-terminal':{name:'Trivia Challenge',kind:'trivia',description:'Answer server-checked questions and compare arcade scores.',color:0xf9d861,shape:'arcade'},
 'arcade-slot-machine':{name:'Arcade Slots',kind:'slots',description:'Spin three reels using separate practice credits.',color:0xff9770,shape:'arcade'},
 'video-poker-table':{name:'Video Poker Table',kind:'poker',description:'Deal, hold and draw a five-card hand using practice credits.',color:0x69df9a,shape:'table'}
});
export const deviceDefinition=(modelId,gameplay={})=>INTERACTIVE_DEVICES[gameplay.device]||INTERACTIVE_DEVICES[modelId]||null;
export function sharedMediaUrl(value,kind){
 const text=String(value||'').trim();if(text.length>2048)throw Error('Media link is too long.');
 const local=/^\/uploads\/media\/[a-zA-Z0-9-]+\.(mp4|webm|mp3|wav|ogg|png|jpg|webp)$/.test(text);let url;
 try{url=new URL(text,'https://local.invalid');}catch{throw Error('Enter a direct media link.');}
 if(!local&&(url.protocol!=='https:'||url.username||url.password||url.hostname==='local.invalid'))throw Error('Use a public HTTPS media link or a server media upload.');
 const allowed=kind==='video'?/\.(mp4|webm|ogg)$/i:kind==='image'?/\.(png|jpe?g|webp)$/i:/\.(mp3|wav|ogg|mp4|webm)$/i;
 if(!allowed.test(url.pathname))throw Error('Use a direct '+kind+' file link in a supported format.');return local?text:url.href;
}
export function deviceTime(state,now){return Math.max(0,(state?.offset||0)+(state?.playing?Math.max(0,now-state.startedAt)/1000:0));}
