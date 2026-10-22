"""The actual loose-ball controls stay hidden until playable and return focus."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
source = (ROOT / 'public/js/house-explorer-glb.js').read_text()
start = source.index("  const ballControlsStyle=document.createElement('style');")
block = source[start:source.index('  function basketballDirection()', start)]
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 390, 'height': 700})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.evaluate('''async block => {
            const THREE=await import('/public/vendor/three/three.module.min.js');
            const {isBasketball,basketballCatchPosition}=await import('/public/js/basketball.js');
            document.body.innerHTML='<main class="house-stage" style="position:relative;width:390px;height:600px"><canvas tabindex="0"></canvas></main>';
            const stage=document.querySelector('main'),canvas=stage.querySelector('canvas');
            window.ready=false;window.actions=[];window.outsideClicks=0;window.gameKeys=[];
            window.activeEnvironment={game:'park'};window.serverHostedRoom=true;
            window.serverActors={ball:{id:'ball',modelId:'basketball',active:true,position:{x:1,y:.2,z:0}}};
            window.basketballSelf={health:100,heldId:null};window.localBasketballs=[];window.localBasketballPlayer={health:100};window.heldBasketball=null;
            const playerRig={position:new THREE.Vector3()},builderGameplay={heldActor:()=>null};
            const isBasketballEnvironment=environment=>environment.game==='basketball';
            const gameplayControlsReady=()=>ready;
            const gameplayOverlayOpen=()=>!!document.querySelector('dialog[open]');
            const safelyInteract=(_,action)=>action();
            const basketballAction=async action=>{actions.push(action);basketballSelf.heldId=action==='catch'?'ball':null;serverActors.ball.holderId=basketballSelf.heldId?'me':null;};
            window.addEventListener('click',()=>outsideClicks++);
            window.addEventListener('keydown',event=>{gameKeys.push(event.key);if(event.key===' ')event.preventDefault();});
            eval(block+'window.quick={root:ballControls,refresh:refreshBasketballQuickControls,hide:hideBasketballControls};');
        }''', block)
        catch = page.get_by_role('button', name='Catch basketball (E)', exact=True, include_hidden=True)
        toss = page.get_by_role('button', name='Toss basketball (T)', exact=True, include_hidden=True)
        assert page.locator('.basketball-controls').is_hidden(), 'Hidden controls must not leak through inline flex during joining.'
        before_start_actions = page.evaluate('()=>{quick.refresh();quick.root.querySelector("button").click();return actions;}')
        assert before_start_actions == []
        page.evaluate('()=>{ready=true;quick.refresh();}')
        assert catch.is_enabled() and toss.is_disabled()
        assert catch.bounding_box()['width'] == 44
        page.evaluate('outsideClicks=0')
        catch.click()
        page.wait_for_function('actions.length===1&&!document.querySelector(".basketball-controls button:last-child").disabled')
        assert page.locator('canvas').evaluate('(canvas)=>canvas===document.activeElement')
        assert page.evaluate('outsideClicks') == 0, 'Basketball clicks must not also trigger world controls.'
        assert catch.is_disabled() and toss.is_enabled()
        page.keyboard.press('w')
        page.keyboard.press('Space')
        assert page.evaluate('gameKeys.splice(0)') == ['w', ' ']
        toss.click()
        page.wait_for_function('actions.length===2&&!document.querySelector(".basketball-controls button").disabled')
        assert page.evaluate('actions') == ['catch', 'toss']
        assert toss.is_disabled()
        assert page.locator('canvas').evaluate('(canvas)=>canvas===document.activeElement')
        page.evaluate('()=>{const dialog=document.createElement("dialog");document.body.append(dialog);dialog.showModal();quick.refresh();}')
        assert page.locator('.basketball-controls').is_hidden()
        page.evaluate('()=>{document.querySelector("dialog").close();ready=false;quick.refresh();}')
        assert page.locator('.basketball-controls').is_hidden()
        page.evaluate('()=>{ready=true;activeEnvironment.game="basketball";quick.refresh();}')
        assert page.locator('.basketball-controls').is_hidden(), 'Dedicated arena controls own arena actions.'
        page.evaluate('()=>{activeEnvironment.game="park";serverActors.ball.position.x=30;quick.refresh();}')
        assert catch.is_disabled() and toss.is_disabled()
        page.evaluate('()=>{serverActors.ball.position.x=1;quick.refresh();quick.hide();}')
        assert page.locator('.basketball-controls').is_hidden(), 'Transition hook must hide controls even when animation is paused.'
        assert not errors, errors
        browser.close()
    print('Basketball quick actions honor startup, reach, possession and overlays; actions restore canvas focus and do not bubble.')
finally:
    server.shutdown()
    server.server_close()
