"""Every secondary control stays in the header extension without losing handlers."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os
os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#142523;color:#eaf6e8;font:14px system-ui}.house-explorer-shell{position:relative;margin:8px}.house-stage{position:relative;height:calc(100vh - 100px);min-height:220px;background:#172e27}button{font:14px system-ui;border:1px solid #9ec6ac;border-radius:6px;background:#203e35;color:#effff4;padding:9px;cursor:pointer}button[hidden],[hidden]{display:none!important}.house-control-dock{margin-top:8px}.mobile-move-pad{display:flex;justify-content:space-between}.game-dock-actions{display:flex;gap:5px;flex-wrap:wrap}.primary-use,.rad-tox-fire-trigger{min-width:44px;min-height:44px}.game-display-flow-views .live-local-map button{min-width:44px;min-height:44px}
</style><div class="house-explorer-shell"><div class="house-stage"><button class="rad-tox-fire-trigger" aria-label="Fire">Fire</button><button class="casino-use primary-use" aria-label="Use nearby">Use</button></div><div class="house-control-dock"><div class="game-dock-actions"><button id="house-world-button" class="house-bottom-control" aria-label="Choose world">World</button><button id="house-view-options" class="house-bottom-control" aria-label="Player settings">Settings</button></div><div class="mobile-move-pad"><button aria-label="Move stick">Move</button><button aria-label="Look stick">Look</button></div></div></div>'''
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.route('**/__complete-header',lambda route:route.fulfill(body=fixture,content_type='text/html'))
   page.goto(f'http://127.0.0.1:{server.server_port}/__complete-header')
   page.evaluate('''async()=>{
    const {mountGameDisplayFlow,setGameActionBarsHidden,revealGameViewControl}=await import('/public/js/game-display-flow.js');
    const {GAME_HEADER_CONTROLS}=await import('/public/js/game-header-controls.js');window.headerCatalog=GAME_HEADER_CONTROLS;
    window.counts={};window.captureLost=0;window.presses=0;window.reveal=revealGameViewControl;window.hideBars=setGameActionBarsHidden;
    window.stage=document.querySelector('.house-stage');window.dock=document.querySelector('.game-dock-actions');window.dockParent=dock.parentElement;
    const bind=(button,id)=>{button.dataset.probe=id;button.setAttribute('aria-label','Probe '+id);button.onclick=()=>counts[id]=(counts[id]||0)+1;};
    for(const name of ['game-camera-toggle','game-viewport-toggle','game-flashlight-toggle','district-map-toggle','airport-ops-toggle','range-ops-button','building-adjust-button','owned-placement-edit','shared-media-enable','island-native-status']){
     const button=document.createElement('button');button.className=name;button.textContent=name;bind(button,name);stage.append(button);
    }
    for(const name of ['broadcast-controls','sports-action-utilities','doomsday-menu','map-quest-prompts']){
     const group=document.createElement('section');group.className=name;
     const button=document.createElement('button');button.textContent=name==='doomsday-menu'?'Emergency response flow':name;bind(button,name);group.append(button);stage.append(group);
    }
    const xr=document.createElement('button');xr.className='xr-enter-button';xr.textContent='VR unavailable';xr.hidden=true;xr.disabled=true;bind(xr,'xr');stage.append(xr);
    for(const control of GAME_HEADER_CONTROLS.filter(control=>control.source==='stage')){
     if(stage.querySelector(control.selector))continue;
     const button=document.createElement('button');button.className=control.selector.slice(1);button.textContent=control.label;bind(button,'catalog-'+control.id);stage.append(button);
    }
    const nested=document.createElement('button');nested.className='map-quest-objective';nested.textContent='Active quest';bind(nested,'nested-active-quest');stage.querySelector('.map-quest-prompts').append(nested);
    for(const button of dock.querySelectorAll('button'))bind(button,button.id);
    window.flow=mountGameDisplayFlow(stage);
    // References used by later components must continue to target the same dock.
    const late=document.createElement('button');late.className='sports-icon-button';late.textContent='Late Build';bind(late,'late-build');dock.append(late);
    document.querySelector('.rad-tox-fire-trigger').onclick=()=>window.fireCount=(window.fireCount||0)+1;
   }''')
   more=page.get_by_role('button',name='More view controls',exact=True)
   more.wait_for(state='visible');menu=page.locator('.game-view-overflow')
   page.wait_for_function("document.querySelector('.game-dock-actions').closest('.game-view-overflow')!==null")
   assert page.evaluate("[...document.querySelectorAll('[data-probe]')].every(n=>!!n.closest('.game-view-overflow'))")
   assert page.evaluate("headerCatalog.filter(control=>control.source==='stage'||control.source==='dock').every(control=>stage.querySelector(control.selector)?.closest('.game-view-overflow'))")
   assert page.locator('.game-display-flow-views > :not(.game-view-more):not(.game-view-overflow)').count()==0
   assert page.locator('.rad-tox-fire-trigger').is_visible()
   assert page.get_by_role('button',name='Use nearby',exact=True).is_visible()
   assert page.get_by_role('button',name='Move stick',exact=True).is_visible()
   assert page.get_by_role('button',name='Look stick',exact=True).is_visible()
   assert menu.is_hidden() and page.locator('[data-probe="doomsday-menu"]').is_hidden()
   more.click();assert menu.is_visible()
   if page.locator('.house-stage').bounding_box()['height']>=300:
    assert menu.bounding_box()['y']+menu.bounding_box()['height']<=page.locator('.rad-tox-fire-trigger').bounding_box()['y'], 'header menu covers the primary fire control'
   assert page.locator('.xr-enter-button').is_hidden()
   probes=page.locator('[data-probe]:not(.xr-enter-button)')
   for index in range(probes.count()):
    button=probes.nth(index);key=button.get_attribute('data-probe');button.scroll_into_view_if_needed()
    box=button.bounding_box();assert box['height']>=44,(width,key,box)
    assert box['x']>=0 and box['x']+box['width']<=width+1,(width,key,box)
    button.click();assert page.evaluate('(key)=>counts[key]',key)==1,(width,key)
   # Changing a live label or hidden flag must not recreate the original button.
   late=page.locator('[data-probe="late-build"]');late.scroll_into_view_if_needed();late.focus()
   page.evaluate("dock.querySelector('[data-probe=late-build]').textContent='Build ready';document.querySelector('.xr-enter-button').hidden=false;document.querySelector('.xr-enter-button').disabled=false")
   page.wait_for_timeout(100)
   assert late.evaluate('n=>document.activeElement===n')
   assert late.evaluate("n=>n.parentElement===dock")
   xr=page.locator('.xr-enter-button');xr.scroll_into_view_if_needed();xr.click();assert page.evaluate('counts.xr')==1
   # Focused/held controls survive a refit without losing pointer capture.
   late.scroll_into_view_if_needed();page.evaluate("""()=>{const button=dock.querySelector('[data-probe=late-build]');button.addEventListener('pointerdown',event=>{button.setPointerCapture(event.pointerId);presses++;});button.addEventListener('lostpointercapture',()=>captureLost++);}""")
   box=late.bounding_box();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2);page.mouse.down()
   page.evaluate("dock.querySelector('[data-probe=late-build]').setAttribute('aria-label','Build ready');stage.dispatchEvent(new CustomEvent('muzikaz:action-bars-visibility'))")
   page.wait_for_timeout(100);assert page.evaluate('presses===1&&captureLost===0')
   page.mouse.up()
   page.evaluate("window.actionDialog=document.createElement('dialog');actionDialog.textContent='Menu action opened';document.body.append(actionDialog);const modalButton=document.createElement('button');modalButton.textContent='Open action dialog';modalButton.onclick=()=>actionDialog.showModal();dock.append(modalButton);")
   page.get_by_role('button',name='Open action dialog',exact=True).click()
   assert page.get_by_role('dialog').is_visible() and menu.is_hidden()
   page.evaluate('actionDialog.close()');more.click()
   # The global bars preference cannot remove the only route back to controls.
   page.evaluate('hideBars(stage,true)');assert more.is_visible()
   more.click();assert menu.is_hidden();more.click();assert menu.is_visible()
   page.evaluate('hideBars(stage,false)')
   late.focus();page.keyboard.press('Escape');assert menu.is_hidden() and more.evaluate('n=>document.activeElement===n')
   page.evaluate("reveal(document.querySelector('.doomsday-menu'))")
   assert menu.is_visible() and more.get_attribute('aria-expanded')=='true'
   page.get_by_role('button',name='Move stick',exact=True).click();assert menu.is_hidden()
   page.get_by_role('button',name='Fire',exact=True).click();assert page.evaluate('fireCount')==1
   page.evaluate('flow.dispose()')
   assert page.evaluate('dock.parentElement===dockParent'),'external dock was not restored after disposal'
   assert page.get_by_role('button',name='Move stick',exact=True).is_visible()
   assert not errors,errors
   print(f'{width}x{height}: complete secondary header controls, live dock references, handlers, visibility, focus and disposal passed',flush=True)
   page.close()
  browser.close()
finally:server.shutdown()
