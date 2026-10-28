"""Two real room members send, receive and hear text through production chat.

Only the 3D renderer is omitted. The page uses the deployed chat markup and
module, real room membership, HTTP, EventSource and local neural voice output.
Requires the prepared voice model (`npm run build:voices`).
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import json, os, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as probe:
 probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='room-chat-audio-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,
  'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json',
  'MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/sessions.json',
  'MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    contexts=[];pages=[];errors=[];responses=[]
    bootstrap=browser.new_context()
    for _ in range(60):
     try:
      state=bootstrap.request.get(base+'/api/speech/voices',timeout=1000).json()['data']
      if state['available'] and state['modelReady']:break
     except Exception:pass
     if process.poll() is not None:raise AssertionError(Path(directory+'/server.log').read_text())
     time.sleep(.25)
    else:raise AssertionError('The actual local voice engine did not become ready')
    bootstrap.close()
    for index in range(2):
     context=browser.new_context(service_workers='block',viewport={'width':1000,'height':800});contexts.append(context)
     username=['RoomChatAlice','RoomChatBob'][index]
     login=context.request.post(base+'/api/access/free-play',data={'username':username,'password':'room-chat-browser-password'})
     assert login.ok,login.text()
     session=context.request.get(base+'/api/game/room-session').json()['data']
     joined=context.request.post(base+'/api/rooms/muzikaz-main/gameplay',headers={'X-CSRF-Token':session['csrfToken']},data={'action':'join','requestId':'chat-browser-'+str(index),'radToxEnabled':False})
     assert joined.ok,joined.text()
     page=context.new_page();pages.append(page)
     page.on('pageerror',lambda error:errors.append(str(error)))
     if index==1:
      page.on('response',lambda response:responses.append({'status':response.status,'type':response.headers.get('content-type'),'text':response.request.post_data_json['text'],'voice':response.request.post_data_json['voice']}) if response.url==base+'/api/speech' else None)
     page.route('**/room-chat-fixture',lambda route:route.fulfill(status=200,content_type='text/html',body='<!doctype html><html lang="en"><body></body></html>'))
     page.goto(base+'/room-chat-fixture')
     page.evaluate('''async({index,csrf})=>{
      const source=new DOMParser().parseFromString(await(await fetch('/model-explorer.html')).text(),'text/html');
      document.body.replaceChildren(source.querySelector('#crib-chat-toggle'),source.querySelector('#crib-social'));
      localStorage.setItem('muzikazHouseSessionId','room-browser-'+index);
      localStorage.setItem('muzikazMultiplayerWorld','muzikaz-main');
      localStorage.setItem('muzikazChatTextToSpeech','false');
      window.MUZIKAZ_HOUSE_TRACKING={roomId:'muzikaz-main',position:{x:0,y:0,z:0}};
      window.MuzikazHouseExplorer={snapshot:()=>({roomId:'muzikaz-main',serverHostedRoom:true,serverReady:true})};
      window.MUZIKAZ_AUDIO_PREFERENCES={speechVoiceGender:'male',speechVoiceURI:'missing-device-voice',masterMuted:false};
      // Keep the real authoritative room alive without running the 3D renderer.
      window.keepRoom=setInterval(()=>fetch('/api/rooms/muzikaz-main/gameplay',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({action:'input',input:{},requestId:crypto.randomUUID()})}),3000);
      window.chatAudio={peak:0,nativeCalls:0,spoken:[]};
      const{gameSpeech}=await import('/public/js/neural-character-speech.js');
      const speech=gameSpeech(),speak=speech.speak.bind(speech);
      speech.speak=utterance=>{const start=utterance.onstart;utterance.onstart=event=>{chatAudio.spoken.push({text:utterance.text,voice:utterance.voice?.voiceURI});start?.(event);};speak(utterance);};
      if(window.speechSynthesis)window.speechSynthesis.speak=()=>{chatAudio.nativeCalls++;throw Error('No device voice substitution');};
      const connect=GainNode.prototype.connect;
      GainNode.prototype.connect=function(target,...args){if(target===this.context.destination){const analyser=this.context.createAnalyser();analyser.fftSize=2048;connect.call(this,analyser);analyser.connect(target);const samples=new Float32Array(analyser.fftSize);setInterval(()=>{analyser.getFloatTimeDomainData(samples);for(const sample of samples)chatAudio.peak=Math.max(chatAudio.peak,Math.abs(sample));},10);return target;}return connect.call(this,target,...args);};
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/public/js/crib-multiplayer.js';script.onload=resolve;script.onerror=reject;document.body.append(script);});
     }''',{'index':index,'csrf':session['csrfToken']})
     page.click('#crib-chat-toggle')
     page.wait_for_function('document.querySelector("#crib-room-count").textContent.includes("online")')
    sender,receiver=pages
    receiver.click('#crib-tts-toggle')
    assert receiver.locator('#crib-tts-toggle').get_attribute('aria-pressed')=='true'
    message='Hello Bob. Can you hear this room message clearly?'
    sender.locator('#crib-chat-input').fill(message)
    sender.locator('#crib-chat-form [type="submit"]').click()
    receiver.wait_for_function('text=>document.querySelector("#crib-chat-messages").textContent.includes(text)',arg=message,timeout=15000)
    receiver.wait_for_function('chatAudio.spoken.length>0||document.querySelector("#crib-voice-status").textContent.includes("could not")',timeout=120000)
    receiver.wait_for_function('chatAudio.peak>.01',timeout=15000)
    assert receiver.evaluate('chatAudio.spoken[0].voice')=='muzikaz:neural-male'
    assert message in receiver.evaluate('chatAudio.spoken[0].text')
    first_peak=receiver.evaluate('chatAudio.peak')
    assert responses and all(response['status']==200 and response['type'].startswith('audio/wav') for response in responses),responses
    receiver.wait_for_function('''async()=>{const{gameSpeech}=await import('/public/js/neural-character-speech.js');return !gameSpeech().speaking&&!gameSpeech().pending;}''',timeout=30000)
    # Explicit playback of an already visible message remains available when
    # automatic reading is off. A real click must resume the shared output.
    receiver.click('#crib-tts-toggle')
    receiver.evaluate('chatAudio.peak=0')
    read=receiver.locator('#crib-chat-messages [data-chat-read]').first
    read.click()
    receiver.wait_for_function('chatAudio.spoken.length===2&&chatAudio.peak>.01',timeout=120000)
    assert receiver.locator('#crib-tts-toggle').get_attribute('aria-pressed')=='false'
    manual_peak=receiver.evaluate('chatAudio.peak')
    receiver.click('#crib-speaker-toggle')
    receiver.wait_for_function('''async()=>{const{gameSpeech}=await import('/public/js/neural-character-speech.js');return !gameSpeech().speaking&&!gameSpeech().pending;}''')
    assert receiver.locator('#crib-speaker-toggle').get_attribute('aria-pressed')=='false'
    read.click()
    assert 'Speaker on' in receiver.locator('#crib-voice-status').inner_text()
    assert receiver.evaluate('chatAudio.spoken.length')==2
    receiver.click('#crib-speaker-toggle')
    receiver.evaluate('chatAudio.peak=0')
    read.click()
    receiver.wait_for_function('chatAudio.spoken.length===3&&chatAudio.peak>.01',timeout=120000)
    assert receiver.evaluate('chatAudio.nativeCalls')==0
    assert not errors,errors
    print(json.dumps({'realRoomMessages':True,'liveEventDelivery':True,'savedMissingVoiceRecovered':True,'speakerMuteAndRetry':True,'automaticPeak':first_peak,'manualPeak':manual_peak,'retryPeak':receiver.evaluate('chatAudio.peak'),'spoken':receiver.evaluate('chatAudio.spoken'),'responses':responses}))
    for context in contexts:context.close()
    browser.close()
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
