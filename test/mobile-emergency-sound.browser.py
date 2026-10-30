"""Measure real phone-band emergency audio and exercise mobile recovery controls."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--autoplay-policy=user-gesture-required'])
  for width, height in [(390, 844), (740, 360)]:
   page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=True, is_mobile=True)
   errors = []
   page.on('pageerror', lambda error: errors.append(str(error)))
   page.route('**/__mobile-sound', lambda route: route.fulfill(body='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><button id="preview" style="min-height:48px">Test sounds</button><button id="resume" style="min-height:48px">Resume sounds</button>''', content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__mobile-sound')
   page.evaluate('''async()=>{
    const {createDoomsdayAudio}=await import('/public/js/doomsday-audio.js');
    window.preferences={effectsVolume:100};window.contexts=0;window.nodes=[];
    window.audio=createDoomsdayAudio({getPreferences:()=>preferences,makeContext:()=>{
     contexts++;const context=window.context=new AudioContext(),analyser=window.analyser=context.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=0;analyser.connect(context.destination);
     for(const method of ['createGain','createOscillator','createBufferSource','createBiquadFilter']){
      const make=context[method].bind(context);context[method]=(...args)=>{const node=make(...args),record={node,disconnected:false};nodes.push(record);const connect=node.connect.bind(node),disconnect=node.disconnect.bind(node);node.connect=(destination,...rest)=>connect(destination===context.destination?analyser:destination,...rest);node.disconnect=(...args)=>{record.disconnected=true;return disconnect(...args);};return node;};
     }
     return context;
    }});
    window.sample=()=>{const wave=new Float32Array(analyser.fftSize),spectrum=new Float32Array(analyser.frequencyBinCount);analyser.getFloatTimeDomainData(wave);analyser.getFloatFrequencyData(spectrum);let power=0,phoneBand=0;for(const value of wave)power+=value*value;for(let i=0;i<spectrum.length;i++){const hz=i*context.sampleRate/analyser.fftSize;if(hz>=200&&hz<=2000&&Number.isFinite(spectrum[i]))phoneBand+=10**(spectrum[i]/10);}return {rms:Math.sqrt(power/wave.length),phoneBand};};
    window.idle=()=>audio.update({id:null,phase:'idle'},0);
    window.blast=(age,time=age)=>audio.update({id:'measured-event',phase:'detonation',phaseElapsedMs:age*1000},time);
    document.querySelector('#preview').onclick=()=>{window.previewResult=audio.preview();};
    document.querySelector('#resume').onclick=()=>{window.resumeResult=audio.resume();};
    audio.update({id:'future-event',phase:'warning'},0);
   }''')
   assert page.evaluate("contexts===0 && audio.status.code==='locked'")
   page.get_by_role('button', name='Test sounds', exact=True).tap()
   page.wait_for_function("audio.status.previewing && audio.status.code==='playing'")
   page.wait_for_timeout(180)
   preview = page.evaluate('sample()')
   assert preview['rms'] > .005 and preview['phoneBand'] > .0001, preview
   page.evaluate('idle()')
   assert page.evaluate('audio.status.previewing'), 'Quiet arrival ticks cancelled the requested sound check.'
   page.wait_for_function("!audio.status.previewing && audio.status.code==='ready'", timeout=5000)
   page.wait_for_timeout(100)
   assert page.evaluate('sample().rms') < .00001, 'The sound check did not stop.'
   assert page.evaluate('nodes.every(record=>record.disconnected)'), 'Preview retained connected audio nodes.'

   # Play the second staged impact in a siren quiet interval. This measures
   # the explosion's own phone-band crack rather than the siren's mid tones.
   page.evaluate('blast(0)')
   page.wait_for_timeout(1750)
   page.evaluate('blast(1.61,13)')
   page.wait_for_timeout(55)
   explosion = page.evaluate('sample()')
   assert explosion['rms'] > .001 and explosion['phoneBand'] > .000001, explosion
   page.evaluate("audio.update({id:'measured-event',phase:'all-clear'},14)")
   page.wait_for_timeout(100)
   assert page.evaluate("audio.status.code==='ready' && nodes.every(record=>record.disconnected)")
   assert page.evaluate('sample().rms') < .00001

   page.evaluate('preferences.masterMuted=true;idle()')
   assert page.evaluate("audio.status.code==='master-muted'")
   page.get_by_role('button', name='Test sounds', exact=True).tap()
   assert page.evaluate('previewResult') is False
   assert page.evaluate('sample().rms') < .00001
   page.evaluate('preferences.masterMuted=false;preferences.effectsMuted=true;idle()')
   assert page.evaluate("audio.status.code==='effects-muted'")
   page.evaluate('preferences.effectsMuted=false;preferences.effectsVolume=0;idle()')
   assert page.evaluate("audio.status.code==='zero-volume'")
   page.get_by_role('button', name='Test sounds', exact=True).tap()
   assert page.evaluate('previewResult') is False

   page.evaluate('preferences.effectsVolume=100;audio.setMuted(true)')
   assert page.evaluate("audio.status.code==='muted'")
   page.evaluate('audio.setMuted(false)')
   page.evaluate('context.suspend()')
   assert page.evaluate("audio.status.code==='suspended'")
   page.get_by_role('button', name='Resume sounds', exact=True).tap()
   page.wait_for_function("audio.status.contextState==='running' && audio.status.code==='ready'")
   page.get_by_role('button', name='Test sounds', exact=True).tap()
   page.wait_for_function('audio.status.previewing')
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))")
   assert page.evaluate("audio.status.code==='hidden' && !audio.status.previewing && nodes.every(record=>record.disconnected)")
   page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));audio.dispose()")
   assert page.evaluate("audio.status.code==='unavailable' && context.state==='closed'")
   assert not errors, errors
   print(f'{width}x{height}: touch unlock, measured preview {json.dumps(preview)}, isolated explosion {json.dumps(explosion)}, mute/volume status, bounded cleanup and resume passed', flush=True)
   page.close()
  browser.close()
finally:
 server.shutdown()
