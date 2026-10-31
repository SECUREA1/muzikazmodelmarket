"""SVG header actions and one emergency radio popup across mobile and desktop."""
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

fixture = '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#142722;color:#efffe9;font:14px system-ui}.house-explorer-shell{margin:8px;position:relative}.house-stage{position:relative;height:calc(100vh - 110px);min-height:240px;background:#16372a}button{min-height:44px;padding:8px;border:1px solid #9ebc9a;border-radius:8px;background:#254033;color:#efffe9}.game-dock-actions{display:flex;gap:6px}.mobile-move-pad{padding:8px}#fire{position:absolute;right:8px;bottom:8px}
</style><div class="house-explorer-shell"><div class="house-stage">
<button class="game-camera-toggle">Camera view</button><button class="game-flashlight-toggle">Flashlight</button><button class="map-quest-launcher">Quests</button><button class="district-map-toggle">District map</button><button class="factory-toggle">Factory</button><button class="factory-testing-toggle">Factory testing</button><button class="factory-logistics-toggle">Factory logistics</button><button class="prison-toggle">Prison</button><button class="airport-ops-toggle">Airport</button><button class="forest-toggle">Forest</button><button class="fitness-toggle">Fitness</button><div class="transport-activity"><button>Vehicle activities</button></div><div class="world-resident-ui"><button>Residents</button></div><div class="live-local-map"><header><button data-collapse>Map</button></header><div data-body hidden>Map markers</div></div><button id="fire">Fire</button>
</div><div class="house-control-dock"><div class="house-bottom-controls"><div class="game-dock-actions"><button id="world">World</button><button id="settings">Settings</button><button id="build">Build</button></div></div><div class="mobile-move-pad"><button id="move">Move player</button></div></div></div>'''

setup = '''async ({native=false,late=false,automatic=true}={})=>{
 const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
 const {mountDoomsdayUI}=await import('/public/js/doomsday-ui.js');
 const {stepDoomsday,doomsdayView}=await import('/public/js/doomsday-rules.js');
 const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
 localStorage.setItem('muzikaz.emergency.panel.automatic',String(automatic));
 window.clock=100000;window.env={id:'single-radio',name:'Emergency airport',spawn:{x:0,y:0,z:0}};window.sim={};window.player={id:'pilot',health:100,position:{x:30,y:0,z:30}};window.moves=0;window.calls=[];window.clicks={};window.blocked=gameplayOverlayOpen;
 stepDoomsday(sim,env,clock,{players:[player],random:()=>0});
 if(late){clock=sim.doomsday.nextEventAt;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});clock+=6000;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});}
 window.voice={state:{speaking:false,outputBusy:false,pending:0},unlock(){return true},announce(text,options){window.currentCall?.onCancelled?.();calls.push({text,options});currentCall=options;voice.state.speaking=true;options.onStarted?.();return true;}};
 window.finishVoice=()=>{voice.state.speaking=false;window.currentCall?.onFinished?.();};
 window.dock=document.querySelector('.game-dock-actions');window.dockParent=dock.parentElement;
 for(const id of ['world','settings','build','fire','move'])document.getElementById(id).onclick=()=>clicks[id]=(clicks[id]||0)+1;
 for(const button of document.querySelectorAll('.house-stage > button:not(#fire)')){const key=button.className;button.addEventListener('click',()=>clicks[key]=(clicks[key]||0)+1);}
 window.stage=document.querySelector('.house-stage');
 if(native){stage.className='native-doomsday';stage.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:80';}else window.display=mountGameDisplayFlow(stage);
 window.options={stage,getEnvironment:()=>env,getState:()=>doomsdayView(sim,env),getPosition:()=>player.position,voice,getPreferences:()=>({masterMuted:true,effectsMuted:true,announcementsMuted:true}),now:()=>clock};
 window.ui=mountDoomsdayUI(options);
 if(native){const host=document.createElement('details');host.className='native-radio-menu';const summary=document.createElement('summary');summary.textContent='Game flow & sound';host.append(summary);const menu=stage.querySelector('.doomsday-menu');if(menu)host.append(menu);stage.append(host);}
 window.advance=at=>{clock=at;stepDoomsday(sim,env,clock,{players:[player],random:()=>0});ui.tick(clock/1000);};
 document.addEventListener('keydown',event=>{if(event.key==='w'&&!blocked())moves++;});document.querySelector('#move').focus();ui.tick(clock/1000);
 window.remount=()=>mountDoomsdayUI(options)===ui&&(!display||mountGameDisplayFlow(stage)===display);
}'''


def new_page(browser, width, height, **options):
    page = browser.new_page(viewport={'width': width, 'height': height}, has_touch=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/__single_radio', lambda route: route.fulfill(body=fixture, content_type='text/html'))
    page.goto(f'http://127.0.0.1:{server.server_port}/__single_radio')
    page.evaluate(setup, options)
    return page, errors


def hit_center(locator):
    return locator.evaluate('''n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}''')


def assert_unique(page):
    for selector in ['.emergency-radio-toggle', '.emergency-nuclear-toggle', '#emergency-radio-popup', '#emergency-nuclear-panel', '#emergency-announcement-panel', '.doomsday-dispatch', '[data-transcript]', '[data-replay]']:
        assert page.locator(selector).count() == 1, selector
    assert page.get_by_role('button', name='Close emergency radio', exact=True, include_hidden=True).count() == 1
    assert page.locator('#emergency-radio-popup [data-countdown]').count() == 1
    assert page.evaluate('(()=>{const ids=[...document.querySelectorAll("[id]")].map(n=>n.id);return ids.length===new Set(ids).size;})()')
    assert page.evaluate('dock.parentElement===dockParent&&!dock.closest(".game-view-overflow")')


def assert_header(page, width):
    page.wait_for_function('''()=>{const v=document.querySelector('.game-display-flow-views');return v&&[...v.children].filter(n=>n.matches('button')&&!n.hidden).length===3;}''')
    radio = page.get_by_role('button', name='Emergency radio', exact=True)
    more = page.get_by_role('button', name='More view controls', exact=True)
    for button in [radio, page.get_by_role('button', name='Nuclear event', exact=True), more]:
        assert button.evaluate('n=>n.parentElement.classList.contains("game-display-flow-views")')
        box = button.bounding_box()
        assert box['width'] >= 44 and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width + 1, box
        assert hit_center(button)
    for selector in ['.game-camera-toggle', '.game-flashlight-toggle', '.map-quest-launcher', '.district-map-toggle', '.factory-toggle', '.factory-testing-toggle', '.factory-logistics-toggle', '.prison-toggle', '.airport-ops-toggle', '.forest-toggle', '.fitness-toggle', '.transport-activity', '.world-resident-ui', '.live-local-map']:
        assert page.locator(selector).count() == 1, selector
        assert page.locator(selector).evaluate('n=>!!n.closest(".game-view-overflow")'), selector
    return radio, more


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for width, height in [(320, 568), (390, 844), (844, 390), (1280, 800)]:
            page, errors = new_page(browser, width, height)
            popup = page.locator('#emergency-radio-popup')
            radio, more = assert_header(page, width)
            assert popup.is_hidden()
            assert more.get_attribute('aria-expanded') == 'false'
            assert page.evaluate('remount()'), 'A repeated mount created a second header or radio.'
            assert_unique(page)

            # Text-only fixture header actions stay in More; regular gameplay stays in place.
            more.click()
            overflow = page.locator('.game-view-overflow')
            assert overflow.is_visible() and popup.is_hidden()
            for label in ['Camera view', 'Flashlight', 'Quests', 'District map', 'Factory', 'Factory testing', 'Factory logistics', 'Prison', 'Airport', 'Forest', 'Fitness', 'Vehicle activities', 'Residents', 'Map']:
                button = overflow.get_by_role('button', name=label, exact=True)
                assert button.count() == 1, label
                button.scroll_into_view_if_needed()
                assert hit_center(button), (width, label, 'additional control is clipped')
                box = button.bounding_box()
                assert box['height'] >= 44 and box['width'] > overflow.bounding_box()['width'] * .5, (width, label, box)
            for label in ['Camera view', 'Flashlight', 'Quests']:
                overflow.get_by_role('button', name=label, exact=True).click()
            assert page.evaluate('clicks["game-camera-toggle"]===1&&clicks["game-flashlight-toggle"]===1&&clicks["map-quest-launcher"]===1')
            more.click()
            assert overflow.is_hidden()
            for label in ['World', 'Settings', 'Build', 'Fire', 'Move player']:
                page.get_by_role('button', name=label, exact=True).click()
            assert page.evaluate('["world","settings","build","fire","move"].every(id=>clicks[id]===1)')

            # The header radio opens the single popup, including sound and guide settings.
            radio.click()
            assert popup.is_visible() and more.get_attribute('aria-expanded') == 'false'
            assert popup.get_by_role('button', name='Close emergency radio', exact=True).is_visible()
            assert popup.locator('#emergency-sound-panel').count() == 1
            assert popup.locator('#emergency-flow-panel').count() == 1
            assert popup.get_by_role('switch', name='Auto-show event panel', exact=True, include_hidden=True).count() == 1
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            assert popup.is_hidden()

            # One non-blocking top-left card carries both the live countdown and radio call.
            more.click()
            assert overflow.is_visible() and more.get_attribute('aria-expanded') == 'true'
            page.locator('#move').focus()
            page.evaluate('advance(sim.doomsday.nextEventAt)')
            popup.wait_for(state='visible')
            countdown = popup.locator('[data-countdown]')
            transcript = popup.locator('[data-transcript]')
            assert countdown.text_content() == 'Detonations in 18s'
            assert hit_center(countdown), (width, 'countdown clipped')
            assert 'Cole' in transcript.text_content() and hit_center(transcript), (width, 'transcript clipped')
            assert popup.evaluate('n=>n.parentElement===stage&&!n.closest(".game-view-overflow")')
            assert more.get_attribute('aria-expanded') == 'false' and overflow.is_hidden(), 'An automatic alert left More covering the radio popup.'
            stage_box, box = page.locator('.house-stage').bounding_box(), popup.bounding_box()
            assert stage_box['x'] <= box['x'] <= stage_box['x'] + 20
            header_box = page.locator('.game-display-flow-views').bounding_box()
            assert header_box['y'] + header_box['height'] <= box['y'] <= header_box['y'] + header_box['height'] + 24
            assert box['x'] + box['width'] <= stage_box['x'] + stage_box['width'] + 1
            assert page.evaluate('document.activeElement===document.getElementById("move")&&!blocked()')
            page.keyboard.press('w')
            assert page.evaluate('moves') == 1
            assert_unique(page)

            # Dismissal closes the entire radio, and the same call cannot reopen it.
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            assert popup.is_hidden()
            page.evaluate('currentCall.onStarted?.();ui.tick(clock/1000);advance(clock+1000)')
            assert popup.is_hidden(), 'The dismissed announcement reopened from its own callback.'
            page.evaluate('finishVoice();advance(sim.doomsday.detonationAt)')
            assert popup.is_visible(), 'A new phase announcement failed to open the emergency radio.'
            assert countdown.text_content() == 'Fallout in 7s'
            assert 'Detonations' in transcript.text_content()
            assert more.get_attribute('aria-expanded') == 'false'
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            more.click()
            page.get_by_role('button', name='Nuclear event', exact=True).click()
            assert popup.is_visible() and more.get_attribute('aria-expanded') == 'false'
            assert countdown.text_content() == 'Fallout in 7s'
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            page.evaluate('finishVoice();advance(sim.doomsday.falloutAt)')
            assert popup.is_visible() and 'Fallout' in transcript.text_content()

            if width == 390:
                # Finish the real quest-led event and verify the next alert uses this same card.
                page.evaluate('finishVoice();advance(sim.doomsday.falloutAt+5000);player.position={...sim.doomsday.objectives.find(o=>o.id==="supplies").position};advance(clock+1)')
                assert page.evaluate('sim.doomsday.phase') == 'recovery'
                assert 'Supplies secured' in transcript.text_content() or 'Recovery' in transcript.text_content()
                page.evaluate('finishVoice();player.position={...sim.doomsday.objectives.find(o=>o.id==="recovery").position};advance(clock+1);advance(sim.doomsday.clearAt)')
                assert page.evaluate('sim.doomsday.phase') == 'all-clear'
                assert 'All clear' in transcript.text_content()
                page.get_by_role('button', name='Close emergency radio', exact=True).click()
                page.evaluate('finishVoice();player.position={x:30,y:0,z:30};advance(sim.doomsday.nextEventAt)')
                assert popup.is_visible() and countdown.text_content() == 'Detonations in 18s'
                assert more.get_attribute('aria-expanded') == 'false'
                assert_unique(page)

            # Viewport refits preserve the same popup and the same SVG header actions.
            page.get_by_role('button', name='Close emergency radio', exact=True).click()
            page.set_viewport_size({'width': max(320, width - 10), 'height': height})
            page.set_viewport_size({'width': width, 'height': height})
            assert_header(page, width)
            assert_unique(page)
            page.get_by_role('button', name='Fire', exact=True).click()
            page.get_by_role('button', name='Move player', exact=True).click()
            assert page.evaluate('clicks.fire===2&&clicks.move===2&&!blocked()')
            assert page.locator('.mobile-move-pad').is_visible()
            assert not errors, errors
            print(f'{width}x{height}: SVG header actions, text-only More list, one countdown/radio popup, dismissal/refits, preserved dock and movement passed', flush=True)
            page.close()

        page, errors = new_page(browser, 390, 844, automatic=False)
        radio, more = assert_header(page, 390)
        page.evaluate('advance(sim.doomsday.nextEventAt)')
        assert page.locator('#emergency-radio-popup').is_hidden()
        assert more.get_attribute('aria-expanded') == 'false'
        assert page.evaluate('calls.some(call=>call.text.includes("Cole"))'), 'Opt-out suppressed emergency audio calls.'
        radio.click()
        popup = page.locator('#emergency-radio-popup')
        assert popup.is_visible() and popup.locator('[data-countdown]').text_content() == 'Detonations in 18s'
        assert popup.get_by_role('switch', name='Auto-show event panel', exact=True, include_hidden=True).is_checked() is False
        popup.get_by_text('Radio & sound settings', exact=True).click()
        assert popup.get_by_role('button', name='Enable sounds', exact=True).is_visible()
        assert popup.get_by_role('button', name='Test sounds', exact=True).is_visible()
        automatic = popup.get_by_role('switch', name='Auto-show event panel', exact=True)
        automatic.check()
        assert page.evaluate('localStorage.getItem("muzikaz.emergency.panel.automatic")') == 'true'
        popup.get_by_text('Challenge & evacuation guide', exact=True).click()
        following = popup.get_by_role('switch', name='Follow emergency challenge', exact=True)
        following.check()
        assert page.evaluate('ui.followingChallenge()&&localStorage.getItem("muzikaz.emergency.challenge.follow")==="true"')
        following.uncheck()
        assert page.evaluate('!ui.followingChallenge()&&sim.doomsday.phase==="warning"')
        popup.evaluate('n=>{n.scrollTop=n.scrollHeight;}')
        assert popup.evaluate('n=>n.scrollTop>0'), 'The settings fixture did not exercise popup scrolling.'
        page.get_by_role('button', name='Close emergency radio', exact=True).click()
        page.evaluate('finishVoice();advance(sim.doomsday.detonationAt)')
        assert popup.is_visible() and more.get_attribute('aria-expanded') == 'false'
        assert popup.evaluate('n=>n.scrollTop===0'), 'A new phase reopened at the previous settings scroll position.'
        assert hit_center(popup.locator('[data-countdown]')) and hit_center(popup.locator('[data-transcript]'))
        assert_unique(page)
        assert not errors, errors
        print('settings: auto-show opt-out preserves calls/manual access; sound and challenge controls remain usable and restore automatic announcements', flush=True)
        page.close()

        page, errors = new_page(browser, 390, 844, native=True, late=True)
        popup = page.locator('#emergency-radio-popup')
        popup.wait_for(state='visible')
        assert popup.locator('[data-countdown]').text_content() == 'Detonations in 12s'
        assert popup.evaluate('n=>n.parentElement===stage&&!n.closest("details")')
        assert page.locator('.native-radio-menu').get_attribute('open') is None
        assert_unique(page)
        assert not errors, errors
        print('native late arrival: single radio popup shows current countdown without opening another menu', flush=True)
        page.close()
        browser.close()
finally:
    server.shutdown()
