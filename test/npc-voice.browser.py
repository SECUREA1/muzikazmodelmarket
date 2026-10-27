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
  page = browser.new_page(); errors = []
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  result = page.evaluate('''async () => {
   const {createQuestConversationVoice} = await import('/public/js/quest-conversation-voice.js');
   const {GENERATED_VOICES} = await import('/public/js/neural-character-speech.js');
   class Speech extends EventTarget {
    constructor(voices=[]) { super(); this.voices=voices; this.spoken=[]; this.cancelled=0; }
    getVoices() { return this.voices; }
    speak(utterance) { this.spoken.push(utterance); }
    cancel() { this.cancelled++; }
    resume() {}
    load(voices) { this.voices=voices; this.dispatchEvent(new Event('voiceschanged')); }
   }
   const basic={voiceURI:'local-enhanced-en',name:'Local English Enhanced',lang:'en-US',localService:true,default:true};
   const natural={voiceURI:'natural-en',name:'Microsoft Ava Online (Natural)',lang:'en-US',localService:false};
   const alternative={voiceURI:'natural-gb',name:'Microsoft Ryan Online (Natural)',lang:'en-GB',localService:false};
   const Utterance=class { constructor(text) { this.text=text; } };
   const delays=[],speech=new Speech(),voice=createQuestConversationVoice({speech,Utterance,setTimer:(fn,delay)=>{delays.push(delay);return setTimeout(fn,delay);}});
   const actors={guide:{position:{x:0,y:0,z:0},resident:{name:'Maya',role:'Guide',personality:'Calm and reassuring',mood:'settled'}}};
   voice.setScene({listener:{x:0,y:0,z:0},actors});
   voice.unlock();
   const original='Welcome! The refill costs 10 MZK. Follow the map → the marked station.';
   const call={id:'first',text:original,speaker:'Maya',voice:'Maya',speakerId:'guide',role:'Guide',at:1000,conversation:true,interaction:true,recipients:['self']};
   const options={worldId:'market',actorId:'self',serverTime:1000};
   voice.ingest([call],options);
   const deferred=speech.spoken.length===0;
   speech.load([basic,natural,alternative]);
   await new Promise(resolve=>setTimeout(resolve,20));
   if(speech.spoken.length!==1)throw Error('Delayed voice loading did not speak exactly once');
   const first=speech.spoken[0],selected=first.voice?.voiceURI;
   if(!selected||selected===basic.voiceURI)throw Error('Natural installed voice was not selected');
   if(!/^en/i.test(first.lang||''))throw Error('Utterance language was not assigned');
   if(first.rate<.88||first.rate>1.12||first.pitch<.88||first.pitch>1.12)throw Error('Character prosody is unnaturally stretched');
   if(/MZK|→/.test(first.text))throw Error('Interface symbols were not normalized for speech');
   if(call.text!==original)throw Error('Speech normalization changed the original caption text');
   first.onstart?.();first.onend();
   speech.load([alternative,natural,basic]);
   voice.ingest([{...call,id:'second',text:'It is good to see you again.'}],options);
   const second=speech.spoken.at(-1);
   if(second.voice?.voiceURI!==selected)throw Error('Voice changed when installed voices were reordered');
   if(second.pitch!==first.pitch)throw Error('Neutral character delivery lost its identity');
   second.onend();
   const longText='Please follow the route safely. '.repeat(28);
   voice.ingest([{...call,id:'long',text:longText}],options);
   if(delays.at(-1)!==65000)throw Error('Generation did not receive its own timeout');
   speech.spoken.at(-1).onstart();
   const playbackWatchdog=delays.at(-1);
   if(playbackWatchdog<=65000)throw Error('Long playback deadline was not measured after generation');
   const total=speech.spoken.length;
   speech.dispatchEvent(new Event('voiceschanged'));
   if(speech.spoken.length!==total)throw Error('Late voice inventory repeated active speech');
   voice.dispose();

   const waitingSpeech=new Speech(),waiting=createQuestConversationVoice({speech:waitingSpeech,Utterance});
   waiting.unlock();waiting.ingest([{...call,id:'waiting'}],options);
   waiting.setPreferences({dialogueMuted:true});waitingSpeech.load([natural]);
   await new Promise(resolve=>setTimeout(resolve,20));
   const muted=waitingSpeech.spoken.length===0;
   waiting.setPreferences({dialogueMuted:false});
   await new Promise(resolve=>setTimeout(resolve,20));
   if(waitingSpeech.spoken.length)throw Error('Unmuting replayed dialogue consumed during loading');
   waiting.dispose();

   const resetSpeech=new Speech(),reset=createQuestConversationVoice({speech:resetSpeech,Utterance});
   reset.unlock();reset.ingest([{...call,id:'old-world'}],options);reset.reset();resetSpeech.load([natural]);
   await new Promise(resolve=>setTimeout(resolve,20));
   const resetQuiet=resetSpeech.spoken.length===0;reset.dispose();
   const fallbackSpeech=new Speech([basic,natural]),fallback=createQuestConversationVoice({speech:fallbackSpeech,Utterance});
   fallback.unlock();fallback.ingest([{...call,id:'offline'}],options);
   fallbackSpeech.spoken[0].onerror({error:'network'});
   if(fallbackSpeech.spoken.length!==2||fallbackSpeech.spoken[1].voice?.voiceURI!==basic.voiceURI)throw Error('Unavailable natural voice did not retry locally');
   if(fallbackSpeech.spoken[1].text!==fallbackSpeech.spoken[0].text)throw Error('Fallback changed the response');
   fallbackSpeech.spoken[1].onend();
   fallback.ingest([{...call,id:'started'}],options);
   const active=fallbackSpeech.spoken.at(-1),beforeError=fallbackSpeech.spoken.length;
   active.onstart();active.onerror({error:'network'});
   if(fallbackSpeech.spoken.length!==beforeError)throw Error('Partly spoken dialogue was repeated after error');
   fallback.dispose();
   const previewSpeech=new Speech(GENERATED_VOICES),previewVoice=createQuestConversationVoice({speech:previewSpeech,Utterance});
   const male=GENERATED_VOICES.find(candidate=>candidate.gender==='male');
   const preview=previewVoice.preview({speechVoiceGender:'male',speechVoiceURI:male.voiceURI});
   if(previewSpeech.spoken[0]?.voice?.voiceURI!==male.voiceURI)throw Error('Explicit generated voice preview did not use the selected male profile');
   previewSpeech.spoken[0].onstart();
   const previewStatus=await preview;if(!previewStatus.includes(male.name))throw Error('Preview did not confirm actual playback');
   previewVoice.dispose();
   const rejectedSpeech=new Speech([{name:'eSpeak English',voiceURI:'espeak:en',lang:'en-US'}]),rejected=createQuestConversationVoice({speech:rejectedSpeech,Utterance});
   const unavailableStatus=await rejected.preview();
   if(rejectedSpeech.spoken.length||!/unavailable/i.test(unavailableStatus))throw Error('Rejected native voice fell through to a hidden browser default');
   rejected.dispose();
   return {deferred,selected,rate:first.rate,pitch:first.pitch,normalized:first.text,muted,resetQuiet,localFallback:true,longWatchdog:playbackWatchdog,previewStatus,noHiddenDefault:true};
  }''')
  assert result['deferred'] and result['muted'] and result['resetQuiet'],result
  assert not errors,errors
  print(json.dumps(result)); browser.close()
finally:
 server.shutdown()
