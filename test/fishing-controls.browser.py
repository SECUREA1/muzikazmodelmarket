"""Fishing keeps the real boat visible and uses the shared sports action panel."""
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
        for width, height in [(320,568), (390,844), (844,390), (1280,800)]:
            page = browser.new_page(viewport={'width':width,'height':height})
            page.set_default_timeout(6000)
            errors = []
            page.on('pageerror', lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/fishing-controls.html')
            page.wait_for_selector('body[data-ready=true]')
            page.get_by_role('button', name='Fishing, tackle and tournaments', exact=True).click()
            hud = page.locator('.fishing-hud')
            primary = hud.locator('[data-fishing-primary]')
            hud.wait_for(state='visible')
            assert page.locator('dialog:modal').count() == 0
            assert not page.evaluate('ui.menuOpen()')
            assert page.evaluate('ui.playing()')
            assert hud.evaluate('(el)=>el.scrollWidth<=el.clientWidth'), (width,height)
            assert hud.bounding_box()['height'] < height * .45, (width,height,hud.bounding_box())
            assert page.evaluate('document.elementFromPoint(innerWidth/2,innerHeight*.35)?.id') == 'boat-view'
            assert page.locator('[data-water],.fishing-water').count() == 0
            assert page.evaluate('releases') > 0

            # Optional tackle menu is separate; closing it keeps live fishing.
            hud.locator('[data-fishing-menu]').click()
            dialog = page.get_by_role('dialog', name='Fishing tackle, creel and tournaments', exact=True)
            assert dialog.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            assert page.evaluate('ui.menuOpen()&&ui.playing()')
            assert dialog.get_by_role('combobox', name='Fishing rod', exact=True).get_by_role('option', name='Coastal Spinning Rod').count() == 1
            assert page.evaluate("ui.snapshot().gear.some(item=>item.id==='fishing-pro-rod') && ui.action('rod',{id:'fishing-pro-rod'}) && ui.snapshot().rodId==='fishing-pro-rod'")
            assert page.evaluate("ui.action('bait',{id:'fishing-lure'}) && ui.snapshot().baitId==='fishing-lure'")
            assert not page.evaluate("ui.action('rod',{id:'forged-rod'})")
            page.evaluate("ui.action('rod',{id:'fishing-rod'});ui.action('bait',{id:'fishing-bait'})")
            dialog.get_by_role('combobox', name='Fishing side', exact=True).select_option('port')
            dialog.locator('.game-fullscreen-close').click()
            assert primary.is_disabled(), 'Blocked port side should not cast'
            hud.locator('[data-fishing-side]').click()
            assert page.evaluate('ui.side') == 'starboard'
            primary.click()
            page.wait_for_function("snapshot.players.self.fishing.session?.status==='waiting'")
            assert page.evaluate("commands.findLast(cmd=>cmd.operation==='cast').side") == 'starboard'
            assert not page.evaluate("ui.action('rod',{id:'fishing-pro-rod'})"), 'Gear changed during an active cast'
            assert page.locator('dialog:modal').count() == 0
            page.evaluate("phase('bite')")
            primary.click()
            page.wait_for_function("snapshot.players.self.fishing.session.status==='reeling'")
            primary.scroll_into_view_if_needed()
            box = primary.bounding_box()
            page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
            page.mouse.down()
            page.wait_for_function("commands.some(cmd=>cmd.operation==='reel'&&cmd.holding)")
            page.mouse.up()
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='reel').holding===false")
            # Release works without pointer capture, on blur, and through keyboard holds.
            primary.evaluate('(button)=>{button.setPointerCapture=()=>{throw Error("Capture unavailable")}}')
            primary.dispatch_event('pointerdown', {'pointerId':91,'button':0,'pointerType':'touch'})
            page.evaluate('window.dispatchEvent(new PointerEvent("pointerup",{pointerId:91}))')
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='reel').holding===false")
            primary.dispatch_event('pointerdown', {'pointerId':92,'button':0,'pointerType':'touch'})
            page.evaluate('window.dispatchEvent(new Event("blur"))')
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='reel').holding===false")
            primary.focus()
            page.keyboard.down('Space')
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='reel').holding===true")
            page.keyboard.up('Space')
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='reel').holding===false")
            # Phase changes while a gesture is held cannot turn its release into Keep.
            primary.dispatch_event('pointerdown', {'pointerId':93,'button':0,'pointerType':'touch'})
            page.evaluate("phase('caught')")
            keep_box=hud.locator('[data-keep]').bounding_box()
            release_box=hud.locator('[data-release]').bounding_box()
            assert abs(keep_box['y']-release_box['y'])<1, 'Catch choices must share one row'
            assert keep_box['height']>=44 and release_box['height']>=44
            assert hud.bounding_box()['height']<height*.45, (width,height,'Caught HUD too tall')
            assert hud.evaluate('(el)=>el.scrollWidth<=el.clientWidth')
            page.evaluate('window.dispatchEvent(new PointerEvent("pointerup",{pointerId:93}))')
            primary.dispatch_event('click')
            assert page.evaluate('snapshot.players.self.fishing.creel.length') == 0
            assert page.evaluate("commands.filter(cmd=>cmd.operation==='keep').length") == 0
            primary.click()
            page.wait_for_function('snapshot.players.self.fishing.creel.length===1')
            hud.locator('[data-fishing-menu]').click()
            assert dialog.get_by_text('1 / 30', exact=True).count() == 1
            dialog.get_by_role('button', name='Sell catch at the fish market', exact=True).click()
            page.wait_for_function('snapshot.players.self.fishing.creel.length===0')
            dialog.get_by_role('button', name='Talk to fishing guide', exact=True).click()
            page.wait_for_function("document.querySelector('[data-menu-status]').textContent.startsWith('Captain Mara:')")
            dialog.get_by_role('button', name='Join tournament', exact=True).click()
            page.wait_for_function("snapshot.fishing.tournament.members.includes('self')")
            page.evaluate("snapshot.fishing.recentTournaments=[{id:'previous-cup',status:'finished',members:['self'],claimedBy:[]}];snapshot.fishing.tournament=null;snapshot.sequence++;ui.update(snapshot,'self',env)")
            dialog.get_by_role('button', name='Claim previous cup result', exact=True).click()
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='claim-tournament').tournamentId==='previous-cup'")
            dialog.locator('.game-fullscreen-close').click()
            assert page.evaluate('ui.playing()&&!ui.menuOpen()')

            # Closing while cast is still being confirmed never leaves a hidden hold.
            page.evaluate('delayCast=true')
            primary.click()
            page.wait_for_function('resolveCast!==null')
            hud.locator('[data-fishing-exit]').click()
            page.evaluate('resolveCast()')
            page.wait_for_function("snapshot.players.self.fishing.session.status==='cancelled'")
            assert hud.is_hidden() and not page.evaluate('ui.playing()')

            # Route arrival enters the live boat-side view once, without a modal.
            page.evaluate('''()=>{ui.reset();snapshot.players.self.fishing.session=null;Object.assign(snapshot.players.self.fishing.availability,{canCast:true,zoneId:'beacon-reef',sides:{port:{canCast:true,zoneId:'beacon-reef'},starboard:{canCast:false,zoneId:'beacon-reef'}}});Object.assign(snapshot.actors.boat,{holderId:'self',active:true,boating:{assist:'navigate',navigationType:'fishing',navigationZoneId:'beacon-reef',navigationDestinationId:'beacon-reef',navigationRouteId:'trip1',navigationName:'Beacon Reef Fishing',anchor:false,speed:2,assistStage:'passage',remainingDistance:30}});snapshot.sequence++;ui.update(snapshot,'self',env);}''')
            assert hud.is_hidden()
            page.evaluate('ui.open()')
            assert hud.locator('[data-route-status]').is_visible() and primary.is_disabled()
            page.evaluate('ui.close()')
            page.evaluate('''()=>{Object.assign(snapshot.actors.boat.boating,{assist:null,anchor:true,speed:0,assistStage:'arrived',arrival:{id:'old-route',destinationId:'marina-fishing',kind:'fishing',at:Date.now()}});snapshot.sequence++;ui.update(snapshot,'self',env);}''')
            assert hud.is_hidden()
            page.evaluate('''()=>{snapshot.serverTime=Date.now();snapshot.actors.boat.boating.arrival={id:'trip1',destinationId:'beacon-reef',kind:'fishing',at:snapshot.serverTime};snapshot.sequence++;ui.update(snapshot,'self',env);}''')
            hud.wait_for(state='visible')
            assert page.locator('dialog:modal').count() == 0
            assert page.evaluate('ui.side') == 'port'
            page.evaluate('delayCast=false')
            primary.click()
            page.wait_for_function("commands.findLast(cmd=>cmd.operation==='cast').zoneId==='beacon-reef'")
            page.evaluate("phase('caught');ui.close()")
            page.wait_for_function("snapshot.players.self.fishing.session.status==='kept'")
            page.evaluate("snapshot.sequence++;ui.update(snapshot,'self',env)")
            assert hud.is_hidden(), 'The same arrival reopened after dismissal'
            page.evaluate('ui.reset()')
            assert page.get_by_role('button', name='Fishing, tackle and tournaments', exact=True).is_hidden()
            assert not errors, errors
            page.close()
        browser.close()
    print('PASS: live boat remains visible, shared sports controls, hold/release safety, secondary menus, exact arrival, and return-to-helm at four viewport sizes')
finally:
    server.shutdown()
