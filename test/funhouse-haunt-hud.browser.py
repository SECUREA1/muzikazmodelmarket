"""Real page CSS keeps concurrent funhouse quests above the mobile center view."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        base = f'http://127.0.0.1:{server.server_port}'
        page.goto(base + '/test/fixtures/clown-funhouse-ui.html')
        page.wait_for_function('window.ready')
        # The full game's global button/paragraph rules are necessary to catch
        # hidden controls reappearing and expanding these overlay cards.
        for url in ['/styles.css', '/public/assets/game-control-dock.css', '/public/assets/game-menus.css', '/public/assets/game-display-flow.css']:
            page.add_style_tag(url=base + url)
        page.evaluate("""document.querySelector('main').className='house-stage';
          document.querySelector('main').style.cssText='position:relative;width:370px;height:630px;min-height:630px;max-height:630px;margin:0 10px';
          position={x:20,y:.02,z:-16};
          window.hauntState={id:'watch',status:'active',startedAt:fixtureNow,endsAt:fixtureNow+180000,wardIndex:0,sealed:[],score:0};
          window.trailState={id:'trail',status:'active',startedAt:fixtureNow,endsAt:fixtureNow+600000,clueIndex:0,found:[],score:0};
          publish(1,{haunt:hauntState});ui.update();
          window.stagePointerDowns=0;document.querySelector('main').addEventListener('pointerdown',()=>stagePointerDowns++);
        """)
        hud = page.locator('.funhouse-haunt-hud')
        hud.locator('[data-funhouse-haunt-toggle]').click()
        assert hud.bounding_box()['height'] < 220
        assert hud.locator('[data-funhouse-haunt-replay]').is_hidden()
        assert hud.locator('[data-funhouse-haunt-dismiss]').is_hidden()
        for selector in ['[data-funhouse-haunt-toggle]', '[data-funhouse-haunt-seal]', '[data-funhouse-haunt-stop]']:
            box = hud.locator(selector).bounding_box()
            assert box['height'] >= 44
            assert page.evaluate('(point)=>!!document.elementFromPoint(point.x,point.y)?.closest(point.selector)', {'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2, 'selector': selector})
        assert page.evaluate('!document.elementFromPoint(195,315)?.closest(".funhouse-quest-stack")')

        # Both optional quests may run at once. Native scrolling keeps even
        # expanded hints and Trail Stop reachable without covering the center.
        page.evaluate('publish(2,{haunt:hauntState,adventure:trailState});ui.update()')
        stack = page.locator('.funhouse-quest-stack')
        assert stack.evaluate('(node)=>node.scrollHeight>node.clientHeight')
        assert page.evaluate('!document.elementFromPoint(195,315)?.closest(".funhouse-quest-stack")')
        page.locator('[data-funhouse-adventure-toggle]').click()
        trail_stop = page.locator('[data-funhouse-adventure-stop]')
        trail_stop.scroll_into_view_if_needed()
        box = trail_stop.bounding_box()
        assert box['height'] >= 44
        assert page.evaluate('(point)=>!!document.elementFromPoint(point.x,point.y)?.closest("[data-funhouse-adventure-stop]")', {'x': box['x'] + box['width'] / 2, 'y': box['y'] + box['height'] / 2})
        assert page.evaluate('!document.elementFromPoint(195,315)?.closest(".funhouse-quest-stack")')
        trail_stop.click()
        page.wait_for_function('pending.length===1')
        assert page.evaluate("commands.at(-1).action==='funhouse-adventure' && commands.at(-1).operation==='stop'")
        assert page.evaluate('stagePointerDowns') == 0, 'quest clicks leaked into the game camera'
        page.evaluate("resolveNext(3,{haunt:hauntState,adventure:{...trailState,status:'cancelled'}})")
        page.wait_for_function('pending.length===0')
        assert page.locator('[data-funhouse-adventure-inspect]').is_hidden()
        assert not errors, errors
        print('Mobile full-CSS haunted HUD: compact hints, hidden controls, 44px targets, concurrent quest scrolling, reachable Trail Stop and clear center pass.')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
