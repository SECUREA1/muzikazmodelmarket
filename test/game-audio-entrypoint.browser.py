"""The game starts voice audio through Start and ordinary controls automatically.

The full production page, lazy 3D engine and speech queue run normally. The
speech API deliberately returns unavailable, so introductions must use the
licensed recordings shipped with the page. Audio nodes and decoding are real.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, os, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as available:
 available.bind(('127.0.0.1',0)); port=available.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='game-audio-entrypoint-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json','MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/account-sessions.json','MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
    bootstrap=browser.new_context(service_workers='block')
    for _ in range(120):
     try:
      if bootstrap.request.get(base+'/api/health',timeout=500).ok:break
     except Exception:time.sleep(.05)
    else:raise AssertionError(Path(directory+'/server.log').read_text())
    assert bootstrap.request.post(base+'/api/access/free-play',data={'username':'AudioEntryTest','password':'audio-entrypoint-test-password'}).ok
    auth=bootstrap.storage_state();bootstrap.close();reports=[]
    for autoplay,world in [(False,'public-commons'),(True,'tropical-island')]:
     context=browser.new_context(storage_state=auth,service_workers='block',viewport={'width':1100,'height':800},reduced_motion='reduce')
     page=context.new_page();errors=[];requests=[];audio_responses=[]
     page.on('response',lambda response:audio_responses.append({'url':response.url,'status':response.status}) if '/audio/voices/' in response.url else None)
     page.on('pageerror',lambda error:errors.append(str(error)))
     page.route('https://**/*',lambda route:route.abort())
     def speech(route):
      payload=route.request.post_data_json;requests.append(payload)
      route.fulfill(status=503,content_type='application/json',body=json.dumps({'success':False,'code':'SPEECH_UNAVAILABLE'}))
     page.route('**/api/speech',speech)
     page.add_init_script('''window.audioEntry={contexts:[],resumes:[],sources:[],nativeCalls:0};window.audioEntryPeak=0;window.audioEntryMeters=[];
      const meterCode='class EntryPeak extends AudioWorkletProcessor{constructor(){super();this.peak=0;}process(inputs,outputs){const input=inputs[0]||[],output=outputs[0]||[];let peak=0;for(let ch=0;ch<output.length;ch++){const samples=input[ch]||input[0];if(samples){output[ch].set(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));}}if(peak>this.peak){this.peak=peak;this.port.postMessage(peak);}return true;}}registerProcessor("entry-peak",EntryPeak);';
      const meterURL=URL.createObjectURL(new Blob([meterCode],{type:'application/javascript'}));
      const connect=GainNode.prototype.connect;GainNode.prototype.connect=function(target,...args){if(target===this.context.destination&&this.context.entryMeterReady){const meter=new AudioWorkletNode(this.context,'entry-peak',{outputChannelCount:[2]});meter.port.onmessage=event=>{audioEntryPeak=Math.max(audioEntryPeak,event.data);};audioEntryMeters.push(meter);connect.call(this,meter);meter.connect(target);return target;}return connect.call(this,target,...args);};
      const Context=window.AudioContext;window.AudioContext=new Proxy(Context,{construct(Target,args,newTarget){const context=Reflect.construct(Target,args,newTarget);audioEntry.contexts.push({active:navigator.userActivation.isActive,state:context.state});context.audioWorklet.addModule(meterURL).then(()=>{context.entryMeterReady=true;});return context;}});
      const resume=AudioContext.prototype.resume;AudioContext.prototype.resume=function(...args){audioEntry.resumes.push({active:navigator.userActivation.isActive,state:this.state});return resume.apply(this,args);};
      const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){let peak=0;if(this.buffer)for(const sample of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(sample));audioEntry.sources.push({state:this.context.state,duration:this.buffer?.duration,peak});return start.apply(this,args);};
      if(window.speechSynthesis)window.speechSynthesis.speak=()=>{audioEntry.nativeCalls++;throw Error('Unexpected native voice');};''')
     url=base+'/model-explorer.html?environment='+world+'&mode=solo'+('&autoplay=1' if autoplay else '')
     page.goto(url,wait_until='domcontentloaded')
     page.evaluate('''async()=>{await import(document.querySelector('script[src*="rad-tox-launcher"]').src);const{gameSpeech}=await import('/public/js/neural-character-speech.js');window.entrySpeech=gameSpeech();}''')
     assert page.locator('[data-game-audio-enable],.game-audio-activation').count()==0,'Audio must not require a separate Resume or Enable control'
     if autoplay:
      page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady',timeout=90000)
      assert page.evaluate('audioEntry.sources.length')==0,'Autoplay must wait for a real gesture'
      page.keyboard.press('ArrowUp')
     else:
      assert not page.evaluate('!!window.MuzikazHouseExplorer'),'The 3D engine must remain deferred before Begin'
      page.add_style_tag(content='[data-house-start],#house-game-start,#house-game-start *{animation:none!important;transition:none!important}')
      page.get_by_role('button',name='Begin Game',exact=True).click()
      # No second click, key or canvas gesture occurs before playback.
     try:
      page.wait_for_function('audioEntry.sources.some(source=>source.peak>.0001)||(entrySpeech.lastError&&entrySpeech.lastError.code!=="not-allowed")',timeout=60000)
      assert not page.evaluate('entrySpeech.lastError'),page.evaluate('entrySpeech.lastError')
     except Exception:
      print(json.dumps({'autoplay':autoplay,'world':world,'errors':errors,'speechRequests':requests,'audioResponses':audio_responses,'diagnostic':page.evaluate('''async()=>{const{gameSpeech}=await import('/public/js/neural-character-speech.js');const{questConversationVoice}=await import('/public/js/quest-conversation-voice.js');return{speech:gameSpeech().state,voice:questConversationVoice().state,controls:document.body.dataset.gameControls,start:document.querySelector('[data-house-start]')?.textContent,status:document.querySelector('#house-game-load-status')?.textContent,game:!!window.MuzikazHouseExplorer,...audioEntry};}''')}),flush=True)
      raise
     state=page.evaluate('''async()=>{const {gameSpeech}=await import('/public/js/neural-character-speech.js');const{questConversationVoice}=await import('/public/js/quest-conversation-voice.js');return{speech:gameSpeech().state,voice:questConversationVoice().state,...audioEntry};}''')
     activation=any(context['active'] for context in state['contexts']) or any(resume['active'] for resume in state['resumes'])
     assert activation,state
     assert state['speech']['unlocked'] and state['voice']['unlocked'],state
     assert state['sources'][0]['state']=='running' and state['sources'][0]['peak']>.0001,state
     assert state['nativeCalls']==0,state
     assert not requests,'The introduction must be audible without a voice-generation API'
     assert audio_responses and all(response['status']==200 for response in audio_responses),audio_responses
     page.wait_for_function('audioEntryPeak>.0001',timeout=15000)
     peak=page.evaluate('audioEntryPeak')
     assert peak>.0001,{'state':state,'peak':peak}
     assert not errors,errors
     reports.append({'world':world,'autoplay':autoplay,'firstGestureActive':activation,'peak':peak,'outputState':state['sources'][0]['state'],'speechRequests':len(requests),'nativeCalls':state['nativeCalls']})
     context.close()
    browser.close();print(json.dumps({'realGameEntrypoint':True,'cases':reports}))
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
