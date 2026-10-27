"""Play real, repository-generated WAVs in Chromium without native speech voices.

The HTTP fixture substitutes stored male/female previews for the generation API;
server inference has its own integration test. Decoding/playback is real Web Audio.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import json, os

root=Path(__file__).resolve().parents[1]
os.chdir(root)
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_POST(self):
  if self.path!='/api/speech': self.send_error(404); return
  payload=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  data=(root/'public/audio/voices'/('male-preview.wav' if payload['voice']=='male' else 'female-preview.wav')).read_bytes()
  self.send_response(200); self.send_header('Content-Type','audio/wav'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)

server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();errors=[]
  page.on('pageerror',lambda error:errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.evaluate('''async () => {
   const {createNeuralCharacterSpeech,GameSpeechUtterance,GENERATED_VOICES}=await import('/public/js/neural-character-speech.js');
   const context=new AudioContext(),analyser=context.createAnalyser();analyser.fftSize=2048;
   const gain=context.createGain.bind(context);context.createGain=()=>{const output=gain(),connect=output.connect.bind(output);output.connect=target=>{connect(target);connect(analyser);};return output;};
   window.neuralReport={nativeVoices:window.speechSynthesis?.getVoices().length||0};
   window.voiceContext=context;window.voiceAnalyser=analyser;
   window.neuralSpeech=createNeuralCharacterSpeech({audioFactory:()=>context});
   window.previewLine=new GameSpeechUtterance('Hello. This is the generated female preview.');previewLine.voice=GENERATED_VOICES[0];
   previewLine.onstart=()=>window.neuralReport.femaleStarted=true;previewLine.onerror=e=>{if(e.error!=='canceled')window.neuralError=e.error;};
   const button=document.createElement('button');button.id='neural-preview';button.textContent='Play generated preview';
   button.onclick=()=>{neuralSpeech.resume();neuralSpeech.speak(previewLine);};document.body.append(button);
   window.maleVoice=GENERATED_VOICES[1];window.Utterance=GameSpeechUtterance;
  }''')
  page.get_by_role('button',name='Play generated preview',exact=True).click()
  page.wait_for_function('window.neuralReport.femaleStarted || window.neuralError')
  assert page.evaluate('window.neuralReport.femaleStarted'),page.evaluate('window.neuralError')
  page.wait_for_timeout(650)
  peak=page.evaluate('''() => {const samples=new Float32Array(voiceAnalyser.fftSize);voiceAnalyser.getFloatTimeDomainData(samples);return Math.max(...samples.map(Math.abs));}''')
  assert peak>0.00001,peak
  page.evaluate('window.previewLine.volume=0')
  page.wait_for_timeout(180)
  muted=page.evaluate('''() => {const samples=new Float32Array(voiceAnalyser.fftSize);voiceAnalyser.getFloatTimeDomainData(samples);return Math.max(...samples.map(Math.abs));}''')
  assert muted<0.00001,muted
  page.evaluate('''() => {const line=new Utterance('Hello. This is the generated male preview.');line.voice=maleVoice;line.onstart=()=>window.neuralReport.maleStarted=true;neuralSpeech.speak(line);}''')
  page.wait_for_function('window.neuralReport.maleStarted || window.neuralError')
  assert page.evaluate('window.neuralReport.maleStarted'),page.evaluate('window.neuralError')
  assert page.evaluate('window.neuralSpeech.speaking')
  page.evaluate('window.neuralSpeech.dispose()')
  page.wait_for_function('window.voiceContext.state === "closed"')
  assert not errors,errors
  print(json.dumps({**page.evaluate('window.neuralReport'),'peak':peak,'mutedPeak':muted,'nativeSynthesisUsed':False}))
  browser.close()
finally: server.shutdown()
