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
base=f'http://127.0.0.1:{server.server_port}'
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in ((375,667),(1280,800),(844,390)):
   page=browser.new_page(viewport={'width':width,'height':height})
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.route('https://**/*',lambda r:r.abort())
   page.goto(base+'/test/fixtures/machine-pages.html')
   page.wait_for_function('window.ready===true')
   for machine in page.evaluate('window.machineIds'):
    page.evaluate('(id)=>window.openMachine(id)',machine)
    dialog=page.locator('dialog')
    if dialog.locator('.machine-menu').count():
     labels=dialog.locator('.machine-menu button').all_text_contents()
     for label in labels:
      dialog.locator('.machine-menu').get_by_role('button',name=label,exact=True).click()
      page.wait_for_timeout(60)
      for button in dialog.locator('button:visible,input:visible,textarea:visible').all():
       box=button.bounding_box()
       assert box and box['y']>=-1 and box['y']+box['height']<=height+1,(machine,label,width,height,box)
      if label=='Shared queue':
       first=dialog.locator('.machine-page:visible .machine-readout').inner_text()
       dialog.get_by_role('button',name='Next',exact=True).click()
       assert dialog.locator('.machine-page:visible .machine-readout').inner_text()!=first
       page.evaluate('window.refreshMachine()')
       assert dialog.locator('.machine-page:visible .machine-pagination output').inner_text().startswith('2 /')
      if label=='Add media link':
       dialog.locator('input[type=url]').fill('https://example.com/test.mp4')
       dialog.get_by_role('button',name='Add to shared queue',exact=True).click()
       page.wait_for_function("window.commands.some(c=>c.operation==='enqueue')")
      dialog.get_by_role('button',name='Machine menu',exact=True).click()
    else:
     assert dialog.locator('.arcade-player-nav').count()==1,machine
     page.get_by_role('button',name='Play',exact=True).click()
     page.wait_for_timeout(100)
     for control in dialog.locator('.arcade-player-stage button:visible').all():
      box=control.bounding_box()
      assert box and box['y']>=-1 and box['y']+box['height']<=height+1,(machine,width,height,box)
     page.get_by_role('button',name='How to play',exact=True).click()
     assert dialog.locator('.arcade-player-guide').is_visible()
     while True:
      page.wait_for_timeout(60)
      for control in dialog.locator('.arcade-player-guide button:visible').all():
       box=control.bounding_box()
       assert box and box['y']>=-1 and box['y']+box['height']<=height+1,(machine,'Help',width,height,box)
      next_help=dialog.get_by_role('button',name='Next help',exact=True)
      if next_help.is_disabled(): break
      next_help.click()
     page.get_by_role('button',name='Session',exact=True).click()
     page.wait_for_timeout(100)
     for button in dialog.locator('button:visible').all():
      box=button.bounding_box()
      assert box and box['y']>=-1 and box['y']+box['height']<=height+1,(machine,'Session',width,height,box)
    page.keyboard.press('Escape')
   for model in ('market-atm','shared-video-player','media-boombox','community-noticeboard'):
    page.evaluate('(id)=>window.openMachineDemo(id)',model)
    page.get_by_role('button',name='Try local demo',exact=True).click()
    page.wait_for_timeout(100)
    for control in page.locator('dialog button:visible,dialog textarea:visible').all():
     box=control.bounding_box()
     assert box and box['y']>=-1 and box['y']+box['height']<=height+1,(model,'demo',width,height,box)
    page.keyboard.press('Escape')
   assert not errors,(width,height,errors)
   page.close()
  browser.close()
 print('All registered machines passed dedicated screens, return navigation, media queue pagination, enqueue wiring and game controls at phone, desktop and landscape sizes.')
finally:
 server.shutdown()
