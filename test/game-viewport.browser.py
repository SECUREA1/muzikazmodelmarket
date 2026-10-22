"""Native fullscreen and page fallback retain the game, controls and page position."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()

def expanded_geometry(page,viewport):
 result=page.evaluate('''()=>{
  const shell=document.querySelector('.house-explorer-shell'),s=shell.getBoundingClientRect(),stage=shell.querySelector('.house-stage').getBoundingClientRect(),dock=shell.querySelector('.house-control-dock').getBoundingClientRect(),button=shell.querySelector('.game-viewport-toggle'),b=button.getBoundingClientRect(),v=visualViewport;
  const top=v?.offsetTop||0,left=v?.offsetLeft||0,width=v?.width||innerWidth,height=v?.height||innerHeight;
  const controls=[...shell.querySelectorAll('button')].filter(n=>n.getBoundingClientRect().width>0).map(n=>{const r=n.getBoundingClientRect();return {label:n.getAttribute('aria-label'),inside:r.left>=left-.5&&r.right<=left+width+.5&&r.top>=top-.5&&r.bottom<=top+height+.5,hit:(()=>{const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===n||n.contains(hit)})()};});
  return {widthFill:s.width/width,heightFill:s.height/height,left:s.left-left,top:s.top-top,stageDockRemainder:Math.abs(stage.height+dock.height-s.height),stageAboveDock:stage.bottom<=dock.top+.5,toggleSize:[b.width,b.height],controls};
 }''')
 assert result['widthFill']>=.98 and result['heightFill']>=.98,(viewport,result)
 assert abs(result['left'])<=2 and abs(result['top'])<=2,(viewport,result)
 assert result['stageDockRemainder']<=2 and result['stageAboveDock'],(viewport,result)
 assert all(size>=43.5 for size in result['toggleSize']),(viewport,result)
 assert all(control['inside'] and control['hit'] for control in result['controls']),(viewport,result)
 assert page.locator('.house-explorer-shell').evaluate('(shell)=>shell.scrollWidth<=shell.clientWidth+1'),(viewport,'horizontal overflow')

def assert_restored(page,scroll,mode):
 page.wait_for_function('!document.querySelector(".house-explorer-shell").classList.contains("game-viewport-expanded")&&!document.fullscreenElement')
 page.wait_for_function('document.querySelector(".house-explorer-shell").parentElement.id==="game-host"')
 assert page.locator('#fixture-fullscreen').get_attribute('aria-pressed')=='false'
 assert page.evaluate('document.querySelector(".house-explorer-shell").previousElementSibling.id')=='before-shell'
 assert page.evaluate('document.querySelector(".house-explorer-shell").nextElementSibling.id')=='after-shell'
 try:page.wait_for_function('(scroll)=>Math.abs(scrollY-scroll)<=2',arg=scroll)
 except Exception as error:
  raise AssertionError({'mode':mode,'expectedScroll':scroll,'actualScroll':page.evaluate('scrollY'),'url':page.url,'expanded':page.locator('.house-stage').get_attribute('data-viewport-expanded'),'state':page.evaluate('history.state')}) from error
 page.wait_for_function('!history.state?.__muzikazGameViewport')
 assert page.evaluate('JSON.stringify(backgroundState())===JSON.stringify(originalBackground)'),'Background inert/aria-hidden state must restore exactly'
 assert page.evaluate('JSON.stringify(styleState())===JSON.stringify(originalStyles)'),'Body/html inline styles must restore exactly'
 assert page.evaluate('JSON.stringify(history.state)===JSON.stringify(fixtureHistory)'),'Existing history state must survive'
 assert page.evaluate('neutralizations')>=2,(mode,'enter and exit must neutralize controls')

def keyboard_and_dialog(page,mode):
 assert page.locator('#fixture-fullscreen').evaluate('(button)=>document.activeElement===button'),(mode,'Expansion must focus exit control')
 assert page.evaluate('backgroundState().every(node=>node.inert!==null&&node.ariaHidden==="true")'),(mode,'Background content must be inert and hidden')
 assert page.locator('#fixture-modal').get_attribute('inert') is None,'Existing dialog siblings must remain usable'
 page.keyboard.press('Shift+Tab')
 assert page.locator('#fixture-open-dialog').evaluate('(button)=>document.activeElement===button'),(mode,'Shift+Tab must wrap inside the expanded game')
 page.keyboard.press('Tab')
 assert page.locator('#fixture-fullscreen').evaluate('(button)=>document.activeElement===button'),(mode,'Tab must wrap back to the first game control')
 page.locator('#fixture-open-dialog').click();modal=page.get_by_role('dialog',name='Viewport tools dialog',exact=True)
 assert modal.is_visible() and modal.evaluate('(dialog)=>dialog.matches(":modal")')
 assert modal.evaluate('(dialog)=>dialog.contains(document.activeElement)')
 page.get_by_role('button',name='Confirm modal action',exact=True).click();assert page.evaluate('modalActions')==1
 page.get_by_role('button',name='Close viewport dialog',exact=True).click();assert not modal.is_visible()
 assert page.locator('.house-stage').get_attribute('data-viewport-expanded')=='true'
 page.locator('#fixture-open-dialog').click()
 for _ in range(5):
  page.keyboard.press('Tab')
  # Chromium briefly focuses body while wrapping its native dialog sequence.
  # The viewport trap must yield and must not pull focus back into game controls.
  assert modal.evaluate('(dialog)=>dialog.contains(document.activeElement)||document.activeElement===document.body'),(mode,'Viewport must yield the open native dialog keyboard sequence')
 page.keyboard.press('Escape');page.wait_for_function('!document.querySelector("#fixture-modal").open')
 assert page.locator('.house-stage').get_attribute('data-viewport-expanded')=='true',(mode,'Dialog Escape must not close the game viewport')

def history_location_changes(page,mode):
 page.evaluate('scrollTo(0,400)');page.wait_for_timeout(60)
 def enter():
  page.locator('#fixture-fullscreen').scroll_into_view_if_needed();entry_scroll=page.evaluate('scrollY')
  page.locator('#fixture-fullscreen').click();page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
  if mode=='native':page.wait_for_function('document.fullscreenElement===document.querySelector(".house-explorer-shell")')
  return entry_scroll
 for exit_method in ['button','back']:
  scroll=enter();map_id='viewport-map-'+exit_method
  expected=page.evaluate('(id)=>changeFixtureMap(id)',map_id)
  assert page.locator('.house-stage').get_attribute('data-fixture-map')==map_id
  assert page.evaluate('history.state.environment')==map_id
  # A later ordinary URL edit preserves the app state and active viewport lease.
  expected=page.evaluate('''()=>{const url=new URL(location.href);url.searchParams.set('view','updated');replaceFixtureGameLocation(url);return location.href;}''')
  if exit_method=='button':page.locator('#fixture-fullscreen').click()
  else:page.evaluate('history.back()')
  assert_restored(page,scroll,mode)
  assert page.url==expected,(mode,exit_method,'Viewport exit restored a stale map URL',page.url,expected)
  assert page.locator('.house-stage').get_attribute('data-fixture-map')==map_id
  # Forward may revisit the consumed entry, but must neither revive fullscreen
  # nor expose the previous temporary marker or stale map state.
  page.evaluate('history.forward()');page.wait_for_timeout(180)
  assert page.locator('.house-stage').get_attribute('data-viewport-expanded')=='false'
  assert page.evaluate('document.fullscreenElement') is None
  assert page.url==expected,(mode,exit_method,'Forward restored a stale map URL')
  assert page.evaluate('!history.state?.__muzikazGameViewport')
  assert page.evaluate('JSON.stringify(history.state)===JSON.stringify(fixtureHistory)')
 # Two rapid toggles must adopt or await the previous asynchronous Back cleanup.
 scroll=enter();expected=page.evaluate('changeFixtureMap("viewport-map-rapid")')
 page.evaluate('''async()=>{viewportController.exit();await viewportController.enter();}''')
 page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
 page.wait_for_timeout(200)
 assert page.locator('.house-stage').get_attribute('data-viewport-expanded')=='true',(mode,'Pending Back cleanup closed the reentered viewport')
 assert page.url==expected
 page.locator('#fixture-fullscreen').click();assert_restored(page,scroll,mode)
 assert page.url==expected

try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width,height in ([] if os.environ.get('VIEWPORT_HISTORY_ONLY') else [(390,844),(320,568),(844,390),(1280,800)]):
   for mode in ['native','unsupported','rejected']:
    page=browser.new_page(viewport={'width':width,'height':height},has_touch=width<1000);page.set_default_timeout(10000)
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/game-viewport.html?request={mode}');page.wait_for_selector('body[data-ready=true]')
    page.evaluate('scrollTo(0,400)');page.wait_for_timeout(80);scroll=page.evaluate('scrollY');old_parent=page.locator('.house-explorer-shell').evaluate('(shell)=>shell.parentElement.id')
    assert old_parent=='game-host'
    page.locator('#fixture-fullscreen').click()
    page.wait_for_function('document.querySelector(".house-explorer-shell").classList.contains("game-viewport-expanded")')
    if mode=='native':page.wait_for_function('document.fullscreenElement===document.querySelector(".house-explorer-shell")')
    else:assert page.evaluate('document.fullscreenElement') is None
    assert page.locator('.house-explorer-shell').get_attribute('data-viewport-mode')==('native' if mode=='native' else 'page')
    assert page.locator('.house-stage').get_attribute('data-viewport-expanded')=='true'
    assert page.locator('#fixture-fullscreen').get_attribute('aria-pressed')=='true'
    assert page.locator('.house-explorer-shell').evaluate('(shell)=>shell.parentElement===document.body')
    assert page.evaluate('neutralizations')>=1
    expanded_geometry(page,(width,height,mode))
    keyboard_and_dialog(page,mode)
    if mode!='native':
     # A resize while the fixed-page fallback is active must follow the visual viewport.
     resized={'width':height,'height':width};page.set_viewport_size(resized);page.wait_for_timeout(150);expanded_geometry(page,(resized['width'],resized['height'],mode))
     page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
    page.locator('#fixture-fullscreen').click();assert_restored(page,scroll,mode)
    # Escape exits either mode and restores the original page position.
    page.locator('#fixture-fullscreen').click();page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
    if mode=='native':page.wait_for_function('document.fullscreenElement===document.querySelector(".house-explorer-shell")')
    page.keyboard.press('Escape');assert_restored(page,scroll,mode)
    # Back consumes only the viewport entry and keeps the same page loaded.
    original=page.url;page.locator('#fixture-fullscreen').click();page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
    if mode=='native':page.wait_for_function('document.fullscreenElement===document.querySelector(".house-explorer-shell")')
    page.evaluate('history.back()');assert_restored(page,scroll,mode);assert page.url==original
    assert page.evaluate('''async()=>{const {mountGameViewport}=await import('/public/js/game-viewport.js');return mountGameViewport({stage:document.querySelector('.house-stage')})===viewportController}''')
    assert page.locator('.game-viewport-toggle').count()==1
    # Teardown during expansion returns all page elements without navigation.
    page.locator('#fixture-fullscreen').click();page.wait_for_function('document.querySelector(".house-stage").dataset.viewportExpanded==="true"')
    if mode=='native':page.wait_for_function('document.fullscreenElement===document.querySelector(".house-explorer-shell")')
    page.evaluate('viewportController.dispose()')
    page.wait_for_function('!document.fullscreenElement&&!document.querySelector(".house-stage").hasAttribute("data-viewport-expanded")')
    assert page.locator('.house-explorer-shell').evaluate('(shell)=>shell.parentElement.id')=='game-host'
    assert page.locator('#fixture-fullscreen').inner_text()=='Full screen'
    assert page.url==original
    page.wait_for_function('(scroll)=>Math.abs(scrollY-scroll)<=2',arg=scroll)
    assert page.evaluate('!history.state?.__muzikazGameViewport')
    assert page.evaluate('JSON.stringify(history.state)===JSON.stringify(fixtureHistory)')
    assert page.evaluate('JSON.stringify(backgroundState())===JSON.stringify(originalBackground)')
    assert page.evaluate('JSON.stringify(styleState())===JSON.stringify(originalStyles)')
    assert not errors,errors
    page.close()
  for mode in ['native','unsupported','rejected']:
   page=browser.new_page(viewport={'width':390,'height':844},has_touch=True);page.set_default_timeout(10000)
   errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/game-viewport.html?request={mode}');page.wait_for_selector('body[data-ready=true]')
   history_location_changes(page,mode);assert not errors,errors;page.close()
  browser.close()
 if os.environ.get('VIEWPORT_HISTORY_ONLY'):print('Viewport map/history regressions: native fullscreen and both fallback paths preserve changed URL/state through Exit, Back, Forward and immediate reentry.')
 else:print('Game viewport: fullscreen/fallback, controls, dialogs, layout, focus/DOM/scroll restoration and map/history updates including immediate reentry passed.')
finally:server.shutdown()
