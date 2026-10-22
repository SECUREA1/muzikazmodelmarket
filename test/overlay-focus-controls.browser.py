"""Corner controls return keyboard movement, jump and boarding after closing."""
import functools
import http.server
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 800, 'height': 720})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.evaluate('''async () => {
            document.body.innerHTML='<main class="house-stage" style="position:relative;width:800px;height:600px"><canvas tabindex="0"></canvas></main>';
            const stage=document.querySelector('main');
            const {mountWorldResidentUI}=await import('/public/js/world-resident-ui.js');
            const {mountLiveLocalMap}=await import('/public/js/local-live-map.js');
            const {mountTransportActivity}=await import('/public/js/transport-activity.js');
            const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
            const THREE=await import('/public/vendor/three/three.module.min.js');
            const snapshot={serverTime:100000,players:{me:{position:{x:0,y:0,z:0}}},actors:{r:{id:'r',resident:{name:'Test',role:'Guide'},position:{x:0,y:0,z:0}}}};
            const world={id:'muzikaz-airport',airport:{enabled:true},builderScene:{mapSize:256,objects:[]}};
            const command=async()=>({});
            const residents=mountWorldResidentUI(stage,command);residents.update(snapshot,'me',world.id);
            const radio=mountTransportActivity({stage,command,THREE,scene:new THREE.Scene(),airportRadio:{trafficAudio(){},receiveTraffic(){}}});radio.update(snapshot,'me',world);
            window.mapSelections=0;const mini=mountLiveLocalMap({stage,command,open(){mapSelections++;}});mini.update(world);
            mountGameDisplayFlow(stage);
            window.gameKeys=[];
            // The real game's window handler prevents Space from activating a
            // focused HUD button while jumping. Exercise that browser default.
            window.addEventListener('keydown',event=>{gameKeys.push(event.key);if(['w',' ','f'].includes(event.key))event.preventDefault();});
        }''')

        def gameplay_keys():
            page.keyboard.press('w')
            page.keyboard.press('Space')
            page.keyboard.press('f')
            assert page.evaluate('gameKeys.splice(0)') == ['w', ' ', 'f']

        page.locator('canvas').focus()
        gameplay_keys()
        for toggle_label, close_label, panel in [
            ('Residents, conversations and daily objectives', 'Close resident conversations', '.world-resident-panel'),
            ('Crew radio and vehicle quests', 'Close crew radio', '.transport-radio-panel'),
        ]:
            toggle=page.get_by_role('button',name=toggle_label,exact=True)
            toggle.click()
            page.keyboard.press('w')
            assert page.evaluate('gameKeys.splice(0)') == [], 'Open panels retain keyboard input.'
            page.get_by_role('button',name=close_label,exact=True).click()
            assert toggle.evaluate('(node)=>node===document.activeElement')
            gameplay_keys()
            assert page.locator(panel).is_hidden(), 'Jump must not reopen the closed panel.'
            assert toggle.get_attribute('aria-expanded') == 'false'

        page.get_by_role('button',name='Expand local map',exact=True).click()
        pin=page.locator('.live-local-map svg [role="button"]').first
        pin.focus()
        page.keyboard.press('w')
        page.keyboard.press('f')
        assert page.evaluate('gameKeys.splice(0)') == ['w', 'f'], 'A nonmodal map pin must not trap gameplay.'
        page.keyboard.press('Enter')
        page.keyboard.press('Space')
        assert page.evaluate('mapSelections') == 2
        assert page.evaluate('gameKeys.splice(0)') == [], 'Pins keep their activation keys.'
        page.get_by_role('button',name='Collapse local map',exact=True).click()
        gameplay_keys()
        assert page.get_by_role('button',name='Expand local map',exact=True).get_attribute('aria-expanded') == 'false'

        page.evaluate('''async()=>{
            const {mountSkiResortControls}=await import('/public/js/ski-resort-ui.js');
            const ski=mountSkiResortControls(document.querySelector('main'),async()=>({}));
            ski.update({players:{me:{position:{x:0,y:0,z:0}}}},'me',{id:'pixel-peaks',game:'ski'});
        }''')
        ski_toggle=page.get_by_role('button',name='Open ski race menu',exact=True)
        ski_toggle.click()
        page.get_by_role('button',name='Close ski race panel',exact=True).focus()
        page.keyboard.press('w')
        assert page.evaluate('gameKeys.splice(0)') == []
        page.keyboard.press('Escape')
        assert ski_toggle.evaluate('(node)=>node===document.activeElement')
        gameplay_keys()
        assert page.locator('[data-ski-menu-body]').is_hidden()
        assert not errors, errors
        browser.close()
    print('Closed resident, radio, mini-map and ski controls pass movement, jump and boarding keys; open panels keep keyboard input.')
finally:
    server.shutdown()
    server.server_close()
