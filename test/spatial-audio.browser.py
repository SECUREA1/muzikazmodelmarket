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
  page = browser.new_page()
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  result = page.evaluate('''async () => {
   const {createSpatialEffectOutput} = await import('/public/js/shared-effect-audio.js');
   async function sample(x, spatial=true, volume=1) {
    const context = new OfflineAudioContext(2, 24000, 48000);
    const output = createSpatialEffectOutput(context, {range:40}), tone = context.createOscillator();
    tone.frequency.value = 440; tone.connect(output.input);
    output.update({source:{x,y:0,z:-1}, listener:{x:0,y:0,z:0}, direction:{x:0,y:0,z:-1}, spatial, volume});
    tone.start(); tone.stop(.45);
    const buffer = await context.startRendering(), rms = [];
    for (let channel=0; channel<2; channel++) {
     const samples = buffer.getChannelData(channel); let sum = 0;
     for (let i=4800; i<19200; i++) sum += samples[i]*samples[i];
     rms.push(Math.sqrt(sum/14400));
    }
    output.dispose(); return rms;
   }
   return {right:await sample(5), left:await sample(-5), far:await sample(25), flat:await sample(5,false), mute:await sample(5,true,0)};
  }''')
  assert result['right'][1] > result['right'][0]*1.1, result
  assert result['left'][0] > result['left'][1]*1.1, result
  assert sum(result['far']) < sum(result['right'])*.4, result
  assert abs(result['flat'][0]-result['flat'][1]) < .001, result
  assert max(result['mute']) == 0, result
  print(json.dumps(result)); browser.close()
finally:
 server.shutdown()
