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
  for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=True);page.set_default_timeout(6000)
   page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
   page.wait_for_selector('body[data-ready=true]')
   page.add_style_tag(url=f'http://127.0.0.1:{server.server_port}/public/assets/game-menus.css')
   page.evaluate("""async()=>{const {mountPieMenu}=await import('/public/js/pie-menu.js');const dialog=document.createElement('dialog');dialog.className='game-fullscreen-dialog tools-pouch-screen';dialog.innerHTML='<section id="rad-tox-tools" class="game-fullscreen-content"><div class="rad-tox-tools__content"></div></section>';document.body.append(dialog);const container=dialog.querySelector('.rad-tox-tools__content');window.pieHits=[];for(let i=0;i<9;i++){const b=document.createElement('button');b.className='rad-tool-choice';b.dataset.item=i;b.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><span>Tool '+i+'</span><small>Description</small>';b.onclick=()=>pieHits.push(i);container.append(b);}window.pieMenu=mountPieMenu({container,selector:':scope > button',label:'Tools pouch',preview:true});dialog.showModal();window.pieDialog=dialog;}""")
   page.wait_for_selector('.tools-pouch-screen .game-pie-choice[data-pie-hidden=false]')
   def check():
    page.locator('.tools-pouch-screen .game-pie-wheel').scroll_into_view_if_needed()
    buttons=page.locator('.tools-pouch-screen .game-pie-choice[data-pie-hidden=false]');boxes=[]
    for button in buttons.all():
     box=button.bounding_box();boxes.append(box)
     assert button.locator('small').evaluate('(el)=>getComputedStyle(el).display')=='none'
     assert box['width']>=44 and box['height']>=44
     assert box['x']>=0 and box['x']+box['width']<=width
     assert button.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).closest("button")===el}')
    for i,a in enumerate(boxes):
     for b in boxes[i+1:]:assert a['x']+a['width']<=b['x'] or b['x']+b['width']<=a['x'] or a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y']
   check()
   preview=page.locator('.tools-pouch-screen .game-pie-preview')
   assert preview.is_visible()
   assert preview.locator('h4').inner_text()=='Tool 0'
   assert page.evaluate("""()=>{const art=document.querySelector('.tools-pouch-screen .game-pie-preview-art');const original=art.firstChild;for(let i=0;i<100;i++)pieMenu.buttons[0].dispatchEvent(new PointerEvent('pointermove',{bubbles:true}));return art.firstChild===original;}"""), 'Pointer movement over the same tool must reuse its preview'
   page.evaluate("pieMenu.buttons[0].dataset.pieDescription='Updated tool description'")
   page.wait_for_function("document.querySelector('.tools-pouch-screen .game-pie-preview p').textContent==='Updated tool description'")
   assert page.locator('.tools-pouch-screen .game-pie-sector').count()==6
   wheel=page.locator('.tools-pouch-screen .game-pie-wheel').bounding_box()
   detail=preview.bounding_box()
   if width>=680:assert detail['x']>=wheel['x']+wheel['width']
   else:assert detail['y']>=wheel['y']+wheel['height']
   # The edge of a pie sector activates the original button, beyond its label hitbox.
   page.mouse.click(wheel['x']+wheel['width']/2,wheel['y']+wheel['height']*.03)
   assert page.evaluate('pieHits')==[0]
   page.evaluate('pieHits=[];pieMenu.buttons[0].disabled=true')
   page.mouse.click(wheel['x']+wheel['width']/2,wheel['y']+wheel['height']*.03)
   assert page.evaluate('pieHits')==[]
   assert preview.locator('button').is_disabled()
   page.evaluate('pieMenu.buttons[0].disabled=false')
   # Preview actions retain capture-phase ownership and purchase guards.
   page.evaluate('''()=>{window.pieGuard=e=>{if(e.target.closest('[data-item="0"]')){e.preventDefault();e.stopImmediatePropagation();}};document.addEventListener('click',pieGuard,true);}''')
   preview.locator('button').click()
   assert page.evaluate('pieHits')==[]
   page.evaluate("document.removeEventListener('click',pieGuard,true)")
   preview.locator('button').click()
   assert page.evaluate('pieHits')==[0]
   page.evaluate('pieHits=[]')
   if width==390:page.screenshot(path='/tmp/tools-pie-menu.png')
   page.locator('.tools-pouch-screen [data-item="0"]').tap();assert page.evaluate('pieHits')==[0]
   page.get_by_role('button',name='Next Tools pouch page',exact=True).tap();check();page.locator('.tools-pouch-screen [data-item="8"]').tap();assert page.evaluate('pieHits')==[0,8]
   page.locator('.tools-pouch-screen [data-item="8"]').focus();page.keyboard.press('ArrowRight');assert page.evaluate('document.activeElement.dataset.item')=='0'
   # Removed inventory entries cannot leave empty stale pages or stale sectors.
   page.evaluate('''()=>{for(const button of pieMenu.buttons.slice(1))button.hidden=true;pieMenu.refresh();}''')
   assert page.locator('.tools-pouch-screen .game-pie-choice[data-pie-hidden=false]').count()==1
   assert page.locator('.tools-pouch-screen .game-pie-sector').count()==1
   assert not page.locator('.tools-pouch-screen .game-pie-navigation').is_visible()
   page.evaluate('''()=>{for(const button of pieMenu.buttons)button.hidden=false;pieMenu.refresh();}''')
   page.evaluate('pieDialog.close()')
   page.locator('.basketball-hud .sports-action-tools button[aria-label="Open action popup"]').tap()
   popup=page.get_by_role('dialog',name='Basketball quick actions popup',exact=True);assert popup.is_visible()
   assert popup.locator('.game-pie-choice').count()==6
   popup.locator('[data-trigger-mode="shoot"]').tap();assert not popup.is_visible()
   page.evaluate('pieDialog.showModal()')
   page.locator('.tools-pouch-screen .game-pie-choice[data-pie-hidden=false]').first.scroll_into_view_if_needed()
   check()
   page.close()
  browser.close()
 print('Pie sectors and previews fit portrait, landscape and desktop; original actions, ownership guards, disabled states, live paging, keyboard and sports popups work.')
finally:server.shutdown()
