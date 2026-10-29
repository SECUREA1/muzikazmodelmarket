"""Authored guides and voice previews remain audible with the live API unavailable.

Uses production settings, announcements, speech queue, packaged neural recordings,
and real Web Audio decoding/output. The API returns 503 and native synthesis is
forbidden, so no server model or installed browser voice can hide a delivery gap.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright
import json, os

root=Path(__file__).resolve().parents[1]
os.chdir(root)
recorded_text={clip['url']:clip['text'] for clip in json.loads((root/'public/audio/voices/world/manifest.json').read_text())['clips']}
recordings=[]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path.startswith('/public/audio/voices/'):
   recordings.append(self.path)
  return super().do_GET()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server.daemon_threads=True
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();errors=[];api_requests=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  def unavailable(route):
   api_requests.append(urlsplit(route.request.url).path)
   route.fulfill(status=503,json={'success':False,'code':'SPEECH_UNAVAILABLE','message':'Voice service not installed.'})
  page.route('**/api/**',unavailable)
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.add_script_tag(url=f'http://127.0.0.1:{server.server_port}/public/js/api-connection.js')
  page.evaluate('''async()=>{
   const {createNeuralCharacterSpeech,GameSpeechUtterance}=await import('/public/js/neural-character-speech.js');
   const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
   const {createGameplayAnnouncements}=await import('/public/js/gameplay-announcements.js');
   const {mountPlayerSettings}=await import('/public/js/player-settings.js');
   const {worldGuideIntroduction}=await import('/public/js/world-guide.js');
   const {prepareSpeechText}=await import('/public/js/character-voice-profile.js');
   document.body.replaceChildren();
   const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;
   const createGain=context.createGain.bind(context);
   context.createGain=()=>{const node=createGain(),connect=node.connect.bind(node);node.connect=target=>{connect(target);if(target===context.destination)connect(analyser);};return node;};
   window.recordedContext=context;window.recordedReport={nativeCalls:0,starts:[]};
   window.recordedSpeech=createNeuralCharacterSpeech({audioFactory:()=>context,nativeSpeech:{getVoices:()=>[],resume(){},speak(){recordedReport.nativeCalls++;throw Error('Packaged voices must not use native synthesis');}},NativeUtterance:null});
   let speaking=false;
   recordedSpeech.addEventListener('statechange',()=>{if(recordedSpeech.speaking&&!speaking)recordedReport.starts.push(recordedSpeech.state.selectedVoice);speaking=recordedSpeech.speaking;if(recordedSpeech.lastError)window.recordedError=recordedSpeech.lastError;});
   window.recordedVoice=createQuestConversationVoice({speech:recordedSpeech,Utterance:GameSpeechUtterance});
   recordedVoice.setPreferences({speechVoiceGender:'female'});
   window.recordedGuides=createGameplayAnnouncements({voice:recordedVoice});
   const environment={id:'public-commons',name:'Public Commons'};
   window.expectedRecordedIntro=prepareSpeechText(worldGuideIntroduction(environment));
   recordedGuides.update({serverTime:Date.now(),players:{p:{quests:{}}}},'p',environment);
   const button=document.createElement('button');button.textContent='Enter recorded world';button.onclick=()=>{window.recordedActivatedAt=performance.now();recordedGuides.unlock();};document.body.append(button);
   window.measureRecordedPeak=async(ms=500)=>{const data=new Float32Array(analyser.fftSize);let peak=0,end=performance.now()+ms;while(performance.now()<end){analyser.getFloatTimeDomainData(data);for(const sample of data)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,20));}return peak;};
   const panel=document.createElement('main');document.body.append(panel);
   const inventory={api:async()=>{throw Error('Sign in to save member settings.');},state:async()=>{throw Error('Sign in to view telemetry.');}};
   window.recordedSettings=mountPlayerSettings({panel,inventory,speech:recordedSpeech,onChange:value=>recordedVoice.setPreferences(value),gameState:()=>({}),onAvatar(){},onCare(){},onPreviewVoice:value=>recordedVoice.preview(value)});
   await recordedSettings.open();
  }''')
  assert page.evaluate('recordedVoice.state.pending')==1
  assert not recordings,'A queued guide must still wait for a user gesture'
  page.get_by_role('button',name='Enter recorded world',exact=True).click()
  page.wait_for_function('recordedSpeech.speaking || window.recordedError',timeout=10000)
  assert not page.evaluate('window.recordedError'),page.evaluate('window.recordedError')
  intro_started_after=page.evaluate('performance.now()-recordedActivatedAt')
  assert intro_started_after<5000,intro_started_after
  intro_peak=page.evaluate('measureRecordedPeak()')
  assert intro_peak>.0001,intro_peak
  page.wait_for_function('!recordedSpeech.speaking&&!recordedSpeech.pending&&!recordedVoice.state.speaking || window.recordedError',timeout=90000)
  assert not page.evaluate('window.recordedError'),page.evaluate('window.recordedError')
  intro_files=list(recordings)
  assert ' '.join(recorded_text[url] for url in intro_files)==page.evaluate('expectedRecordedIntro'),intro_files
  assert len(page.evaluate('recordedReport.starts'))==1,'Sentence recordings must remain one guide utterance'
  peaks={}
  for gender in ['male','female']:
   page.get_by_label('Voice type',exact=True).select_option(gender)
   page.get_by_role('button',name='Preview voice',exact=True).click()
   page.wait_for_function('name=>recordedSpeech.speaking && recordedSpeech.state.selectedVoice===name',arg='MUZIKAZ Natural '+gender.title(),timeout=10000)
   peaks[gender]=page.evaluate('measureRecordedPeak()')
   assert peaks[gender]>.0001,peaks
   page.evaluate('recordedSpeech.cancel()')
   page.wait_for_function('!document.querySelector("[data-settings-preview-voice]").disabled')
  # Saved preference mutes and the independent World radio mute must not defeat
  # an explicit Enable all audio action. Member service failure is still active.
  page.get_by_role('button',name='Mute all audio',exact=True).click()
  page.get_by_role('button',name='Mute npc conversations',exact=True).click()
  page.evaluate('recordedVoice.setMuted(true)')
  page.get_by_role('button',name='Enable all audio',exact=True).click()
  page.wait_for_function('recordedSpeech.speaking || window.recordedError',timeout=10000)
  assert page.evaluate('recordedSpeech.speaking'),page.evaluate('window.recordedError')
  restored_peak=page.evaluate('measureRecordedPeak()')
  assert restored_peak>.0001,restored_peak
  assert not page.evaluate('recordedSettings.preferences.masterMuted||recordedSettings.preferences.dialogueMuted')
  assert page.get_by_role('button',name='Mute all audio',exact=True).get_attribute('aria-pressed')=='false'
  page.evaluate('recordedVoice.setMuted(true)')
  page.wait_for_timeout(160)
  assert page.evaluate('measureRecordedPeak(150)')<.00001
  assert api_requests and '/api/speech' not in api_requests,api_requests
  assert '/public/audio/voices/male-preview.wav' in recordings and '/public/audio/voices/female-preview.wav' in recordings,recordings
  assert page.evaluate('recordedReport.nativeCalls')==0
  assert not errors,errors
  page.evaluate('recordedVoice.dispose();recordedSpeech.dispose()')
  page.wait_for_function("recordedContext.state==='closed'")
  print(json.dumps({'apiUnavailable':True,'liveSpeechRequests':0,'nativeSynthesisCalls':0,'introStartedAfterMs':round(intro_started_after,1),'introSegments':len(intro_files),'introPeak':intro_peak,'previewPeaks':peaks,'enableAllAudioPeak':restored_peak,'muteSilent':True}))
  browser.close()
finally:server.shutdown();server.server_close()
