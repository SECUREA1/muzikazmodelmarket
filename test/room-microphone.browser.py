"""Real browser microphone capture must survive a blocked speaker context."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
  context=browser.new_context(permissions=['microphone']);page=context.new_page();errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.evaluate('''async()=>{
   const markup=new DOMParser().parseFromString(await(await fetch('/model-explorer.html')).text(),'text/html');
   document.body.replaceChildren(markup.querySelector('#crib-chat-toggle'),markup.querySelector('#crib-social'));
   localStorage.setItem('muzikazHouseSessionId','mic-browser');
   window.MUZIKAZ_HOUSE_TRACKING={roomId:'mic-test'};
   window.MuzikazHouseExplorer={snapshot:()=>({roomId:'mic-test',serverHostedRoom:true,serverReady:true})};
   window.micPresence=[];window.EventSource=class extends EventTarget{close(){}};
   window.MUZIKAZ_API={url:path=>path,fetch:async(path,options={})=>{
    if(path.endsWith('/presence')){const body=JSON.parse(options.body);micPresence.push(body);return Response.json({users:[{sessionId:'mic-browser',roomId:'mic-test'}]});}
    if(path.includes('/chat'))return Response.json({messages:[]});
    return Response.json({signals:[],csrfToken:'fixture'});
   }};
   const OriginalContext=window.AudioContext;
   window.holdSpeaker=true;window.micContexts=[];window.pendingResumes=0;
   window.AudioContext=class extends OriginalContext{
    constructor(){super();micContexts.push(this);}
    resume(){if(holdSpeaker){pendingResumes++;return new Promise(()=>{});}return super.resume();}
   };
   const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
   window.captureCalls=0;window.captureActivated=[];
   navigator.mediaDevices.getUserMedia=constraints=>{captureCalls++;captureActivated.push(navigator.userActivation.isActive);return capture(constraints).then(stream=>window.capturedMic=stream);};
   await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/public/js/crib-multiplayer.js';script.onload=resolve;script.onerror=reject;document.body.append(script);});
   document.dispatchEvent(new Event('pointerdown'));await micContexts[0].suspend();
   document.querySelector('#crib-chat-toggle').click();
  }''')
  page.click('#crib-mic-toggle')
  page.wait_for_function("document.querySelector('#crib-mic-toggle').getAttribute('aria-pressed')==='true' && micPresence.some(item=>item.voiceEnabled)",timeout=5000)
  assert page.evaluate('captureCalls===1 && captureActivated[0] && capturedMic.getAudioTracks()[0].readyState==="live"')
  assert page.evaluate('holdSpeaker && pendingResumes>0')
  page.evaluate('async()=>{await micContexts[0].suspend();holdSpeaker=false;}')
  page.click('#crib-chat-input')
  page.wait_for_function('micContexts[0].state==="running"',timeout=5000)
  peak=page.evaluate('''async()=>{
   const context=micContexts[0],source=context.createMediaStreamSource(capturedMic),analyser=context.createAnalyser(),silent=context.createGain();
   silent.gain.value=0;source.connect(analyser);analyser.connect(silent);silent.connect(context.destination);
   const samples=new Float32Array(analyser.fftSize);let peak=0;
   for(let i=0;i<100;i++){analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));if(peak>.001)break;await new Promise(resolve=>setTimeout(resolve,50));}
   source.disconnect();analyser.disconnect();silent.disconnect();return peak;
  }''')
  assert peak>.001,peak
  page.click('#crib-mic-toggle')
  page.wait_for_function('capturedMic.getAudioTracks()[0].readyState==="ended"')
  assert page.evaluate("document.querySelector('#crib-mic-toggle').getAttribute('aria-pressed')")=="false"
  assert not errors,errors
  print(json.dumps({'microphoneStartsWhileOutputResumePending':True,'trustedCapture':True,'inputPeak':round(peak,5),'laterGestureResumesOutput':True,'muteStopsTrack':True}))
  browser.close()
finally:
 server.shutdown()
