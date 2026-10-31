"""Existing SVG actions stay across the top, with one live emergency radio card."""
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
icon = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m8 12 3 3 5-6"/></svg>'


def action(css, label, key, attributes=''):
    return f'<button class="{css}" aria-label="{label}" data-action="{key}" {attributes}>{icon}</button>'


fixture = '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#142722;color:#efffe9;font:14px system-ui}.house-explorer-shell{margin:8px;position:relative}.house-stage{position:relative;height:calc(100vh - 110px);min-height:240px;background:#16372a}button{min-height:44px;padding:8px;border:1px solid #9ebc9a;border-radius:8px;background:#254033;color:#efffe9;touch-action:manipulation}.game-dock-actions{display:flex;gap:6px}.mobile-move-pad{padding:8px}#fire{position:absolute;right:8px;bottom:8px}.fixture-companion{position:absolute;top:52px;left:0;z-index:40;box-sizing:border-box;width:min(220px,100%);padding:12px;background:#1f4333;border:1px solid #9bc996}.fixture-companion[hidden]{display:none!important}
</style><div class="house-explorer-shell"><div class="house-stage">'''
fixture += ''.join([
    action('game-camera-toggle', 'Camera view', 'camera'),
    action('game-flashlight-toggle', 'Flashlight', 'flashlight'),
    action('map-quest-launcher', 'Quests', 'quests'),
    action('district-map-toggle', 'District map', 'district'),
    action('factory-toggle', 'Factory', 'factory', 'disabled'),
    action('airport-ops-toggle', 'Airport tower', 'airport'),
    action('forest-toggle', 'Forest', 'forest', 'hidden'),
    action('fitness-toggle', 'Fitness', 'fitness'),
    '<div class="transport-activity">' + action('', 'Vehicle activities', 'transport', 'data-panel-target="transport-panel"') + '<section id="transport-panel" class="transport-radio-panel fixture-companion" hidden>Vehicle mission radio</section></div>',
    '<div class="world-resident-ui">' + action('', 'Residents', 'residents', 'data-panel-target="resident-panel"') + '<section id="resident-panel" class="world-resident-panel fixture-companion" hidden>Nearby residents</section></div>',
    '<div class="live-local-map"><header>' + action('', 'Live map', 'map', 'data-collapse data-panel-target="map-panel"') + '</header><div id="map-panel" class="fixture-companion" data-body hidden>Map markers</div></div>',
])
fixture += '''<button id="fire">Fire</button></div><div class="house-control-dock"><div class="house-bottom-controls"><div class="game-dock-actions"><button id="world">World</button><button id="settings">Settings</button><button id="build">Build</button></div></div><div class="mobile-move-pad"><button id="move">Move player</button></div></div></div>'''

setup = '''async()=>{
 const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
 const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
 const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
 const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
 localStorage.setItem('muzikaz.emergency.panel.automatic','true');
 window.clock=100000;window.env={id:'header-svg',name:'Emergency airport',spawn:{x:0,y:0,z:0}};window.sim={};window.player={id:'pilot',health:100,position:{x:30,y:0,z:30}};window.moves=0;window.calls=[];window.clicks={};window.blocked=gameplayOverlayOpen;
 stepDoomsday(sim,env,clock,{players:[player],random:()=>0});
 window.voice={state:{speaking:false,outputBusy:false,pending:0},unlock(){return true},announce(text,options){calls.push({text,options});return true;}};
 window.dock=document.querySelector('.game-dock-actions');window.dockParent=dock.parentElement;window.originals=new Map();
 for(const button of document.querySelectorAll('[data-action]')){originals.set(button.dataset.action,button);button.addEventListener('click',()=>{const key=button.dataset.action;clicks[key]=(clicks[key]||0)+1;const panel=document.getElementById(button.dataset.panelTarget);if(panel){panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));}});}
 for(const id of ['world','settings','build','fire','move'])document.getElementById(id).onclick=()=>clicks[id]=(clicks[id]||0)+1;
 window.stage=document.querySelector('.house-stage');window.display=mountGameDisplayFlow(stage);
 window.options={stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>player.position,voice,getPreferences:()=>({masterMuted:true,effectsMuted:true,announcementsMuted:true}),now:()=>clock};
 window.ui=mountDoomsdayUI(options);window.advance=at=>{clock=at;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});ui.tick(clock/1000);};
 document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});document.querySelector('#move').focus();ui.tick(clock/1000);
 window.refit=()=>stage.dispatchEvent(new CustomEvent('muzikaz:action-bars-visibility'));
 window.remount=()=>mountDoomsdayUI(options)===ui&&mountGameDisplayFlow(stage)===display;
}'''


def hit_center(locator):
    return locator.evaluate('''n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}''')


def header_boxes(page, width):
    # Selector ownership, rather than the number of fixture actions, protects late controls too.
    buttons = page.locator('[data-action]:visible, .emergency-radio-toggle:visible, .emergency-nuclear-toggle:visible, .game-view-more:visible')
    boxes = []
    for index in range(buttons.count()):
        button = buttons.nth(index)
        assert button.evaluate('n=>!!n.closest(".game-display-flow-views")&&!n.closest(".game-view-overflow")'), button.get_attribute('aria-label')
        box = button.bounding_box()
        assert box['width'] >= 44 and box['height'] >= 44, (width, button.get_attribute('aria-label'), box)
        assert 0 <= box['x'] and box['x'] + box['width'] <= width + 1, (width, box)
        assert hit_center(button), (width, button.get_attribute('aria-label'), 'header icon is covered')
        boxes.append(box)
    for i, first in enumerate(boxes):
        for second in boxes[i + 1:]:
            overlap = min(first['x'] + first['width'], second['x'] + second['width']) - max(first['x'], second['x']) > .5 and min(first['y'] + first['height'], second['y'] + second['height']) - max(first['y'], second['y']) > .5
            assert not overlap, (width, 'SVG buttons overlap', first, second)
    return boxes


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for width, height in [(320, 568), (390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=True)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/__header_svg', lambda route: route.fulfill(body=fixture, content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/__header_svg')
            page.evaluate(setup)
            page.wait_for_function('''()=>[...document.querySelectorAll('[data-action]')].every(n=>!!n.closest('.game-display-flow-views')&&!n.closest('.game-view-overflow'))''')
            radio = page.get_by_role('button', name='Emergency radio', exact=True)
            more = page.get_by_role('button', name='More view controls', exact=True)
            popup = page.locator('#emergency-radio-popup')
            radio.wait_for(state='visible')
            boxes = header_boxes(page, width)
            if width <= 390:
                assert len({round(box['y']) for box in boxes}) >= 2, 'Narrow screens must retain every SVG using header rows.'
            assert page.get_by_role('button', name='Factory', exact=True).is_disabled()
            assert page.locator('.forest-toggle').is_hidden()
            assert page.evaluate('remount()&&[...originals].every(([key,n])=>document.querySelector(`[data-action="${key}"]`)===n)')
            assert page.evaluate('dock.parentElement===dockParent&&!dock.closest(".game-view-overflow")')
            assert page.locator('#emergency-radio-popup').count() == 1
            assert page.locator('.emergency-radio-toggle').count() == page.locator('.emergency-nuclear-toggle').count() == 1

            # All icon callbacks retain their original controls; optional panels still open.
            for label, key in [('Camera view', 'camera'), ('Flashlight', 'flashlight'), ('Quests', 'quests'), ('District map', 'district'), ('Airport tower', 'airport'), ('Fitness', 'fitness')]:
                page.get_by_role('button', name=label, exact=True).click()
                assert page.evaluate('(key)=>clicks[key]', key) == 1
            for label, target in [('Vehicle activities', '#transport-panel'), ('Residents', '#resident-panel'), ('Live map', '#map-panel')]:
                button = page.get_by_role('button', name=label, exact=True)
                button.click()
                panel = page.locator(target)
                assert panel.is_visible() and hit_center(panel), (width, label, 'companion is unreachable')
                assert panel.bounding_box()['y'] >= max(box['y'] + box['height'] for box in boxes) - 1, (width, label, 'companion covers lower icon rows')
                button.click()
                assert panel.is_hidden()

            # Only text-based secondary actions need More; SVG launchers stay above it.
            more.click()
            overflow = page.locator('.game-view-overflow')
            assert overflow.is_visible()
            assert overflow.locator('[data-action],.emergency-radio-toggle,.emergency-nuclear-toggle').count() == 0
            flow = overflow.get_by_role('button', name='Emergency response flow', exact=True)
            assert flow.is_visible() and hit_center(flow)
            flow.click()
            assert popup.is_visible() and overflow.is_hidden()
            assert page.locator('#emergency-flow-panel').is_visible()
            page.get_by_role('button', name='Close emergency radio', exact=True).click()

            # Repeated fitting never reparents a held or focused icon.
            radio.focus()
            page.evaluate('''async()=>{for(let i=0;i<6;i++){refit();await new Promise(requestAnimationFrame);}}''')
            assert radio.evaluate('n=>document.activeElement===n')
            page.evaluate('''()=>{window.presses=window.lostCapture=window.activations=0;const n=document.querySelector('.emergency-radio-toggle');n.addEventListener('pointerdown',e=>{presses++;n.setPointerCapture(e.pointerId);});n.addEventListener('lostpointercapture',()=>lostCapture++);n.addEventListener('click',()=>activations++);}''')
            box = radio.bounding_box()
            page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
            page.mouse.down()
            page.evaluate('''async()=>{for(let i=0;i<5;i++){refit();await new Promise(requestAnimationFrame);}}''')
            assert page.evaluate('presses===1&&lostCapture===0')
            page.mouse.up()
            assert page.evaluate('activations') == 1
            assert popup.is_visible()
            page.get_by_role('button', name='Close emergency radio', exact=True).click()

            # Runtime availability and newly mounted SVG actions participate in the header.
            page.evaluate('''()=>{document.querySelector('.forest-toggle').hidden=false;const group=document.createElement('div');group.className='broadcast-controls';const button=document.createElement('button');button.setAttribute('aria-label','Broadcast view');button.dataset.action='broadcast';button.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 6h16v12H4z"/></svg>';button.onclick=()=>clicks.broadcast=(clicks.broadcast||0)+1;group.append(button);stage.append(group);}''')
            page.get_by_role('button', name='Forest', exact=True).wait_for(state='visible')
            page.wait_for_function('!!document.querySelector("[data-action=broadcast]")?.closest(".game-display-flow-views")')
            boxes = header_boxes(page, width)
            page.get_by_role('button', name='Forest', exact=True).click()
            page.get_by_role('button', name='Broadcast view', exact=True).click()
            assert page.evaluate('clicks.forest===1&&clicks.broadcast===1')
            page.evaluate('document.querySelector(".forest-toggle").hidden=true')
            assert page.locator('.forest-toggle').is_hidden()
            page.set_viewport_size({'width': max(320, width - 10), 'height': height})
            page.set_viewport_size({'width': width, 'height': height})
            boxes = header_boxes(page, width)

            # The one emergency card starts below the actual wrapped rows.
            page.locator('#move').focus()
            page.evaluate('advance(sim.doomsday.nextEventAt)')
            popup.wait_for(state='visible')
            assert popup.bounding_box()['y'] >= max(box['y'] + box['height'] for box in boxes) + 3, (width, 'radio overlaps SVG header')
            assert popup.locator('[data-countdown]').text_content() == 'Detonations in 18s'
            assert hit_center(popup.locator('[data-countdown]')), (width, 'countdown is clipped')
            assert 'Cole' in popup.locator('[data-transcript]').text_content()
            assert hit_center(popup.locator('[data-transcript]')), (width, 'radio transcript is clipped')
            assert page.evaluate('document.activeElement===document.getElementById("move")&&!blocked()')
            page.keyboard.press('w')
            assert page.evaluate('moves') == 1
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            page.get_by_role('button', name='Nuclear event', exact=True).click()
            assert popup.is_visible() and page.locator('#emergency-radio-popup').count() == 1
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            for label in ['World', 'Settings', 'Build', 'Fire', 'Move player']:
                page.get_by_role('button', name=label, exact=True).click()
            assert page.evaluate('["world","settings","build","fire","move"].every(id=>clicks[id]===1)')
            assert page.locator('.mobile-move-pad').is_visible()
            assert page.evaluate('dock.parentElement===dockParent')
            assert page.evaluate('(()=>{const ids=[...document.querySelectorAll("[id]")].map(n=>n.id);return ids.length===new Set(ids).size;})()')
            assert not errors, errors
            print(f'{width}x{height}: all SVG icons across top, wrapped rows, original callbacks/panels, one radio below header, focus/capture and gameplay passed', flush=True)
            page.close()
        browser.close()
finally:
    server.shutdown()
