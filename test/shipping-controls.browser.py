"""Mobile sports HUD, modal input ownership and exact shipping chart actions."""
import functools
import http.server
import pathlib
import threading
from playwright.sync_api import sync_playwright

ROOT=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        for width,height in [(320,568),(390,844),(844,390),(1280,800)]:
            page=browser.new_page(viewport={'width':width,'height':height})
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/shipping-controls.html')
            page.wait_for_function('window.ready')
            hud=page.locator('.shipping-hud')
            primary=hud.locator('[data-shipping-primary]')
            assert hud.is_visible() and page.locator('dialog:modal').count()==0
            assert hud.bounding_box()['height']<height*.45
            assert hud.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            assert primary.bounding_box()['height']>=44
            primary.click()
            page.wait_for_function("commands.at(-1).operation==='board'")
            primary.click()
            dialog=page.get_by_role('dialog',name='Hormuz shipping chart and cargo quests',exact=True)
            assert dialog.is_visible() and dialog.evaluate('(el)=>el.matches(":modal")')
            assert page.evaluate('ui.menuOpen()')
            assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            # Chart selection preserves the exact selected server port ID.
            dialog.locator('[data-shipping-port="fujairah"]').click()
            assert dialog.locator('[data-port]').input_value()=='fujairah'
            assert 'Fujairah' in dialog.locator('[data-selected-port-name]').inner_text()
            assert dialog.locator('[data-shipping-port="fujairah"] .shipping-port-hit').bounding_box()['width']>=44
            dialog.locator('[data-sail]').click()
            page.wait_for_function("routes.at(-1)==='fujairah'")
            assert page.locator('dialog:modal').count()==0
            hud.locator('[data-shipping-chart]').click()
            dialog.locator('[data-shipping-contract="dock-induction"]').click()
            page.wait_for_function("ui.snapshot().phase==='loading'")
            for expected_side in ['port','starboard','port','starboard']:
                primary.click()
                page.wait_for_function('!ui.snapshot().pending')
                assert page.evaluate('commands.at(-1).side')==expected_side
            primary.click()
            page.wait_for_function("commands.at(-1).operation==='secure'")
            primary.click()
            page.wait_for_function("commands.at(-1).operation==='depart'")
            page.evaluate("snapshot.actors.starter.boating.assist='navigate';refresh()")
            assert primary.is_disabled() and 'Passage in progress' in primary.inner_text()
            count=page.evaluate('commands.length')
            page.evaluate('ui.trigger()')
            assert page.evaluate('commands.length')==count
            page.evaluate("snapshot.actors.starter.boating.assist=null;phase('sailing',{loaded:[],checkpointIndex:1})")
            assert 'Dock safely' in primary.inner_text()
            primary.click()
            page.wait_for_function("commands.at(-1).operation==='dock'")
            page.evaluate("phase('delivered')")
            hud.locator('[data-shipping-chart]').click()
            dialog.locator('[data-shipping-trade="parts-metal"]').click()
            page.wait_for_function("commands.at(-1).tradeId==='parts-metal'")
            dialog.locator('.game-fullscreen-close').click()
            # Disabled-world snapshots must never repeatedly release other games' inputs.
            page.evaluate("snapshot.shipping.enabled=false;refresh()")
            releases=page.evaluate('releases')
            page.evaluate('refresh();refresh();refresh()')
            assert page.evaluate('releases')==releases
            assert not hud.is_visible() and not page.evaluate('ui.visible()')
            assert errors==[],errors
            page.close()
        browser.close()
    print('Shipping mobile HUD, cargo phases, exact chart routes, stock trades and input ownership passed at four sizes.')
finally:
    server.shutdown()
