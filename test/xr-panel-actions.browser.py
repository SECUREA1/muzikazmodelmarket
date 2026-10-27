"""The immersive action bridge operates original DOM game controls and cleanup."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 900, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/xr-panel-actions.html')
        page.wait_for_function('window.ready')
        state = page.evaluate('snapshot()')
        assert state['active'] and state['title'] == 'Carnival controls'
        assert state['status'] == 'Ready for your turn'
        labels = [item['label'] for item in state['items']]
        assert 'Play round' in labels and 'Increase Bet · 2' in labels and 'Decrease Bet · 2' in labels
        assert '✓ Table: One' in labels and 'Table: Two' in labels
        assert labels.count('Repeat action') == 2
        assert len(set(item['id'] for item in state['items'])) == len(state['items'])
        music_id = next(item['id'] for item in state['items'] if item['label'] == 'Music')
        for forbidden in ['Unavailable round', 'Hidden action', 'Invisible action', 'Decorative action', 'Locked game', 'Rotate preview', 'Hold ignite', 'Hold machine', 'Practice action', 'Market', 'External', 'Script link', 'Download']:
            assert forbidden not in labels, (forbidden, labels)
        assert not any(any(word in label for word in ['Card number', 'Read-only', 'Wallet', 'Password', 'private-value', 'wallet-secret-value', 'Locked bet', 'Locked table', 'Hidden table', 'Nickname']) for label in labels)

        # Each action invokes the original handler rather than a parallel game.
        page.evaluate("window.staleMusic=bridge.snapshot().items.find(item=>item.label==='Music')")
        page.evaluate("invoke('Play round');invoke('Music');invoke('Hard');invoke('Table: Two')")
        page.evaluate('staleMusic.run()')
        assert page.evaluate('calls.play') == 1
        assert page.locator('#music').is_checked() and page.locator('#hard').is_checked()
        assert page.locator('#table').input_value() == 'two'
        assert page.evaluate('calls.input') == 3 and page.evaluate('calls.change') == 3
        assert page.evaluate('snapshot().status') == 'Round started'
        assert page.evaluate("snapshot().items.find(item=>item.label==='✓ Music').id") == music_id
        page.evaluate("invoke('Hold ace of spades')")
        assert page.locator('#hold-card').get_attribute('aria-pressed') == 'true', 'numeric poker data-hold markers remain discrete controls'
        assert '✓ Hold ace of spades' in page.evaluate('snapshot().items.map(item=>item.label)')

        # Number/range fields use native stepping, bounds and input/change events.
        page.evaluate("invoke('Increase Bet · 2')")
        assert page.locator('#bet').input_value() == '3'
        assert 'Increase Bet · 3' not in page.evaluate('snapshot().items.map(item=>item.label)')
        page.evaluate("invoke('Decrease Bet · 3');invoke('Decrease Bet · 2')")
        assert page.locator('#bet').input_value() == '1'
        assert 'Decrease Bet · 1' not in page.evaluate('snapshot().items.map(item=>item.label)')
        page.evaluate("invoke('Increase Volume · 0.5');invoke('Decrease Fine zoom · 1')")
        assert page.locator('#volume').input_value() == '0.6' and page.locator('#fine').input_value() == '0'
        page.evaluate("invoke('Repeat action',0);invoke('Repeat action',1)")
        assert page.evaluate('calls.first===1 && calls.second===1')

        # Closed details stay hidden; their own summary can reveal controls.
        page.evaluate("invoke('Open Game instructions')")
        assert 'Practice action' in page.evaluate('snapshot().items.map(item=>item.label)')
        page.evaluate("invoke('Collapse Game instructions')")
        assert 'Practice action' not in page.evaluate('snapshot().items.map(item=>item.label)')

        # Links are absent unless the caller provides safe same-origin routing.
        nav = page.evaluate('withNavigation().labels')
        assert 'Open Market' in nav and not any('External' in label or 'Script link' in label or 'Download' in label for label in nav)
        page.evaluate("withNavigation().invoke('Open Market')")
        assert page.evaluate('navigateCalls.length') == 1

        # A captured action cannot operate disabled, replaced or covered content.
        page.evaluate("window.stale=bridge.snapshot().items.find(item=>item.label==='Play round');document.querySelector('#play').textContent='Different action';stale.run()")
        assert page.evaluate('calls.play') == 1
        page.evaluate("document.querySelector('#play').textContent='Play round';document.querySelector('#play').disabled=true;stale.run()")
        assert page.evaluate('calls.play') == 1
        page.evaluate("document.querySelector('#play').disabled=false;openNested();stale.run()")
        assert page.evaluate('snapshot().title') == 'Nested confirmation' and page.evaluate('calls.play') == 1
        assert page.evaluate('bridge.close()')
        page.wait_for_function("snapshot().title==='Carnival controls'")
        page.evaluate('openExcluded()')
        assert not page.evaluate('snapshot().active'), 'an excluded immersive panel must not expose controls behind it'
        page.locator('dialog[open]').last.evaluate('(node)=>node.close()')

        # Closing uses the real fullscreen close action and releases held input.
        before = page.evaluate('calls.releases')
        assert page.evaluate('bridge.close()')
        page.wait_for_function('calls.closed===1')
        assert not page.evaluate('snapshot().active')
        assert page.evaluate('calls.releases') > before
        assert not errors, errors
        browser.close()
    print('XR panel bridge: original actions, bounded settings, safe fields/navigation, topmost modal, stale-action guards and close/input cleanup pass.')
finally:
    server.shutdown()
