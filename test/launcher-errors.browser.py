"""Exercise real browser module failures and clean, explicit launcher recovery."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
HTML='''<!doctype html><html><body><section id="house-game-start"><button data-house-start>Begin</button><p id="house-game-load-status"></p></section><script>window.documentEpoch=Date.now()+':'+Math.random();window.engineMounts=0;window.requestCount=0;</script><script src="/public/js/rad-tox-launcher.js?v=startup-recovery-test"></script></body></html>'''
SUCCESS='''window.engineMounts++;document.addEventListener('muzikaz:rad-tox-request',function(){window.requestCount++;document.getElementById('house-game-load-status').textContent='Fixture gameplay ready';document.dispatchEvent(new CustomEvent('muzikaz:gameplay-ready'));});document.dispatchEvent(new CustomEvent('muzikaz:rad-tox-engine-ready'));'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  try:
   for scenario in ['evaluation','dependency']:
    page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/test/fixtures/launcher-recovery.html*',lambda route:route.fulfill(content_type='text/html',body=HTML))
    engine_requests=[];dependency_requests=[]
    def engine(route):
     engine_requests.append(route.request.url)
     if scenario=='evaluation' and len(engine_requests)==1:
      route.fulfill(content_type='text/javascript',body="window.partialEngine=true;document.addEventListener('muzikaz:rad-tox-request',function(){window.leakedRequest=true;});throw new Error('Transient engine evaluation failure');")
     else:
      prefix="import './launcher-recovery-dependency.js';" if scenario=='dependency' else ''
      route.fulfill(content_type='text/javascript',body=prefix+SUCCESS)
    def dependency(route):
     dependency_requests.append(route.request.url)
     route.fulfill(content_type='text/javascript',body="throw new Error('Transient dependency unavailable');" if len(dependency_requests)==1 else 'export const available=true;')
    page.route('**/house-explorer-glb.js*',engine)
    page.route('**/launcher-recovery-dependency.js',dependency)
    # The first click stays lazy; the recovery preserves every Builder/map
    # parameter and starts the replacement document automatically only once.
    original=base+'/test/fixtures/launcher-recovery.html?environment=world-item-factory&house=world-item-factory&mode=multiplayer&builderScene=keep-this-scene#dispatch-yard'
    page.goto(original);assert len(engine_requests)==0
    first_epoch=page.evaluate('documentEpoch')
    page.locator('[data-house-start]').click();page.wait_for_function("document.querySelector('[data-house-start]').textContent==='Try again'")
    message=page.locator('#house-game-load-status').inner_text()
    assert 'Transient' in message and 'restart cleanly' in message,message
    assert not page.locator('[data-house-start]').is_disabled()
    assert len(engine_requests)==1
    page.wait_for_timeout(100)
    assert page.evaluate('documentEpoch')==first_epoch,'failures wait for a user retry instead of reloading repeatedly'
    page.locator('[data-house-start]').click()
    page.wait_for_function("document.body.dataset.gameControls==='ready'")
    assert page.evaluate('documentEpoch')!=first_epoch,'a cached module failure requires a new document'
    params=parse_qs(urlparse(page.url).query)
    for key,value in [('environment','world-item-factory'),('house','world-item-factory'),('mode','multiplayer'),('builderScene','keep-this-scene'),('autoplay','1')]:assert params[key]==[value],params
    assert params.get('gameRecovery') and urlparse(page.url).fragment=='dispatch-yard'
    assert len(engine_requests)==2 and '&recovery=' in engine_requests[-1],engine_requests
    assert page.evaluate('engineMounts')==1 and page.evaluate('requestCount')==1
    assert page.evaluate('window.partialEngine===undefined && window.leakedRequest===undefined')
    if scenario=='dependency':assert len(dependency_requests)==2,'the failed dependency is fetched in the clean replacement document'
    epoch=page.evaluate('documentEpoch')
    page.evaluate("document.dispatchEvent(new CustomEvent('muzikaz:rad-tox-native-error',{detail:{message:'Map entry is rebuilding'}}))")
    assert 'Map entry is rebuilding' in page.locator('#house-game-load-status').inner_text()
    page.locator('[data-house-start]').click();page.wait_for_function('requestCount===2')
    assert page.evaluate('documentEpoch')==epoch,'a fully evaluated engine keeps its native initialization retry'
    assert len(engine_requests)==2 and page.evaluate('engineMounts')==1
    assert not errors,errors
    page.close()
    print('PASS '+scenario+': clean document retry, preserved map/Builder entry, no duplicate mounts, native error retry retained.',flush=True)
  finally:browser.close()
finally:server.shutdown()
