from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True);page.set_default_timeout(6000);errors=[]
   page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.wait_for_selector('body[data-ready=true]')
   trigger=page.get_by_role('button',name='Basketball throw settings',exact=True)
   trigger.tap();dialog=page.get_by_role('dialog',name='Basketball throw settings',exact=True)
   assert dialog.is_visible() and trigger.get_attribute('aria-expanded')=='true'
   assert page.evaluate('window.aimOpens')==1
   box=dialog.bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width and box['y']+box['height']<=height
   assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth+1')
   power=page.get_by_role('slider',name='Basketball throw power');power.scroll_into_view_if_needed()
   slider_box=power.bounding_box();page.touchscreen.tap(slider_box['x']+slider_box['width']*.25,slider_box['y']+slider_box['height']/2)
   assert .1<page.evaluate('window.throwAim.options().power')<.7
   assert dialog.is_visible()
   power.focus();page.keyboard.press('End')
   assert page.evaluate('window.throwAim.options().power')==1
   angle=page.get_by_role('slider',name='Basketball launch angle');angle.scroll_into_view_if_needed()
   slider_box=angle.bounding_box();page.touchscreen.tap(slider_box['x']+slider_box['width']*.75,slider_box['y']+slider_box['height']/2)
   assert 55<page.evaluate('window.throwAim.options().angle')<80
   angle.focus();page.keyboard.press('Home')
   assert page.evaluate('window.throwAim.options().angle')==20
   page.get_by_label('Basketball aiming mode',exact=True).select_option('manual')
   page.get_by_label('Basketball flight preview',exact=True).select_option('toss')
   assert page.evaluate('window.throwAim.previewAction()')=='toss'
   page.get_by_role('button',name='Done',exact=True).tap()
   assert not dialog.is_visible()
   page.wait_for_function("document.querySelector('.basketball-aim').getAttribute('aria-expanded')==='false'")
   assert page.evaluate('document.activeElement.classList.contains("basketball-aim")')
   trigger.tap();assert power.input_value()=='100' and angle.input_value()=='20'
   assert page.evaluate("JSON.parse(localStorage.getItem('muzikazBasketballAim')).mode")=='manual'
   page.get_by_role('button',name='Reset calibration',exact=True).tap()
   assert page.evaluate('window.throwAim.options()')=={'power':.7,'angle':55,'mode':'assisted'}
   page.keyboard.press('Escape');assert not dialog.is_visible()
   trigger.tap();page.touchscreen.tap(2,2);assert not dialog.is_visible()
   trigger.tap();page.get_by_role('button',name='Close throw settings',exact=True).tap();assert not dialog.is_visible()
   assert not errors,errors
   if width==390:
    trigger.tap();page.screenshot(path='/tmp/mobile-throw-tuner.png')
   page.close()
  browser.close()
 print('Mobile throw tuner: portrait/landscape fit, sliders, modes, autosave, reset, Done, Escape and backdrop dismissal passed.')
finally:server.shutdown()
