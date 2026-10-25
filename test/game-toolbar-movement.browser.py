"""Fresh keyboard movement survives native toolbar and menu focus changes."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import argparse
import json
import math
import os

parser = argparse.ArgumentParser()
parser.add_argument('--world', choices=['all', 'hockey', 'arcade'], default='all')
parser.add_argument('--raster-scale', type=float, default=1)
args = parser.parse_args()
os.chdir(Path(__file__).resolve().parents[1])
worlds = json.loads(Path('public/models/environments/environments.json').read_text())
for world in worlds:
    if world['id'] == 'neon-junction':
        world['arcade'] = {**world.get('arcade', {}), 'enabled': ['shooting'], 'roundSeconds': 120}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                                    args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        errors = []

        def new_page():
            page = browser.new_page(viewport={'width': 800, 'height': 600}, device_scale_factor=args.raster_scale, reduced_motion='reduce')
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**', lambda route: route.abort())
            page.route('**/api/environments', lambda route: route.fulfill(json=worlds))
            return page

        if args.world != 'arcade':
            page = new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/hockey.html?mode=solo')
            page.wait_for_function('window.MuzikazHockey?.snapshot().ready', timeout=60000)
            page.get_by_role('button', name='Close challenges', exact=True).evaluate('(button)=>button.click()')
            page.locator('#hockey-ai-fill').uncheck()
            page.locator('#start').click()
            page.wait_for_function("MuzikazHockey.snapshot().phase==='playing'", timeout=30000)
            for label in ['Game settings', 'Scores and rules', 'Match and players']:
                page.get_by_role('button', name=label, exact=True).focus()
                page.keyboard.press('Enter')
                panel = page.locator('dialog[open]')
                assert panel.count() == 1
                panel.get_by_role('button', name='Close ×', exact=True).focus()
                page.keyboard.press('Enter')
                # Native dialog.close() restores its toolbar opener's focus.
                initial = page.evaluate('MuzikazHockey.snapshot().player')
                page.keyboard.down('w')
                try:
                    page.wait_for_function('(start)=>{const p=MuzikazHockey.snapshot().player;return Math.hypot(p.x-start.x,p.z-start.z)>.3;}', arg=initial, timeout=10000)
                finally:
                    page.keyboard.up('w')
                moved = page.evaluate('MuzikazHockey.snapshot().player')
                assert math.hypot(moved['x']-initial['x'], moved['z']-initial['z']) > .3, (label, initial, moved)
                assert page.evaluate("document.activeElement.id==='rink'")
            # Buttons remain keyboard-operable; directional keys alone resume play.
            page.get_by_role('button', name='Game settings', exact=True).focus()
            initial = page.evaluate('MuzikazHockey.snapshot().player')
            page.keyboard.down('s')
            try:
                page.wait_for_function('(start)=>{const p=MuzikazHockey.snapshot().player;return Math.hypot(p.x-start.x,p.z-start.z)>.3;}', arg=initial, timeout=10000)
            finally:
                page.keyboard.up('s')
            moved = page.evaluate('MuzikazHockey.snapshot().player')
            assert math.hypot(moved['x']-initial['x'], moved['z']-initial['z']) > .3, (initial, moved)
            page.close()
            print('Hockey movement recovers after settings, scores, match menus and toolbar focus.', flush=True)

        if args.world != 'hockey':
            page = new_page()
            page.goto(f'http://127.0.0.1:{server.server_port}/arcade.html?environment=neon-junction')
            page.wait_for_function('window.NeonJunction?.ready', timeout=60000)
            page.get_by_role('button', name='Close challenges', exact=True).evaluate('(button)=>button.click()')
            page.get_by_role('button', name='Arcade menu and match lobby', exact=True).click()
            page.locator('#attractions [data-attraction=shooting]').click()
            page.wait_for_function('NeonJunction.snapshot().gameStarted&&NeonJunction.snapshot().game===1')
            info = page.get_by_role('dialog', name='Game controls and information', exact=True)
            if not info.is_visible():
                page.get_by_role('button', name='Game controls and information', exact=True).focus()
                page.keyboard.press('Enter')
            assert info.is_visible(), page.evaluate('({body:document.body.className,state:NeonJunction.snapshot(),dialogs:[...document.querySelectorAll("dialog")].map(dialog=>({label:dialog.getAttribute("aria-label"),open:dialog.open}))})')
            info.get_by_role('button', name='Close Game controls and information', exact=True).focus()
            page.keyboard.press('Enter')
            for control, direction in [(page.get_by_role('button', name='Game controls and information', exact=True), 'd'),
                                       (page.locator('#sound'), 'a')]:
                control.focus()
                initial = page.evaluate('NeonJunction.snapshot().pointer')
                page.keyboard.down(direction)
                try:
                    page.wait_for_function('(start)=>Math.abs(NeonJunction.snapshot().pointer.x-start.x)>5', arg=initial, timeout=10000)
                finally:
                    page.keyboard.up(direction)
                moved = page.evaluate('NeonJunction.snapshot().pointer')
                assert abs(moved['x']-initial['x']) > 5, (direction, initial, moved)
                assert page.evaluate("document.activeElement.id==='play'")
            page.close()
            print('Arcade aiming recovers after information close and toolbar focus.', flush=True)
        assert not errors, errors
        browser.close()
finally:
    server.shutdown()
