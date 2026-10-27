from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self, *args): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
 with sync_playwright() as p:
  browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
  page = browser.new_page()
  errors = []
  page.on('pageerror', lambda error: errors.append(str(error)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
  page.wait_for_function("document.body.dataset.ready === 'true'")
  page.evaluate('''async () => {
   window.spoken=[]; window.cancelled=0;
   const Utterance=class { constructor(text){this.text=text;} };
   const {GENERATED_VOICES}=await import('/public/js/neural-character-speech.js');
   const speech={getVoices:()=>GENERATED_VOICES,speak:call=>{spoken.push(call);call.onstart?.();},cancel(){cancelled++;},resume(){}};
   const {createQuestConversationVoice}=await import('/public/js/quest-conversation-voice.js');
   const {mountAirportOperations}=await import('/public/js/airport-operations.js');
   window.worldVoice=createQuestConversationVoice({speech,Utterance});
   window.airportOps=mountAirportOperations({audioOptions:{speech,Utterance,audioFactory:()=>null},stage:document.querySelector('.house-stage'),command:async()=>({result:{message:'Tower. Ready.'}})});
   airportOps.updateEnvironment({id:'airport',airport:{enabled:true}});
   airportOps.update({players:{pilot:{health:100,position:{x:0,y:0,z:0}}},actors:{}},'pilot');
   worldVoice.unlock();worldVoice.announce('Welcome to the airport.',{worldId:'airport',category:'introduction'});
  }''')
  assert page.evaluate('spoken.length') == 1
  page.locator('.house-stage').dispatch_event('pointerdown', {'button':0, 'pointerId':1})
  assert page.evaluate('spoken.length') == 1, 'Passive stage gesture added a second introduction'
  assert page.evaluate('cancelled') == 0, 'Idle tower interrupted the world welcome'
  page.get_by_role('button', name='Airport tower radio', exact=True).click()
  assert page.evaluate('spoken.length') == 2
  assert page.evaluate('spoken[1].text.includes("Radio connected")')
  assert page.evaluate('cancelled') == 1, 'Explicit radio opening should hand over speech exactly once'
  assert not page.evaluate('worldVoice.state.speaking')
  page.get_by_role('dialog', name='Airport tower radio').get_by_role('button', name='Close', exact=True).click()
  page.evaluate('spoken[1].onend()')
  page.get_by_role('button', name='Airport tower radio', exact=True).click()
  assert page.evaluate('spoken.length') == 2, 'Reopening radio repeated its introduction'
  page.evaluate('airportOps.dispose(); worldVoice.dispose()')
  assert not errors, errors
  browser.close()
  print('World introduction stays clear during passive airport gestures; explicit radio handoff speaks once.')
finally:
 server.shutdown()
