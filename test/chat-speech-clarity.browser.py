"""Check chat/game speech ownership with an explicit shared-adapter fixture.

Real generated audio and HTTP playback are covered by neural-speech.browser.py;
this fixture controls completion/error events to exercise UI lifecycle races.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os, json

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  page = browser.new_page(); errors=[]
  page.on('pageerror', lambda error:errors.append(str(error)))
  page.route('**/public/js/neural-character-speech.js',lambda route:route.fulfill(status=200,content_type='text/javascript',body='''
   export function gameSpeech(){return window.speechSynthesis;}
   export const GameSpeechUtterance=window.SpeechSynthesisUtterance;
   export const GENERATED_VOICES=window.speechSynthesis.getVoices();
  '''))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  result=page.evaluate('''async () => {
   const assert=(condition,message)=>{if(!condition)throw Error(message);};
   const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
   const markup=new DOMParser().parseFromString(await (await fetch('/model-explorer.html')).text(),'text/html');
   document.body.replaceChildren(markup.querySelector('#crib-chat-toggle'),markup.querySelector('#crib-social'));
   localStorage.setItem('muzikazHouseSessionId','self');
   localStorage.setItem('muzikazMultiplayerWorld','room-a');
   localStorage.setItem('muzikazChatTextToSpeech','true');
   localStorage.removeItem('muzikazDesignatedAvatar');
   window.MUZIKAZ_HOUSE_TRACKING={roomId:'room-a'};
   const voices=[
    {name:'MUZIKAZ Natural Female',voiceURI:'muzikaz:neural-female',gender:'female',lang:'en-US',generated:true,natural:true,default:true},
    {name:'MUZIKAZ Natural Male',voiceURI:'muzikaz:neural-male',gender:'male',lang:'en-US',generated:true,natural:true,default:false}
   ];
   const speech=Object.assign(new EventTarget(),{spoken:[],cancelled:0,current:null,autoStart:true,getVoices:()=>voices,resume(){},
    speak(call){this.spoken.push(call);this.current=call;if(this.autoStart)call.onstart?.();this.dispatchEvent(new Event('statechange'));},
    cancel(){this.cancelled++;const previous=this.current;this.current=null;this.dispatchEvent(new Event('statechange'));previous?.onerror?.({error:'interrupted'});}
   });
   window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
   Object.defineProperty(window,'speechSynthesis',{value:speech,configurable:true});
   let stream;
   window.EventSource=class extends EventTarget {
    constructor(){super();stream=this;this.closed=false;}
    close(){this.closed=true;}
    emit(data){this.dispatchEvent(new MessageEvent('house-chat-message',{data:JSON.stringify(data)}));}
   };
   window.MUZIKAZ_API={url:path=>path,fetch:async(path,options={})=>{
    if(path.includes('/presence'))return new Response(JSON.stringify({data:{users:[],capacity:15}}));
    if(path.includes('/chat'))return new Response(JSON.stringify({data:{messages:[]}}));
    return new Response(JSON.stringify({data:{signals:[]}}));
   }};
   const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
   const worldVoice=createQuestConversationVoice();
   worldVoice.unlock();worldVoice.announce('Welcome to this world.',{worldId:'room-a',category:'introduction'});
   await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/public/js/crib-multiplayer.js';script.onload=resolve;script.onerror=reject;document.body.append(script);});
   window.dispatchEvent(new CustomEvent('muzikaz:multiplayer-room-ready',{detail:{roomId:'room-a'}}));
   await settle();
   const toggle=document.querySelector('#crib-tts-toggle');
   let id=0;
   const emit=(message,roomId=window.MUZIKAZ_HOUSE_TRACKING.roomId)=>stream.emit({id:'chat-'+ ++id,message,roomId,username:'Taylor',sessionId:'other',createdAt:new Date().toISOString()});
   const finish=()=>{const active=speech.current;speech.current=null;speech.dispatchEvent(new Event('statechange'));active?.onend?.();};
   emit('Hello during the welcome.');await settle();
   assert(speech.spoken.length===1&&speech.cancelled===0,'Chat queued or interrupted the world introduction');
   assert(document.querySelector('#crib-chat-messages').textContent.includes('Hello during the welcome.'),'Skipped speech lost its visible message');
   toggle.click();toggle.click();await settle();
   assert(speech.cancelled===0&&worldVoice.state.speaking,'Chat TTS toggle cancelled another speaker');
   finish();await settle();
   assert(speech.spoken.length===1,'Skipped welcome-time message was replayed later');
   window.MUZIKAZ_AUDIO_PREFERENCES={speechVoiceURI:'missing-device-voice',speechVoiceGender:'male'};
   emit('A clear room message.');await settle();
   assert(speech.spoken.length===2&&speech.current.text.includes('A clear room message.'),'Chat did not speak once the game voice finished');
   assert(speech.current.voice?.voiceURI==='muzikaz:neural-male','A saved missing device voice silenced chat instead of using the selected generated gender');
   assert(speech.current.pitch===1,'Chat applied an artificial pitch');
   emit('Do not queue over the first message.');await settle();
   assert(speech.spoken.length===2,'Chat created its own overlapping speech backlog');
   toggle.click();await settle();
   assert(speech.cancelled===1,'Chat TTS toggle did not cancel its own speech');
   const read=[...document.querySelectorAll('[data-chat-read]')].find(button=>button.closest('li').textContent.includes('A clear room message.'));
   assert(read&&!read.disabled,'An existing chat message has no usable Read aloud control');
   read.click();await settle();
   assert(speech.current?.text.includes('A clear room message.'),'Explicit Read aloud did not speak existing text while automatic reading was off');
   assert(toggle.getAttribute('aria-pressed')==='false','Reading one message enabled automatic history playback');
   speech.current.onerror?.({error:'synthesis-unavailable'});await settle();
   assert(/could not be read|retry/i.test(document.querySelector('#crib-voice-status').textContent),'A playback failure disappeared without retry guidance');
   assert(read.getAttribute('aria-pressed')==='false','Failed playback left a stuck Stop reading button');
   read.click();await settle();assert(speech.current?.text.includes('A clear room message.'),'Read aloud could not retry a failed message');
   read.click();await settle();assert(!speech.current,'Stop reading did not stop its own message');
   // These are controlled transport failures, not claims about native voice
   // quality. The real room test measures generated PCM through Web Audio.
   voices.push({name:'Local Female Natural',voiceURI:'local-female',gender:'female',lang:'en-US',localService:true},
    {name:'eSpeak English',voiceURI:'espeak:en',gender:'male',lang:'en-US',localService:true},
    {name:'Local Male Natural',voiceURI:'local-male',gender:'male',lang:'en-US',localService:true});
   speech.autoStart=false;read.click();await settle();
   const unavailableGenerated=speech.current,fallbackCount=speech.spoken.length;
   assert(unavailableGenerated.voice.generated,'The selected generated voice should be attempted first');
   unavailableGenerated.onerror({error:'synthesis-unavailable'});await settle();
   assert(speech.spoken.length===fallbackCount+1&&speech.current.voice.voiceURI==='local-male','Unavailable generated chat did not select a suitable local voice of the selected gender');
   assert(speech.current.text===unavailableGenerated.text&&speech.current.pitch===1,'Local fallback changed the message or shifted its pitch');
   unavailableGenerated.onend();assert(read.getAttribute('aria-pressed')==='true','An old callback stopped the replacement voice');
   speech.current.onerror({error:'synthesis-failed'});await settle();
   assert(speech.spoken.length===fallbackCount+1&&read.getAttribute('aria-pressed')==='false','Failed local fallback entered a retry cycle');finish();
   read.click();await settle();const audibleGenerated=speech.current,afterStarted=speech.spoken.length;audibleGenerated.onstart();audibleGenerated.onerror({error:'synthesis-unavailable'});await settle();
   assert(speech.spoken.length===afterStarted,'A partially heard message was repeated through a local voice');finish();speech.autoStart=true;
   const afterManualReading=speech.cancelled;
   worldVoice.announce('A new job is available.',{worldId:'room-a',key:'job'});
   toggle.click();await settle();
   assert(speech.cancelled===afterManualReading&&worldVoice.state.speaking,'Enabling chat interrupted a new game announcement');
   const beforeQueue=speech.spoken.length;
   emit('A fresh message while the NPC is speaking.');await settle();
   emit('The latest fresh message wins.');await settle();
   assert(speech.spoken.length===beforeQueue&&worldVoice.state.speaking,'A new chat message interrupted the NPC');
   finish();await settle();
   assert(speech.spoken.length===beforeQueue+1&&speech.current.text.includes('latest fresh message'),'The latest fresh other-player message did not play once the NPC finished');
   finish();await settle();
   const actualClock=Date.now;let queueClock=actualClock();Date.now=()=>queueClock;
   worldVoice.announce('A longer activity explanation.',{worldId:'room-a',key:'queue-expiration'});
   emit('This pending message must expire.');await settle();const beforeExpiration=speech.spoken.length;
   queueClock+=16000;finish();await settle();
   assert(speech.spoken.length===beforeExpiration,'Expired chat became an automatic speech backlog');Date.now=actualClock;
   worldVoice.announce('Another NPC turn.',{worldId:'room-a',key:'queue-muted'});emit('A pending message that will be muted.');await settle();
   const beforeMute=speech.spoken.length;window.MUZIKAZ_AUDIO_PREFERENCES={dialogueMuted:true};window.dispatchEvent(new CustomEvent('muzikaz:audio-preferences'));finish();await settle();
   assert(speech.spoken.length===beforeMute,'A pending message escaped the dialogue mute');window.MUZIKAZ_AUDIO_PREFERENCES={speechVoiceGender:'male'};
   const beforeOwn=speech.spoken.length;stream.emit({id:'own-message',message:'Do not echo my own text.',roomId:'room-a',username:'Me',sessionId:'self'});await settle();
   assert(speech.spoken.length===beforeOwn,'Automatic playback echoed the sender text');
   emit('This message belongs to the old room.');await settle();
   assert(speech.current?.text.includes('old room'),'Old-room test message did not start');
   const beforeTravel=speech.cancelled;
   window.MUZIKAZ_HOUSE_TRACKING={roomId:'room-b'};
   window.dispatchEvent(new CustomEvent('muzikaz:multiplayer-world-change',{detail:{roomId:'room-b'}}));
   await settle();
   assert(speech.cancelled===beforeTravel+1,'Map travel left the old room message speaking');
   assert(!speech.current,'Map travel retained an active chat utterance');
   emit('Late old-room message.','room-a');await settle();
   assert(!speech.current,'A late old-room message started after travel');
   window.dispatchEvent(new CustomEvent('muzikaz:multiplayer-room-ready',{detail:{roomId:'room-b'}}));
   await settle();
   emit('This async message must not cross maps.');
   window.MUZIKAZ_HOUSE_TRACKING={roomId:'room-c'};
   window.dispatchEvent(new CustomEvent('muzikaz:multiplayer-world-change',{detail:{roomId:'room-c'}}));
   await settle();
   assert(!speech.current,'An asynchronous old-room speech request crossed map travel');
   worldVoice.announce('Welcome to the next world.',{worldId:'room-c',category:'introduction'});
   const beforeCleanup=speech.cancelled;
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));await settle();
   assert(stream.closed,'Chat event stream was not closed');
   assert(speech.cancelled===beforeCleanup&&worldVoice.state.speaking,'Chat cleanup cancelled another active game speaker');
   emit('A message after cleanup.','room-c');await settle();
   assert(speech.current?.text==='Welcome to the next world.','Disposed chat added another utterance');
   worldVoice.dispose();
   return {introClear:true,chatDoesNotOverlap:true,freshPendingMessage:true,expiredPendingDiscarded:true,noOwnEcho:true,ownMuteOnly:true,oldRoomCancelled:true,cleanupKeepsOtherSpeaker:true,spoken:speech.spoken.length};
  }''')
  assert not errors,errors
  print(json.dumps(result));browser.close()
finally:
 server.shutdown()
