from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os,json
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page();errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/gameplay-audio.html')
  page.get_by_role('button',name='Run effects check').click()
  page.wait_for_function('window.audioReport || window.audioError')
  result=page.evaluate('window.audioReport');assert result,page.evaluate('window.audioError')
  assert result['state']=='running'
  assert result['accepted']==16 and result['after']==16,result
  assert 0<result['peak']<1,result
  assert result['visuals']==12 and result['sounds']==3 and result['replayed']==0,result
  assert result['cachedNoise'] and not errors,(result,errors)
  print(json.dumps(result));browser.close()
finally:server.shutdown()
