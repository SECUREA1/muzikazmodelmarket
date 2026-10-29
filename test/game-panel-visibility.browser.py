"""Local dashboard Hide/Show keeps snapshots, scores and gameplay input intact."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/test/fixtures/shipping-controls.html'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width in [320, 390, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 844}, has_touch=width < 760)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(url)
            page.wait_for_function('window.ready')
            hud = page.locator('.shipping-hud')
            toggle = hud.locator('.game-panel-visibility > button')
            toggle.wait_for(state='visible')
            page.wait_for_function("getComputedStyle(document.querySelector('.game-panel-visibility>button')).minHeight==='44px'")
            hud.locator('[data-shipping-primary]').click()
            page.wait_for_function("snapshot.players.self.vehicleId==='starter'")
            page.evaluate("liveFleet();snapshot.players.self.shipping.message='Boarded Gulf feeder. Choose a freight manifest.';refresh();window.panelClicks=0;document.querySelector('.shipping-hud').addEventListener('click',()=>panelClicks++);")
            expanded_height = hud.bounding_box()['height']
            releases = page.evaluate('releases')
            commands = page.evaluate('commands.length')
            assert toggle.get_attribute('aria-expanded') == 'true'
            assert toggle.get_attribute('aria-controls') == hud.get_attribute('id')
            if width < 760:
                toggle.tap()
            else:
                toggle.focus()
                page.keyboard.press('Enter')
            assert toggle.inner_text() == 'Show' and toggle.get_attribute('aria-expanded') == 'false'
            assert hud.bounding_box()['height'] <= 70 < expanded_height
            assert hud.evaluate('node=>node.scrollWidth<=node.clientWidth')
            for selector in ['.shipping-readout', '.shipping-bridge-readout', '[data-shipping-live-summary]', '[data-objective]', '[data-status]', '.sports-action-bar']:
                assert hud.locator(selector).is_hidden(), (width, selector)
            assert page.evaluate('releases') == releases + 1
            assert page.evaluate('commands.length') == commands and page.evaluate('panelClicks') == 0
            page.evaluate("snapshot.actors.starter.boating.speed=3;snapshot.players.self.shipping.message='Cargo status changed';refresh();refresh();")
            assert toggle.inner_text() == 'Show' and hud.bounding_box()['height'] <= 70
            # A new load restores the local dashboard preference independently of snapshots.
            page.reload()
            page.wait_for_function('window.ready')
            toggle.wait_for(state='visible')
            assert toggle.inner_text() == 'Show'
            releases = page.evaluate('releases')
            toggle.click()
            assert toggle.inner_text() == 'Hide' and toggle.get_attribute('aria-expanded') == 'true'
            assert hud.locator('.shipping-readout').is_visible()
            assert hud.locator('[data-shipping-primary]').is_visible()
            assert page.evaluate('releases') == releases + 1
            page.evaluate('''async()=>{const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');window.shippingFlow=mountGameDisplayFlow(document.querySelector('.house-stage'));}''')
            page.wait_for_function("document.querySelector('.game-display-flow>.shipping-hud')!==null")
            assert hud.locator('.game-panel-visibility').count() == 1, 'Flow and sports mounting must reuse one panel control.'
            assert not errors, (width, errors)
            page.close()

        # Shared flowing dashboards receive the same in-panel control as they arrive.
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url)
        page.wait_for_function('window.ready')
        page.evaluate('''async()=>{
            ui.dispose();
            const {mountGameDisplayFlow,setGameActionBarsHidden}=await import('/public/js/game-display-flow.js');
            window.flow=mountGameDisplayFlow(document.querySelector('.house-stage'));
            window.setBars=value=>setGameActionBarsHidden(document.querySelector('.house-stage'),value);
            const style=document.createElement('style');style.textContent='.test-dashboard{padding:9px;border:1px solid #789;background:#123;color:white;min-width:0;box-sizing:border-box}.test-dashboard [data-test-detail]{height:80px}.test-dashboard [hidden]{display:none!important}';document.head.append(style);
        }''')
        kinds = ['shipping-hud', 'fishing-hud', 'road-vehicle-controls', 'harbor-helm-controls', 'airport-flight-controls', 'construction-controls', 'owned-placement-controls', 'basketball-hud', 'firing-range-hud', 'hockey-sports-bar', 'funhouse-experience-hud', 'funhouse-adventure-hud']
        for kind in kinds:
            page.evaluate('''kind=>{
                const panel=document.createElement('section');panel.className=kind+' test-dashboard';panel.hidden=true;
                let score='';
                if(kind==='basketball-hud'||kind==='hockey-sports-bar')score='<div class="sports-action-bar"><div class="sports-action-header"><div class="'+(kind==='basketball-hud'?'basketball-score-strip':'scoreboard')+'" data-test-score>HOME 12 · AWAY 9</div><button>Existing action</button></div><div class="sports-action-tools"><button>Play</button></div></div>';
                if(kind==='funhouse-experience-hud')score='<div class="funhouse-experience-metrics" data-test-score>Score 30 · Best 50</div>';
                if(kind==='funhouse-adventure-hud')score='<div data-funhouse-adventure-details><p data-funhouse-adventure-hint>Find the clue</p><p data-funhouse-adventure-progress data-test-score>2 discoveries · 25 points</p><div><button>Inspect</button></div></div>';
                panel.innerHTML='<div data-test-detail>Live dashboard details</div><p data-runtime-hidden hidden>Unavailable action</p>'+score;
                window.syntheticClicks=0;panel.addEventListener('click',()=>syntheticClicks++);window.syntheticPanel=panel;document.querySelector('.house-stage').append(panel);
            }''', kind)
            panel = page.locator('.test-dashboard')
            page.wait_for_function("syntheticPanel.classList.contains('game-panel')")
            page.evaluate('syntheticPanel.hidden=false')
            toggle = panel.locator('.game-panel-visibility>button')
            assert toggle.is_visible(), kind
            assert panel.locator('.game-panel-visibility').count() == 1
            toggle.click()
            assert panel.locator('[data-test-detail]').is_hidden(), kind
            assert panel.locator('[data-runtime-hidden]').is_hidden()
            assert panel.locator('[data-runtime-hidden]').evaluate('node=>node.hidden')
            assert page.evaluate('syntheticClicks') == 0, 'Hide must not reach delegated placement/world handlers.'
            if panel.locator('[data-test-score]').count():
                assert panel.locator('[data-test-score]').is_visible(), kind
                page.evaluate("syntheticPanel.querySelector('[data-test-score]').textContent='Score updated while hidden'")
                assert panel.locator('[data-test-score]').inner_text() == 'Score updated while hidden'
            page.evaluate('setBars(true)')
            assert toggle.is_hidden(), (kind, 'Global score-only mode must not reveal new local controls.')
            page.evaluate('setBars(false)')
            assert toggle.is_visible() and toggle.inner_text() == 'Show'
            page.evaluate('syntheticPanel.hidden=true')
            assert toggle.is_hidden(), 'Runtime visibility still owns whether the panel is available.'
            page.evaluate('syntheticPanel.hidden=false')
            assert toggle.inner_text() == 'Show'
            toggle.click()
            assert panel.locator('[data-test-detail]').is_visible()
            assert panel.locator('[data-runtime-hidden]').is_hidden()
            page.evaluate('syntheticPanel.remove()')
        page.evaluate('flow.dispose()')
        assert not errors, errors
        page.close()

        # Real construction controls keep their compact grid/header in both
        # portrait and landscape; hiding removes the fixed grid rows as well.
        for width, height in [(320, 568), (844, 390)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=True)
            page.goto(url.replace('shipping-controls.html', 'construction-dashboard.html'))
            page.wait_for_selector('body[data-ready=true]')
            page.evaluate("setMachine('tower-crane','crane')")
            panel = page.locator('.construction-controls')
            toggle = panel.locator('.game-panel-visibility>button')
            toggle.wait_for(state='visible')
            assert panel.locator('.construction-header>.game-panel-visibility').count() == 1
            toggle.tap()
            assert toggle.inner_text() == 'Show'
            assert panel.bounding_box()['height'] <= 70
            assert panel.locator('.construction-header').is_hidden()
            toggle.tap()
            assert panel.locator('.construction-header>.game-panel-visibility').count() == 1
            assert panel.bounding_box()['height'] <= (150 if height < 500 else 250)
            assert panel.evaluate('node=>node.scrollWidth<=node.clientWidth+1')
            page.close()

        # Private/restricted storage must leave the Hide/Show interaction usable.
        page = browser.new_page(viewport={'width': 320, 'height': 568})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.add_init_script("Storage.prototype.getItem=Storage.prototype.setItem=function(){throw new DOMException('Storage disabled','SecurityError')}")
        page.goto(url)
        page.wait_for_function('window.ready')
        toggle = page.locator('.shipping-hud .game-panel-visibility>button')
        toggle.wait_for(state='visible')
        toggle.click()
        assert toggle.inner_text() == 'Show'
        toggle.click()
        assert toggle.inner_text() == 'Hide'
        assert not errors, errors
        page.close()
        browser.close()
    print('Dashboard Hide/Show passed: compact shipping at 320/390/1280px, persistent snapshots, input release, all panel kinds, live scores, global visibility and restricted storage.')
finally:
    server.shutdown()
