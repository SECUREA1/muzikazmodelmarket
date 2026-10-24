"""Construction controls recover across delayed actions and replacement sites."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height})
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/construction-dashboard.html')
   page.wait_for_selector('body[data-ready=true]')
   assert page.locator('.construction-controls').get_attribute('data-gameplay-blocking')=='false'
   assert page.locator('.construction-action-utilities').get_attribute('data-gameplay-blocking')=='false'
   page.evaluate("setMachine('site-excavator','excavator');deferActions=true")
   page.get_by_role('button',name='Park construction machine',exact=True).click()
   page.wait_for_function('actionWaiters.length===1')
   page.evaluate("setMachine('site-bulldozer','bulldozer')")
   assert page.get_by_role('button',name='Park construction machine',exact=True).is_enabled(),'A pending excavator action locked the replacement bulldozer.'
   page.get_by_role('button',name='Park construction machine',exact=True).click()
   page.wait_for_function('actionWaiters.length===2')
   page.evaluate("actionWaiters[0].resolve({result:{message:'Obsolete excavator result'}})")
   page.wait_for_timeout(50)
   assert page.get_by_role('button',name='Park construction machine',exact=True).is_disabled(),'An old reply released the new machine request.'
   assert 'Obsolete' not in page.locator('.construction-compact-state').inner_text()
   page.evaluate("actionWaiters[1].resolve({result:{message:'Bulldozer parked'}})")
   page.wait_for_function("document.querySelector('.construction-compact-state').textContent==='Bulldozer parked'")
   # A room replacement can reuse machine IDs. Old hydraulic replies must not
   # occupy the new machine's input slots or overwrite its feedback.
   page.evaluate("deferActions=false;deferControls=true;setMachine('site-excavator','excavator')")
   stick=page.locator('.construction-work-sticks .construction-stick').first
   stick.focus();page.keyboard.down('ArrowUp')
   page.wait_for_function('controlWaiters.length>=2')
   page.keyboard.up('ArrowUp')
   page.evaluate("window.oldControlCount=controlWaiters.length;dashboard.update({players:{},actors:{}},null);setMachine('site-excavator','excavator')")
   stick.focus();page.keyboard.down('ArrowLeft')
   page.wait_for_function('controlWaiters.length>oldControlCount')
   assert page.evaluate('lastAxes().slew<0'),'New hydraulics waited for an obsolete site request.'
   page.keyboard.up('ArrowLeft')
   page.evaluate('deferControls=false;for(const resolve of controlWaiters)resolve()')
   # Crew requests have their own site lifecycle, including reuse of worker IDs.
   page.evaluate('state.players.me.vehicleId=null;refresh();deferActions=true;actionWaiters.length=0')
   page.get_by_role('button',name='Construction crew and jobs',exact=True).click()
   page.get_by_role('button',name='Start crew',exact=True).click()
   page.wait_for_function('actionWaiters.length===1')
   page.evaluate("dashboard.update({players:{},actors:{}},null);refresh()")
   page.get_by_role('button',name='Construction crew and jobs',exact=True).click()
   assert page.get_by_role('button',name='Start crew',exact=True).is_enabled(),'A former site request locked the new crew.'
   page.get_by_role('button',name='Start crew',exact=True).click()
   page.wait_for_function('actionWaiters.length===2')
   page.evaluate("actionWaiters[0].resolve({result:{message:'Obsolete site result'}})")
   page.wait_for_timeout(50)
   assert page.get_by_role('button',name='Start crew',exact=True).is_disabled(),'An old site reply released the new crew request.'
   assert 'Obsolete' not in page.locator('.construction-crew-status').inner_text()
   page.evaluate("actionWaiters[1].resolve({result:{message:'Current crew ready'}})")
   page.wait_for_function("document.querySelector('.construction-crew-status').textContent==='Current crew ready'")
   assert page.get_by_role('button',name='Start crew',exact=True).is_enabled()
   assert not errors,errors
   page.close()
  browser.close()
 print('Construction machine, hydraulic and crew controls recover from delayed requests across replacement machines and sites.')
finally: server.shutdown()
