"""Venue startup controls share flow layout, overflow and score-only settings."""
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
        for width in [320, 390, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 844}, has_touch=width < 760)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/clown-funhouse-ui.html')
            page.wait_for_function('window.ready')
            page.evaluate('''async()=>{
                const {mountGameDisplayFlow,setGameActionBarsHidden}=await import('/public/js/game-display-flow.js');
                const {mountCasinoUI}=await import('/public/js/casino-ui.js');
                const {CASINO_STATIONS}=await import('/public/js/casino-config.js');
                const stage=document.querySelector('main');stage.className='house-stage';
                const shell=document.createElement('section');shell.className='house-explorer-shell';stage.before(shell);shell.append(stage);
                const style=document.createElement('style');style.textContent='html,body{margin:0;width:100%;height:100%;overflow:hidden}.house-explorer-shell{position:fixed;inset:0}.house-stage{height:100%;width:100%;overflow:hidden;box-sizing:border-box}';document.head.append(style);
                for(const name of ['game-camera-toggle','map-quest-launcher','district-map-toggle','factory-toggle','prison-toggle','factory-testing-toggle','factory-logistics-toggle']){const button=document.createElement('button');button.className=name;button.textContent=name;button.setAttribute('aria-label',name);stage.append(button);}
                window.casino=mountCasinoUI({stage,getEnvironment:()=>environment,getPosition:()=>position,request:async()=>({balance:1000,games:[],vendors:[],activeRounds:{},history:[]})});
                window.flow=mountGameDisplayFlow(stage);window.setBarsHidden=value=>setGameActionBarsHidden(stage,value);
                window.casinoStation=CASINO_STATIONS.find(station=>station.kind==='host');
                setup('welcome');publish(1,{stamps:['funhouse-water-gallery','funhouse-clown-car']});
                ui.update();casino.update();
            }''')
            page.wait_for_function("document.querySelector('.funhouse-audio-toggle').parentElement.classList.contains('game-view-overflow')")
            more = page.get_by_role('button', name='More view controls', exact=True)
            audio = page.locator('.funhouse-audio-toggle')
            funhouse = page.locator('.funhouse-use')
            passport = page.get_by_label('Funhouse attraction passport', exact=True)
            assert funhouse.is_visible()
            assert funhouse.evaluate("node=>node.parentElement.classList.contains('game-display-flow-actions')")
            assert funhouse.get_attribute('aria-haspopup') == 'dialog'
            assert funhouse.get_attribute('aria-expanded') == 'false'
            assert passport.locator('small').inner_text() == '2/6'
            assert all(stamp.is_hidden() for stamp in passport.locator('.funhouse-stamp').all()), 'Passport starts as a compact live count.'
            toolbar_box = page.locator('.game-display-flow-views').bounding_box()
            passport_box = passport.bounding_box()
            assert passport_box['y'] >= toolbar_box['y'] + toolbar_box['height'], (width, toolbar_box, passport_box)
            assert more.is_visible() and audio.is_hidden(), 'Audio must stay under existing More even on desktop.'
            assert page.locator('.game-view-overflow').get_attribute('hidden') is not None
            for button in page.locator('.house-stage button:visible').all():
                box = button.bounding_box()
                assert box and box['width'] >= 44 and box['height'] >= 44, (width, button.get_attribute('class'), box)
                assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1 and box['y'] >= 0 and box['y'] + box['height'] <= 845, (width, box)
            more.click()
            assert audio.is_visible()
            audio.click()
            audio_panel = page.get_by_label('Clown voices, sounds and music', exact=True)
            assert audio_panel.is_visible(), 'Opening the sound booth must not leave it inside a hidden overflow ancestor.'
            assert page.locator('.game-view-overflow').is_hidden()
            assert audio.get_attribute('aria-expanded') == 'true'
            assert audio_panel.locator('[data-funhouse-audio-mute=voice]').is_visible()
            assert page.evaluate('document.activeElement.hasAttribute("data-funhouse-audio-close")')
            page.keyboard.press('Escape')
            assert audio_panel.is_hidden()
            assert more.evaluate('node=>document.activeElement===node'), 'Escape returns focus to the existing More control.'
            more.click();audio.click()
            audio_panel.get_by_role('button', name='Close funhouse sound settings', exact=True).click()
            assert audio_panel.is_hidden()
            assert more.evaluate('node=>document.activeElement===node')
            # Individual live stamps remain available in the existing attraction dialog.
            funhouse.click()
            page.locator('.funhouse-dialog[open]').wait_for()
            assert page.locator('.funhouse-dialog .funhouse-passport .funhouse-stamp').count() == 6
            assert page.locator('.funhouse-dialog .funhouse-passport .funhouse-stamp.is-stamped').count() == 2
            assert page.locator('.funhouse-dialog .funhouse-passport .funhouse-stamp').first.get_attribute('aria-label')
            page.get_by_role('button', name='Back to the midway', exact=True).click()
            page.evaluate("publish(2,{stamps:['funhouse-water-gallery','funhouse-clown-car'],ride:{id:'ride-1',kind:'car',stationId:'funhouse-clown-car',status:'active',startedAt:90000,endsAt:120000,hits:3,score:30}});ui.update()")
            live_score = page.locator('[data-funhouse-experience-score]')
            assert live_score.is_visible() and live_score.inner_text() == '30'
            buttons_before = page.locator('.house-stage button').count()
            page.evaluate('setBarsHidden(true)')
            assert more.is_hidden() and audio.is_hidden() and funhouse.is_hidden()
            assert passport.is_visible() and live_score.is_visible()
            assert page.locator('[data-funhouse-hud-toggle]').is_hidden()
            assert page.locator('[data-funhouse-experience-actions]').is_hidden()
            page.evaluate("publish(3,{adventure:{id:'trail-1',status:'active',score:25,found:[],clueIndex:1,endsAt:120000},stamps:['funhouse-water-gallery','funhouse-clown-car','funhouse-spinner'],ride:{id:'ride-1',kind:'car',stationId:'funhouse-clown-car',status:'active',startedAt:90000,endsAt:120000,hits:4,score:40}});ui.update()")
            assert passport.locator('small').inner_text() == '3/6'
            assert live_score.inner_text() == '40' and live_score.is_visible()
            assert page.locator('[data-funhouse-adventure-progress]').is_visible()
            assert '25 points' in page.locator('[data-funhouse-adventure-progress]').inner_text()
            assert page.locator('[data-funhouse-adventure-inspect]').is_hidden()
            page.evaluate('setBarsHidden(false)')
            page.wait_for_function("(()=>{const row=document.querySelector('.game-display-flow-views');return row.scrollWidth<=row.clientWidth+1})")
            assert more.is_visible() and audio.is_hidden()
            assert page.locator('.house-stage button').count() == buttons_before, 'Hide/restore must reuse the existing controls.'
            more.click();assert audio.is_visible()
            page.locator('.game-camera-toggle').click()
            # The casino uses the same compact prompt and inherits hidden action bars.
            page.evaluate("ui.reset();environment={id:'muzikaz-casino'};position={...casinoStation.position};ui.update();casino.update()")
            casino = page.locator('.casino-use')
            assert casino.is_visible() and funhouse.is_hidden() and passport.is_hidden()
            assert casino.evaluate("node=>node.parentElement.classList.contains('game-display-flow-actions')")
            assert casino.locator('.game-nearby-prompt__copy strong').inner_text() == 'Use Casino Welcome Host'
            assert casino.locator('.game-nearby-prompt__copy small').inner_text() == 'Starlight Grand'
            box = casino.bounding_box()
            assert box and box['height'] >= 44 and box['width'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
            page.evaluate('setBarsHidden(true)');assert casino.is_hidden()
            page.evaluate('setBarsHidden(false)');assert casino.is_visible()
            casino.click()
            page.locator('.casino-dialog[open]').wait_for()
            assert page.locator('.casino-panel').is_visible()
            page.get_by_role('button', name='Return to walking', exact=True).click()
            page.evaluate('casino.update()')
            assert casino.is_visible()
            page.evaluate('ui.dispose();casino.dispose();flow.dispose()')
            assert not errors, (width, errors)
            page.close()
        browser.close()
    print('Venue controls passed at 320, 390 and 1280px: shared prompts, More-only audio, compact live passport, accessible stamps, attraction scores and hide/restore.')
finally:
    server.shutdown()
