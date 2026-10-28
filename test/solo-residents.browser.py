"""Actual solo Muzikaz Main startup, rendered resident motion, local walking and voiced UI reply.

Uses the production Node API and real installed neural voice engine. Neither
NPC snapshots nor speech responses or audio nodes are replaced. A Web Audio
worklet measures real output while the 3D renderer can occupy the main thread.
Requires `npm run build:voices` for the dynamic NPC reply.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, math, os, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='solo-residents-browser-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json','MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/account-sessions.json','MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    context=browser.new_context(service_workers='block',viewport={'width':1100,'height':800},reduced_motion='reduce')
    ready=None
    for _ in range(50):
     try:
      response=context.request.get(base+'/api/speech/voices',timeout=1000)
      if response.ok:
       ready=response.json()['data']
       if ready.get('available') and ready.get('modelReady'):break
     except Exception:pass
     time.sleep(.25)
    assert ready and ready['available'] and ready['modelReady'],ready
    assert context.request.post(base+'/api/access/free-play',data={'username':'SoloResidentBrowser','password':'solo-residents-browser-password'}).ok
    page=context.new_page();errors=[];public_joins=[];resident_snapshots=[];voice_responses=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    def record_request(request):
     if request.method=='POST' and '/gameplay' in request.url and (request.post_data_json or {}).get('action')=='join':public_joins.append(request.post_data_json)
    def record_response(response):
     if '/api/rooms/muzikaz-main/residents' in response.url and response.ok:
      try:resident_snapshots.append(response.json()['data'])
      except Exception:pass
     if '/api/speech' in response.url and response.request.method=='POST':voice_responses.append({'status':response.status,'type':response.headers.get('content-type'),'text':response.request.post_data_json['text']})
    page.on('request',record_request);page.on('response',record_response)
    page.route('https://**/*',lambda route:route.abort())
    page.add_init_script('''localStorage.setItem('muzikazGameCameraMode','top-down');window.soloAudio={sources:[],peak:0,nativeCalls:0};
     const code='class Peak extends AudioWorkletProcessor{constructor(){super();this.peak=0;}process(inputs,outputs){let peak=0;const channels=inputs[0]||[],out=outputs[0]||[];for(let ch=0;ch<out.length;ch++){const samples=channels[ch]||channels[0];if(samples){out[ch].set(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));}}if(peak>this.peak){this.peak=peak;this.port.postMessage(peak);}return true;}}registerProcessor("solo-peak",Peak);';
     const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));const Context=window.AudioContext;
     window.AudioContext=new Proxy(Context,{construct(Target,args,newTarget){const context=Reflect.construct(Target,args,newTarget);context.audioWorklet.addModule(url).then(()=>{context.soloMeterReady=true;});return context;}});
     const connect=GainNode.prototype.connect;GainNode.prototype.connect=function(target,...args){if(target===this.context.destination&&this.context.soloMeterReady){const meter=new AudioWorkletNode(this.context,'solo-peak',{outputChannelCount:[2]});meter.port.onmessage=e=>{soloAudio.peak=Math.max(soloAudio.peak,e.data);};connect.call(this,meter);meter.connect(target);return target;}return connect.call(this,target,...args);};
     const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){let peak=0;if(this.buffer)for(const sample of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(sample));soloAudio.sources.push({state:this.context.state,duration:this.buffer?.duration,peak});return start.apply(this,args);};
     if(window.speechSynthesis)window.speechSynthesis.speak=()=>{soloAudio.nativeCalls++;throw Error('Native voice substitution is forbidden');};''')
    try:
     page.goto(base+'/model-explorer.html?environment=muzikaz-main&mode=solo',wait_until='domcontentloaded')
     page.evaluate('''async()=>{
      const {gameSpeech}=await import('/public/js/neural-character-speech.js');
      const speech=gameSpeech(),speak=speech.speak.bind(speech);soloAudio.spoken=[];
      speech.speak=utterance=>{const started=utterance.onstart;utterance.onstart=event=>{soloAudio.spoken.push({text:utterance.text,volume:utterance.volume,camera:MuzikazHouseExplorer.snapshot().cameraMode});started?.(event);};speak(utterance);};
     }''')
     page.add_style_tag(content='[data-house-start],#house-game-start,#house-game-start *{animation:none!important;transition:none!important}')
     page.get_by_role('button',name='Begin Game',exact=True).click()
     page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=90000)
     print('Solo main-world controls ready',flush=True)
     state=page.evaluate('MuzikazHouseExplorer.snapshot()')
     assert not state['serverHostedRoom'],{'reason':'Explicit solo mode was changed to a public room','state':state,'publicJoins':public_joins}
     page.wait_for_function('MuzikazHouseExplorer.snapshot().soloResidents.ready&&MuzikazHouseExplorer.snapshot().soloResidents.actors.some(actor=>actor.renderedPosition)',timeout=40000)
     print('Private main-world residents rendered',flush=True)
     page.wait_for_function('soloAudio.peak>.0001',timeout=60000)
     introduction_peak=page.evaluate('soloAudio.peak')
     print('Actual intro output audible',flush=True)
     # After proving the intro is audible, use the normal category preference
     # event to stop this long guide before testing the independent NPC voice.
     page.evaluate('''()=>{MUZIKAZ_AUDIO_PREFERENCES={...MUZIKAZ_AUDIO_PREFERENCES,introductionMuted:true};dispatchEvent(new CustomEvent('muzikaz:audio-preferences',{detail:MUZIKAZ_AUDIO_PREFERENCES}));}''')
     initial=page.evaluate('MuzikazHouseExplorer.snapshot()')
     assert initial['roomId']=='muzikaz-main' and not initial['serverHostedRoom'] and not initial['serverReady'],initial
     assert initial['localQuests'] is not None and not public_joins,public_joins
     rendered={actor['id']:actor['renderedPosition'] for actor in initial['soloResidents']['actors'] if actor['renderedPosition']}
     page.wait_for_function('''positions=>MuzikazHouseExplorer.snapshot().soloResidents.actors.some(actor=>actor.renderedPosition&&positions[actor.id]&&Math.hypot(actor.renderedPosition[0]-positions[actor.id][0],actor.renderedPosition[2]-positions[actor.id][2])>1)''',arg=rendered,timeout=40000)
     after_motion=page.evaluate('MuzikazHouseExplorer.snapshot()')
     print('Actual resident transforms moved',flush=True)
     assert math.dist(initial['player']['position'][::2],after_motion['player']['position'][::2])<.1,'AI updates moved the local player'
     # Use real player controls to walk close enough for the production UI.
     before_walk=after_motion['player']['position'];page.keyboard.down('w');page.wait_for_timeout(1300);page.keyboard.up('w')
     after_walk=page.evaluate('MuzikazHouseExplorer.snapshot().player.position')
     assert math.dist(before_walk[::2],after_walk[::2])>.3,{'before':before_walk,'after':after_walk}
     for attempt in range(24):
      state=page.evaluate('MuzikazHouseExplorer.snapshot()');position=state['player']['position']
      closest=min(state['soloResidents']['actors'],key=lambda actor:math.hypot(actor['position']['x']-position[0],actor['position']['z']-position[2]))
      dx=closest['position']['x']-position[0];dz=closest['position']['z']-position[2]
      if math.hypot(dx,dz)<8:break
      keys=[]
      if abs(dx)>2:keys.append('d' if dx>0 else 'a')
      if abs(dz)>2:keys.append('s' if dz>0 else 'w')
      for key in keys:page.keyboard.down(key)
      page.wait_for_timeout(600)
      for key in keys:page.keyboard.up(key)
     else:raise AssertionError({'reason':'No reachable resident after walking','state':state})
     print('Local walking reached resident',flush=True)
     for _ in range(5):
      if page.evaluate('MuzikazHouseExplorer.snapshot().cameraMode')=='top-down':break
      page.locator('.game-camera-toggle').click()
     assert page.evaluate('MuzikazHouseExplorer.snapshot().cameraMode')=='top-down'
     page.get_by_role('button',name='Residents, conversations and daily objectives',exact=True).click()
     panel=page.locator('.world-resident-panel');panel.wait_for(state='visible')
     page.wait_for_function('!!document.querySelector("[data-resident-talk]:not([disabled])")',timeout=10000)
     page.evaluate('soloAudio.peak=0')
     panel.locator('[data-resident-talk]:enabled').first.click()
     panel.get_by_label('Quest conversation transcript',exact=True).wait_for(state='visible',timeout=15000)
     reply=resident_snapshots[-1]['players'][resident_snapshots[-1]['selfId']]['npcConversation']['conversation'][-1]
     assert reply['role']!='player'
     expected=page.evaluate('''async text=>{const {prepareSpeechText}=await import('/public/js/character-voice-profile.js');return prepareSpeechText(text);}''',reply['text'])
     page.wait_for_function('text=>soloAudio.spoken.some(line=>line.text===text&&line.volume>0&&line.camera==="top-down")',arg=expected,timeout=120000)
     page.evaluate('soloAudio.peak=0')
     page.wait_for_function('soloAudio.peak>.0001',timeout=120000)
     npc_peak=page.evaluate('soloAudio.peak')
     assert any(response['status']==200 and response['type']=='audio/wav' for response in voice_responses),voice_responses
     assert any(response['status']==200 and response['text'] in expected for response in voice_responses),{'expectedNPC':expected,'responses':voice_responses}
     assert page.evaluate('soloAudio.nativeCalls')==0
     assert not public_joins and not errors,{'joins':public_joins,'errors':errors}
     assert resident_snapshots and all(snapshot['private'] and len(snapshot['players'])==1 for snapshot in resident_snapshots)
     page.screenshot(path='/workspace/solo-residents-live.png')
     print(json.dumps({'actualSoloMainWorld':True,'privateResidents':len(rendered),'renderedMovement':True,'localWalkingPreserved':True,'publicJoins':len(public_joins),'introductionPeak':introduction_peak,'npcPeak':npc_peak,'realNeuralReplies':voice_responses,'screenshot':'/workspace/solo-residents-live.png'}),flush=True)
    except Exception:
     print(json.dumps({'errors':errors,'publicJoins':public_joins,'voiceResponses':voice_responses,'lastPrivateSnapshot':resident_snapshots[-1] if resident_snapshots else None,'game':page.evaluate('window.MuzikazHouseExplorer?.snapshot()'),'audio':page.evaluate('soloAudio')}),flush=True)
     print(Path(directory+'/server.log').read_text()[-5000:],flush=True)
     page.screenshot(path='/workspace/solo-residents-diagnostic.png',timeout=15000)
     raise
    finally:context.close();browser.close()
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
