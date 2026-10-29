"""Nearby resident exchanges produce audible, real generated male/female audio.

Requires the voice model prepared by npm run build:voices. This exercises the
resident snapshot gate, shared quest player, real API inference and Web Audio.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
import json, os, signal, socket, subprocess, time

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as available:
 available.bind(('127.0.0.1',0));port=available.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with TemporaryDirectory(prefix='resident-conversation-audio-') as directory:
 env={**os.environ,'PORT':str(port),'MUZIKAZ_STATIC_SOURCE':'repository','MUZIKAZ_DATA_DIR':directory,
  'MUZIKAZ_USER_DATABASE_FILE':directory+'/users.json','MUZIKAZ_ACCOUNTS_FILE':directory+'/accounts.json',
  'MUZIKAZ_PAYMENT_ORDERS_FILE':directory+'/orders.json','MUZIKAZ_ACCOUNT_SESSIONS_FILE':directory+'/sessions.json',
  'MUZIKAZ_GAME_SESSIONS_FILE':directory+'/game-sessions.json'}
 with open(directory+'/server.log','w') as log:
  process=subprocess.Popen(['node','server.mjs'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=True)
  try:
   ready=None
   for _ in range(40):
    try:
     with urlopen(base+'/api/speech/voices',timeout=1) as response:ready=json.load(response)['data']
     if ready.get('available') and ready.get('modelReady'):break
    except (OSError,ValueError):pass
    if process.poll() is not None:raise AssertionError(Path(directory+'/server.log').read_text())
    time.sleep(1)
   assert ready and ready.get('available') and ready.get('modelReady'),ready
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page();errors=[];requests=[];responses=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:requests.append(request.post_data_json) if request.url==base+'/api/speech' else None)
    page.on('response',lambda response:responses.append({'status':response.status,'type':response.headers.get('content-type')}) if response.url==base+'/api/speech' else None)
    page.goto(base+'/test/fixtures/gameplay-audio.html')
    page.evaluate('''async()=>{
     const{createNeuralCharacterSpeech,GameSpeechUtterance}=await import('/public/js/neural-character-speech.js');
     const{createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
     const{createResidentConversationAudio}=await import('/public/js/resident-conversation-audio.js');
     const context=new AudioContext(),analyser=context.createAnalyser();analyser.connect(context.destination);
     const gain=context.createGain.bind(context);context.createGain=()=>{const node=gain(),connect=node.connect.bind(node);node.connect=(target,...args)=>connect(target===context.destination?analyser:target,...args);return node;};
     window.residentReport={starts:[],nativeCalls:0};
     window.residentSpeech=createNeuralCharacterSpeech({audioFactory:()=>context,nativeSpeech:{getVoices:()=>[],resume(){},speak(){residentReport.nativeCalls++;throw Error('Native synthesis forbidden');}},NativeUtterance:null});
     let playing=false;residentSpeech.addEventListener('statechange',()=>{if(residentSpeech.speaking&&!playing)residentReport.starts.push(residentSpeech.state.selectedVoice);playing=residentSpeech.speaking;});
     window.residentVoice=createQuestConversationVoice({speech:residentSpeech,Utterance:GameSpeechUtterance});
     window.residentAudio=createResidentConversationAudio({voice:residentVoice});
     window.residentSnapshot={serverTime:Date.now(),players:{self:{position:{x:0,y:0,z:0}}},actors:{
      a:{position:{x:2,y:0,z:0},resident:{name:'Maya',role:'Resident',isAI:true}},b:{position:{x:3,y:0,z:0},resident:{name:'Rowan',role:'Resident',isAI:true}}
     },residentLife:{conversations:[]}};
     window.updateResidentAudio=()=>residentAudio.update(residentSnapshot,'self',{id:'commons'});
     residentVoice.setScene({listener:residentSnapshot.players.self.position,actors:residentSnapshot.actors});updateResidentAudio();
     for(const [gender,id,message]of [['male','a','Good to see you. How is your day?'],['female','b','Very well, thank you. Shall we explore?']]){
      const button=document.createElement('button');button.textContent='Hear '+gender+' resident';button.onclick=async()=>{
       residentVoice.setPreferences({speechVoiceGender:gender});await residentVoice.unlock();
       const at=Date.now(),info=residentSnapshot.actors[id].resident;residentSnapshot.serverTime=at;
       Object.assign(info,{speech:message,speechUntil:at+3200,speaking:true,interaction:{kind:'conversation',phase:'speaking',partnerId:id==='a'?'b':'a'}});
       residentSnapshot.residentLife.conversations.push({id:'talk:'+at,participants:['a','b'],lines:[{speakerId:id,text:message,at}]});updateResidentAudio();updateResidentAudio();
      };document.body.append(button);
     }
     window.residentPeak=async()=>{let peak=0;const samples=new Float32Array(analyser.fftSize),until=performance.now()+500;while(performance.now()<until){analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));await new Promise(resolve=>setTimeout(resolve,10));}return peak;};
    }''')
    peaks=[]
    for index,gender in enumerate(['male','female'],1):
     page.get_by_role('button',name='Hear '+gender+' resident',exact=True).click()
     page.wait_for_function(f'residentReport.starts.length==={index}||residentSpeech.lastError',timeout=120000)
     assert not page.evaluate('residentSpeech.lastError'),page.evaluate('residentSpeech.lastError')
     peak=page.evaluate('residentPeak()');assert peak>.0001,peak;peaks.append(peak)
     page.wait_for_function('!residentVoice.state.speaking&&!residentSpeech.pending',timeout=30000)
    assert len(requests)==2,requests
    assert [request['voice'] for request in requests]==['male','female'],requests
    assert len(responses)==2 and all(response['status']==200 and response['type'].startswith('audio/wav') for response in responses),responses
    assert page.evaluate('residentReport.nativeCalls')==0
    assert not errors,errors
    print(json.dumps({'nearbyResidentSpeech':True,'peaks':peaks,'requests':requests,'responses':responses,'nativeCalls':0}));browser.close()
  finally:
   if process.poll() is None:
    os.killpg(process.pid,signal.SIGTERM)
    try:process.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=5)
