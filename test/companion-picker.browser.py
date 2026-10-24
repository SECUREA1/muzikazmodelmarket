"""A destination picker releases native modality while Backpack keeps it."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.add_style_tag(url='/public/assets/game-menus.css')
            page.evaluate('''async()=>{
              const {fullscreenPanel}=await import('/public/js/fullscreen-panels.js');
              const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
              document.body.innerHTML='<canvas id="game" tabindex="0" style="position:fixed;inset:0;width:100%;height:100%;background:#19332b"></canvas><button id="left" style="position:fixed;left:20px;bottom:24px;width:82px;height:82px">Move</button><button id="right" style="position:fixed;right:20px;bottom:24px;width:82px;height:82px">Look</button>';
              window.gameKeys=[];window.releaseReasons=[];window.panelCloses=0;
              document.addEventListener('muzikaz:release-game-input',event=>releaseReasons.push(event.detail.reason));
              window.addEventListener('keydown',event=>{gameKeys.push(event.key);if(['w','a','s','d',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();});
              const panel=document.createElement('section');panel.id='picker';panel.hidden=true;panel.setAttribute('aria-label','Destination map');panel.innerHTML='<input aria-label="Search destinations"><button id="destination">Destination</button><p style="height:500px">Map content</p>';
              window.panel=panel;window.pickerScreen=fullscreenPanel(panel,{companion:()=>!panel.classList.contains('backpack-panel'),onClose:()=>panelCloses++});
              window.blocked=()=>gameplayOverlayOpen();pickerScreen.open();
            }''')
            dialog = page.get_by_role('dialog', name='Destination map', exact=True)
            assert dialog.is_visible()
            assert not dialog.evaluate('node=>node.matches(":modal")')
            assert dialog.get_attribute('data-gameplay-blocking') == 'false'
            assert not page.evaluate('blocked()||document.documentElement.classList.contains("game-menu-open")')
            for control in ['#left', '#right']:
                assert page.locator(control).evaluate('node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;}'), (width, height, control)
            dialog.get_by_role('button', name='Close Destination map', exact=True).focus()
            page.keyboard.press('w')
            page.keyboard.press('Space')
            page.keyboard.press('ArrowUp')
            assert page.evaluate('gameKeys') == ['w', ' ', 'ArrowUp']
            assert dialog.is_visible(), 'Jump must not activate a focused map close button.'
            page.evaluate('gameKeys=[]')
            page.get_by_label('Search destinations', exact=True).focus()
            page.keyboard.type('wasd')
            assert page.evaluate('gameKeys') == [], 'Typing in destination search must stay local.'
            page.evaluate("panel.classList.add('backpack-panel');pickerScreen.sync()")
            assert dialog.evaluate('node=>node.matches(":modal")')
            assert page.evaluate('blocked()')
            assert page.evaluate('()=>{document.querySelector("#game").focus();return document.activeElement.id!=="game";}')
            page.evaluate("panel.classList.remove('backpack-panel');pickerScreen.sync()")
            page.wait_for_timeout(100)
            assert dialog.is_visible() and not dialog.evaluate('node=>node.matches(":modal")')
            assert page.evaluate('panelCloses') == 0, 'Queued close events during mode switches must not hide the picker.'
            assert page.evaluate('releaseReasons') == ['panel-open', 'panel-mode-change', 'panel-mode-change']
            assert not page.evaluate('blocked()||document.documentElement.classList.contains("game-menu-open")')
            assert page.evaluate('()=>{document.querySelector("#game").focus();return document.activeElement.id==="game";}')
            dialog.get_by_role('button', name='Close Destination map', exact=True).focus()
            page.keyboard.press('Escape')
            dialog.wait_for(state='hidden')
            assert page.evaluate('panelCloses') == 1
            assert page.evaluate('releaseReasons.at(-1)') == 'panel-close'
            assert not errors, errors
            page.close()
        browser.close()
    print('Map picker: nonmodal input, unobstructed touch controls, local search typing, safe Backpack transitions and Escape passed on mobile, landscape and desktop.')
finally:
    server.shutdown()
