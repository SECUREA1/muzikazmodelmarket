"""An open map keeps its state while switching between mobile and desktop."""
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
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1280, 'height': 900}, has_touch=True)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.wait_for_selector('body[data-ready=true]')
        page.evaluate('''async () => {
            const {mountDistrictMap}=await import('/public/js/district-map.js');
            const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
            document.body.innerHTML='<style>body{margin:0}.house-stage{position:relative;height:100dvh}#game{width:100%;height:100%}</style><div class="house-stage"><canvas id="game" tabindex="0"></canvas></div>';
            window.keys=[];window.releases=[];window.blocked=()=>gameplayOverlayOpen();
            window.addEventListener('keydown',event=>keys.push({key:event.key,prevented:event.defaultPrevented}));
            document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));
            window.map=mountDistrictMap({stage:document.querySelector('.house-stage'),
                fetchAtlas:()=>new Promise(resolve=>window.resolveAtlas=resolve)});
            map.update({id:'map-lifecycle',name:'Local neighborhood',playableSize:256,
                builderScene:{mapSize:256,objects:[],layoutMeta:{locations:[
                    {id:'garden',name:'Community Garden',x:10,z:20,width:20,depth:20},
                    {id:'station',name:'Station',x:40,z:50,width:20,depth:20}
                ]}}});
        }''')
        opener = page.get_by_role('button', name='Local map and land deeds', exact=True)
        opener.click()
        dialog = page.get_by_role('dialog', name='Local map and land deeds', exact=True)
        close = dialog.get_by_role('button', name='Close', exact=True)
        assert dialog.is_visible() and not page.evaluate('blocked()')
        assert dialog.get_attribute('aria-modal') == 'false'
        close.focus()
        page.keyboard.press('w')
        page.keyboard.press('Space')
        assert dialog.is_visible(), 'Space must not activate the focused Close button.'
        assert page.evaluate('keys.map(item=>item.key)') == ['w', ' ']
        assert page.evaluate('keys.at(-1).prevented'), 'Space must keep its jump meaning.'

        dialog.get_by_role('button', name='Locations', exact=True).click()
        search = dialog.get_by_role('searchbox', name='Search local map directory', exact=True)
        page.evaluate('keys=[]')
        search.press_sequentially('garden')
        assert page.evaluate('keys') == [], 'Map search typing reached gameplay keys.'
        assert dialog.locator('summary').filter(has_text='Community Garden').is_visible()
        assert dialog.locator('summary').filter(has_text='Station').is_hidden()

        for width, height, modal in [(390, 844, True), (844, 390, True),
                                     (1280, 900, False), (320, 568, True),
                                     (1280, 900, False)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_function('''modal=>{
                const dialog=document.querySelector('.district-map-dialog');
                return dialog.open&&dialog.matches(':modal')===modal&&blocked()===modal;
            }''', arg=modal)
            page.wait_for_timeout(80)  # Deliver the native close event from the mode switch.
            assert dialog.is_visible()
            assert dialog.get_attribute('aria-modal') == str(modal).lower()
            assert opener.get_attribute('aria-expanded') == 'true'
            assert search.input_value() == 'garden'
            assert dialog.get_attribute('data-map-section') == 'locations'
            assert 'map-close' not in page.evaluate('releases'), 'Resizing closed the map state.'
            assert page.evaluate('''() => {
                document.querySelector('#game').focus();
                return document.activeElement.id==='game';
            }''') is not modal
            close.focus()
            page.evaluate('keys=[]')
            page.keyboard.press('w')
            assert page.evaluate('keys.map(item=>item.key)') == ([] if modal else ['w'])

        # A directory request begun before the mode switches must still finish.
        page.evaluate("resolveAtlas({locations:[{mapId:'harbor',name:'Harbor'}]})")
        page.wait_for_function("document.querySelector('.local-map-status').textContent.includes('1 connected destinations')")
        dialog.get_by_role('button', name='Destinations', exact=True).click()
        assert dialog.get_by_role('link', name='Enter Harbor', exact=True).is_visible()
        close.focus()
        page.keyboard.press('Enter')
        dialog.wait_for(state='hidden')
        page.wait_for_function("document.querySelector('.district-map-toggle').getAttribute('aria-expanded')==='false'")
        assert page.evaluate('releases.filter(reason=>reason==="map-close").length') == 1
        assert not page.evaluate('blocked()')
        opener.click()
        close.focus()
        page.keyboard.press('Escape')
        dialog.wait_for(state='hidden')
        assert not errors, errors
        browser.close()
    print('Local map: responsive native modality, retained directory state and pending results, isolated search, movement keys, Enter and Escape passed.')
finally:
    server.shutdown()
    server.server_close()
