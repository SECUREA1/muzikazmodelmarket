from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in [(320,568),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.add_style_tag(url=f'http://127.0.0.1:{server.server_port}/public/assets/game-menus.css')
   page.evaluate('''async()=>{
    const {fullscreenPanel}=await import('/public/js/fullscreen-panels.js');
    document.body.replaceChildren();window.panels=[];window.panelCloseCount=0;window.inputReleases=[];
    document.addEventListener('muzikaz:release-game-input',event=>inputReleases.push(event.detail.reason));
    for(const id of ['maps','settings']){const trigger=document.createElement('button');trigger.textContent=id;trigger.id=id+'-toggle';trigger.setAttribute('aria-controls',id);trigger.setAttribute('aria-expanded','false');document.body.append(trigger);const panel=document.createElement('section');panel.id=id;panel.hidden=true;panel.setAttribute('aria-label',id);panel.innerHTML='<input aria-label="Search '+id+'"><button data-switch>Switch panel</button>';const screen=fullscreenPanel(panel,{onClose:()=>window.panelCloseCount++});trigger.onclick=()=>screen.open();panel.querySelector('[data-switch]').onclick=()=>panels[1].open();panels.push(screen);}
   }''')
   page.locator('#maps-toggle').click();assert page.locator('#maps-toggle').get_attribute('aria-expanded')=='true'
   assert page.evaluate('inputReleases')==['panel-open']
   page.evaluate('panels[0].open()')
   assert page.evaluate('inputReleases')==['panel-open'],'An already-open panel must not repeatedly cancel fresh controls.'
   page.get_by_role('button',name='Switch panel',exact=True).click()
   assert page.get_by_role('dialog',name='settings',exact=True).is_visible()
   page.wait_for_function('document.querySelector("#maps-toggle").getAttribute("aria-expanded")==="false"')
   assert page.locator('#maps-toggle').get_attribute('aria-expanded')=='false'
   assert page.locator('#settings-toggle').get_attribute('aria-expanded')=='true'
   page.keyboard.press('Escape');assert page.locator('dialog[open]').count()==0
   page.wait_for_function('document.querySelector("#settings-toggle").getAttribute("aria-expanded")==="false"')
   assert page.locator('#settings-toggle').get_attribute('aria-expanded')=='false'
   assert not page.evaluate('document.documentElement.classList.contains("game-menu-open")')
   page.wait_for_function('inputReleases.filter(reason=>reason==="panel-close").length===2')
   assert page.evaluate('inputReleases.filter(reason=>reason==="panel-open").length')==2
   # A companion map stays open behind real modal tools. Closing those tools
   # restores focus and clears the body lock while retaining the map.
   page.evaluate('''()=>{const map=document.createElement('dialog');map.id='companion-map';map.dataset.gameplayBlocking='false';map.textContent='Live map';document.body.append(map);map.show();}''')
   page.locator('#maps-toggle').click();page.get_by_role('button',name='Close maps',exact=True).click()
   assert page.locator('#maps-toggle').evaluate('(el)=>el===document.activeElement')
   assert page.locator('#companion-map').is_visible()
   assert not page.locator('#companion-map').evaluate('(el)=>el.matches(":modal")')
   assert not page.evaluate('document.documentElement.classList.contains("game-menu-open")')
   assert page.evaluate('window.panelCloseCount')==3
   assert page.evaluate('inputReleases.filter(reason=>reason==="panel-open").length')==3
   assert page.evaluate('inputReleases.filter(reason=>reason==="panel-close").length')==3
   assert not errors,errors;page.close()
  browser.close()
 print('Shared panels: mobile/desktop toggle state, panel switching, Escape, close buttons and focus restoration passed.')
finally:server.shutdown()
