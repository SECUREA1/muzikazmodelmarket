"""Saved device voices and late preferences cannot discard an unheard guide.

All speech APIs are unavailable. Real generated recordings must produce audible
Web Audio output after one user gesture, including a failed selected device voice.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

root=Path(__file__).resolve().parents[1]
os.chdir(root)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server.daemon_threads=True
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  reports=[]
  for mode in ['missing-device','failed-device','late-preferences','enable-muted']:
   page=browser.new_page();errors=[];requests=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   def unavailable(route):
    requests.append(route.request.url)
    route.fulfill(status=503,json={'success':False,'code':'SPEECH_UNAVAILABLE'})
   page.route('**/api/**',unavailable)
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
   page.evaluate('''async mode=>{
    const {createNeuralCharacterSpeech,GameSpeechUtterance}=await import('/public/js/neural-character-speech.js');
    const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
    const {worldGuideIntroduction}=await import('/public/js/world-guide.js');
    const {mountGameAudioActivation}=await import('/public/js/game-audio-activation.js');
    const {mountPlayerSettings}=await import('/public/js/player-settings.js');
    document.body.replaceChildren();
    const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;
    const createGain=context.createGain.bind(context);
    context.createGain=()=>{const gain=createGain(),connect=gain.connect.bind(gain);gain.connect=target=>{connect(target);if(target===context.destination)connect(analyser);};return gain;};
    const device={name:'Installed Natural Female',voiceURI:'device:natural',lang:'en-US',gender:'female',localService:true};
    window.deviceReport={nativeCalls:0,recordings:[],starts:[],cancelledFetch:false};
    window.deviceSpeech=createNeuralCharacterSpeech({audioFactory:()=>context,
     nativeSpeech:{getVoices:()=>[device],resume(){},addEventListener(){},removeEventListener(){},cancel(){},speak(utterance){deviceReport.nativeCalls++;queueMicrotask(()=>utterance.onerror({error:'synthesis-failed'}));}},
     NativeUtterance:class{constructor(text){this.text=text;}},
     fetchAudio:async(path,options)=>{deviceReport.recordings.push(path);if(mode==='late-preferences'&&deviceReport.recordings.length===1){window.releasePreviousFetch=()=>{};await new Promise(resolve=>window.releasePreviousFetch=resolve);deviceReport.cancelledFetch=options.signal.aborted;}return fetch(path,options);}
    });
    deviceSpeech.addEventListener('statechange',()=>{window.deviceError=deviceSpeech.state.error;});
    window.deviceVoice=createQuestConversationVoice({speech:deviceSpeech,Utterance:GameSpeechUtterance});
    const savedMuted={masterMuted:true,introductionMuted:true,dialogueMuted:true,effectsMuted:true,announcementsMuted:true,mediaMuted:true,effectsVolume:0,fov:81,speechVoiceGender:'male'};
    deviceVoice.setPreferences(mode==='missing-device'?{speechVoiceURI:'device:from-another-computer',speechVoiceGender:'male'}:mode==='failed-device'?{speechVoiceURI:device.voiceURI,speechVoiceGender:'female'}:mode==='enable-muted'?savedMuted:{});
    const text=worldGuideIntroduction({id:'public-commons',name:'Public Commons'});
    deviceVoice.announce(text,{worldId:'public-commons',category:'introduction'});
    const button=document.createElement('button');button.textContent='Enter world';button.onclick=()=>deviceVoice.unlock();document.body.append(button);
    if(mode==='enable-muted'){
     window.MUZIKAZ_AUDIO_PREFERENCES=savedMuted;
     window.deviceActivation=mountGameAudioActivation({parent:document.body,speech:deviceSpeech,voice:deviceVoice});
     const panel=document.createElement('main');document.body.append(panel);let settingsRequest=0;
     const inventory={session:async()=>({owner_id:'test',csrfToken:'test-token'}),api:async(path,options)=>{if(options?.method==='PUT'){const selected=JSON.parse(options.body).settings;await new Promise(resolve=>window.completeSave=resolve);return{owner_id:'test',settings:selected};}if(++settingsRequest===1)await new Promise(resolve=>window.completeSettings=resolve);return{owner_id:'test',settings:savedMuted};},state:async()=>{throw Error('Member telemetry unavailable');}};
     window.deviceSettings=mountPlayerSettings({panel,inventory,speech:deviceSpeech,gameState:()=>({}),onChange:value=>{window.MUZIKAZ_AUDIO_PREFERENCES={...value};deviceVoice.setPreferences(value);window.dispatchEvent(new CustomEvent('muzikaz:audio-preferences',{detail:{...value}}));},onAvatar(){},onCare(){}});
     window.deviceSettingsRestore=deviceSettings.restore();
    }
    window.devicePeak=async()=>{const data=new Float32Array(analyser.fftSize);let peak=0,end=performance.now()+500;while(performance.now()<end){analyser.getFloatTimeDomainData(data);for(const sample of data)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,10));}return peak;};
    window.closeDevice=()=>{deviceVoice.dispose();deviceSpeech.dispose();};
   }''',mode)
   page.get_by_role('button',name='Enable game audio' if mode=='enable-muted' else 'Enter world',exact=True).click()
   if mode=='late-preferences':
    page.wait_for_function('!!window.releasePreviousFetch')
    page.evaluate("deviceVoice.setPreferences({speechVoiceGender:'male'});releasePreviousFetch()")
   if mode=='enable-muted':
    page.evaluate('async()=>{completeSettings();await deviceSettingsRestore;await deviceSettings.open();}')
    assert not page.evaluate('deviceSettings.preferences.masterMuted||deviceSettings.preferences.introductionMuted||deviceSettings.preferences.dialogueMuted||deviceSettings.preferences.effectsMuted||deviceSettings.preferences.mediaMuted||deviceSettings.preferences.announcementsMuted')
    assert page.evaluate('deviceSettings.preferences.effectsVolume')==100
    assert page.evaluate('deviceSettings.preferences.fov')==81,'Audio recovery must preserve saved non-audio preferences'
   page.wait_for_function('deviceSpeech.speaking || window.deviceError',timeout=10000)
   assert not page.evaluate('window.deviceError'),page.evaluate('window.deviceError')
   peak=page.evaluate('devicePeak()')
   state=page.evaluate('({speech:deviceSpeech.state,...deviceReport})')
   assert peak>.0001,{'mode':mode,'peak':peak,'state':state}
   expected='MUZIKAZ Natural Female' if mode=='failed-device' else 'MUZIKAZ Natural Male'
   assert state['speech']['selectedVoice']==expected,state
   assert state['nativeCalls']==(1 if mode=='failed-device' else 0),state
   if mode=='late-preferences':assert state['cancelledFetch'],state
   assert not requests,requests
   assert not errors,errors
   if mode=='enable-muted':
    # An already submitted Save can still return the earlier muted preferences
    # after the visible stage button has enabled audio again.
    page.get_by_role('button',name='Mute all audio',exact=True).click()
    assert page.evaluate('deviceSettings.preferences.masterMuted')
    page.get_by_role('button',name='Save settings',exact=True).click()
    page.wait_for_function('!!window.completeSave')
    page.get_by_role('button',name='Resume game audio',exact=True).click()
    page.evaluate('completeSave()')
    page.wait_for_function('!document.querySelector("[data-settings-save]").disabled')
    assert not page.evaluate('deviceSettings.preferences.masterMuted||deviceSettings.preferences.dialogueMuted')
    assert page.evaluate('deviceSettings.dirty'),'A prior save cannot claim newer previewed preferences were persisted'
    assert 'Current changes are still previewed' in page.locator('[data-settings-status]').inner_text()
    assert not page.evaluate('MUZIKAZ_AUDIO_SESSION_OVERRIDES.masterMuted')
   reports.append({'case':mode,'peak':peak,'voice':state['speech']['selectedVoice'],'nativeFailures':state['nativeCalls'],'speechRequests':len(requests)})
   page.evaluate('closeDevice()');page.close()
  browser.close();print(json.dumps({'deviceVoiceRecovery':reports}))
finally:server.shutdown();server.server_close()
