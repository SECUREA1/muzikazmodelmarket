"""Premium table limits, exact receipts, saved hands and replay recovery."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/casino-advanced-ui.html')
        page.wait_for_function('window.ready')
        page.locator('[data-wager]').wait_for()
        assert page.locator('[data-bet]').get_attribute('min')=='100'
        assert page.locator('[data-bet]').get_attribute('max')=='2500'
        assert page.locator('[data-bet]').get_attribute('step')=='1'
        assert 'High-Limit Salon' in page.locator('[data-casino-subtitle]').inner_text()
        page.locator('[data-bet]').fill('101')
        page.locator('[data-selection]').select_option('banker')
        page.locator('[data-wager]').click()
        page.locator('.casino-result').wait_for()
        assert 'Returned 196 MZK' in page.locator('.casino-result').inner_text()
        assert 'Net +95 MZK' in page.locator('.casino-result').inner_text()
        assert 'commission withheld: 6 MZK' in page.locator('.casino-result').inner_text()
        assert page.evaluate("requests.at(-1).stationId==='casino-baccarat-vip'")
        assert page.locator('.casino-hand-lane .casino-card').count()==4
        page.locator('.casino-rules summary').click()
        assert '95% profit' in page.locator('.casino-rules').inner_text()
        assert page.locator('.casino-panel').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
        page.evaluate("goStation('casino-threecard-salon')")
        page.locator('[data-wager]').wait_for()
        assert page.locator('[data-bet]').get_attribute('min')=='10'
        assert page.locator('[data-bet]').get_attribute('max')=='500'
        assert 'premier salon' in page.locator('.casino-table-limits').inner_text().lower()
        page.locator('[data-bet]').fill('25')
        assert page.locator('[data-stake-exposure] b').all_inner_texts()==['25 MZK','25 MZK','50 MZK']
        page.locator('[data-wager]').click()
        page.locator('[data-command="play"]').wait_for()
        assert page.locator('.casino-cards').first.locator('.is-back').count()==3
        page.evaluate('reloadInterface()')
        page.locator('[data-command="play"]').wait_for()
        assert page.locator('.casino-cards').first.locator('.is-back').count()==3
        assert 'add 25 MZK' in page.locator('[data-command="play"]').inner_text()
        page.evaluate('loseNextResponse=true')
        page.locator('[data-command="play"]').click()
        page.locator('[data-retry-casino]').wait_for()
        first=page.evaluate('requests.at(-1).requestId')
        page.locator('[data-retry-casino]').click()
        page.locator('.casino-settlement').wait_for()
        assert page.evaluate('requests.at(-1).requestId')==first
        assert page.locator('.casino-settlement dd').all_inner_texts()==['50 MZK','50 MZK','125 MZK']
        assert 'Total staked 50 MZK · Returned 225 MZK' in page.locator('.casino-result').inner_text()
        assert 'Net +175 MZK' in page.locator('.casino-result').inner_text()
        page.locator('[data-wager]').click()
        page.locator('[data-command="fold"]').click()
        assert 'fold' in page.locator('.casino-result').inner_text().lower()
        assert page.locator('.casino-settlement dd').all_inner_texts()==['0 MZK','0 MZK','0 MZK']
        page.evaluate("goStation('casino-blackjack-1')")
        page.locator('[data-wager]').click()
        page.locator('[data-command="double"]').wait_for()
        page.evaluate("goStation('casino-blackjack-2')")
        assert page.locator('[data-round-location]').is_visible()
        assert page.locator('[data-wager]').is_disabled()
        page.evaluate("goStation('casino-blackjack-1')")
        page.locator('[data-command="double"]').click()
        assert 'Total staked 10 MZK · Returned 20 MZK' in page.locator('.casino-result').inner_text()
        assert page.evaluate("requests.every(body=>body.stationId)&&requests.at(-1).operation==='double'")
        for width,height in [(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            assert page.locator('.casino-panel').evaluate('(node)=>node.scrollWidth<=node.clientWidth+1')
        page.evaluate('ui.dispose()')
        assert not errors,errors
        browser.close()
    print('Premium UI limits, baccarat commission, saved hidden hand, exact Play/Fold receipts, retry identity, original-table resume and blackjack double pass.')
finally:
    server.shutdown()
