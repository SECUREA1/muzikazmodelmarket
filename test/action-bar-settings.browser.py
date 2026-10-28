"""Existing settings hide action bars while preserving live scores and controls."""
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
        for width in [320, 390, 1280]:
            page = browser.new_page(viewport={'width': width, 'height': 900}, is_mobile=width < 760, has_touch=width < 760)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/nearby-action-buttons.html')
            page.wait_for_function('document.body.dataset.ready === "true"')
            page.add_style_tag(url='/public/assets/rad-tox-controller.css')
            page.evaluate('''async () => {
                const {mountPlayerSettings}=await import('/public/js/player-settings.js');
                const {mountGameDisplayFlow,setGameActionBarsHidden}=await import('/public/js/game-display-flow.js');
                const {mountBasketballHud}=await import('/public/js/basketball-hud.js');
                const {mountFiringRangeHud}=await import('/public/js/firing-range-hud.js');
                const {radToxStickMarkup}=await import('/public/js/rad-tox-controller.js');
                const stage=document.querySelector('.house-stage');
                const shell=document.createElement('section');shell.className='house-explorer-shell';stage.before(shell);shell.append(stage);
                stage.insertAdjacentHTML('beforeend','<section class="resident-visitor-prompt"><button>Talk to resident</button></section><div class="basketball-controls"><button>Pass</button></div><button class="fitness-nearby">Train nearby</button><canvas tabindex="0"></canvas><button class="game-camera-toggle" aria-label="Change view">View</button><button class="district-map-toggle" aria-label="Open map">Map</button><button class="fitness-toggle" hidden aria-label="Unavailable fitness">Fitness</button><button class="range-ops-button">Range operations</button><button class="building-adjust-button">Adjust build</button><section class="rad-tox-hud"><div data-rad-row="targets"><button class="rad-tox-row-toggle">Targets</button><div class="rad-tox-hud-row__content" style="display:none"><strong data-target-score>8 targets</strong></div></div><div data-rad-row="tools"><button>Weapons</button></div></section>');
                const dock=document.createElement('div');dock.className='house-control-dock';
                dock.innerHTML='<div class="house-bottom-controls"><div class="game-dock-actions"><button class="house-bottom-control" id="house-controller-toggle" aria-label="Toggle controller panel">Pad</button><button class="house-bottom-control" id="house-tools" aria-label="Tools">Tools</button><button class="house-bottom-control" id="house-view-options" aria-label="Explorer options: view, space size and profile">Settings</button></div></div><div class="mobile-move-pad mobile-move-pad-glb">'+radToxStickMarkup({left:'Move',movementOnly:true})+'</div>';
                shell.append(dock);
                const panel=document.createElement('dialog');panel.id='game-explorer-options';panel.className='game-settings-section';panel.setAttribute('aria-label','Settings & Explorer options');
                panel.innerHTML='<button type="button" data-close-settings>Return to game</button>';shell.append(panel);
                window.savedSettings={hideActionBars:false};window.settingsWrites=[];
                const speech=new EventTarget();speech.getVoices=()=>[];
                const inventory={
                    async api(path,options){if(options?.method==='PUT'){savedSettings=JSON.parse(options.body).settings;settingsWrites.push({...savedSettings});}return{owner_id:'member',settings:savedSettings};},
                    async session(){return{owner_id:'member',csrfToken:'test'};},
                    async state(){return{owner_id:'member',balance:0,items:[],stats:{},history:[]};}
                };
                window.settingsUI=mountPlayerSettings({panel,inventory,onChange:preferences=>setGameActionBarsHidden(stage,preferences.hideActionBars),gameState:()=>({}),onAvatar(){},onCare(){},speech});
                document.querySelector('#house-view-options').onclick=async()=>{window.settingsOpenCount=(window.settingsOpenCount||0)+1;panel.showModal();await settingsUI.open();};
                panel.querySelector('[data-close-settings]').onclick=()=>{settingsUI.close();panel.close();};
                const expand=document.createElement('button');expand.type='button';expand.className='game-viewport-toggle';expand.setAttribute('aria-label','Expand game');expand.setAttribute('aria-pressed','false');expand.textContent='Expand';expand.onclick=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen();};stage.append(expand);
                document.addEventListener('fullscreenchange',()=>expand.setAttribute('aria-pressed',String(!!document.fullscreenElement)));
                window.basketball=mountBasketballHud({stage,onAction:()=>{}});
                window.basketballState={state:'live',homeScore:12,awayScore:9,clockMs:95000,shotClockMs:18000,quarter:2};
                window.basketballPlayer={id:'me',basketballTeam:'home'};
                basketball.render(basketballState,basketballPlayer,true,{me:basketballPlayer});
                window.range=mountFiringRangeHud({stage,onAction:()=>{}});
                window.rangeState={state:'live',round:1,remainingMs:25000,settings:{mode:'precision'},participants:{me:{id:'me',score:42,role:'player'}}};
                // A composite fixture exercises each map's HUD selectors together.
                range.render(rangeState,'me',true);stage.classList.remove('basketball-world','firing-range-world');
                window.displayFlow=mountGameDisplayFlow(stage);
                const style=document.createElement('style');style.textContent='html,body{margin:0;width:100%;background:#142018;font-family:system-ui}.house-explorer-shell{display:flex;flex-direction:column;width:100%;margin:0;gap:0}.house-stage{width:100%;height:auto;overflow:hidden;position:relative;background:#102d21}.house-stage canvas{display:block;width:100%;height:100%}.mobile-move-pad{display:grid;grid-template-columns:1fr 1fr;padding:8px;box-sizing:border-box}.rad-tox-hud{position:absolute;top:100px;left:8px;right:8px;color:#fff}.range-ops-button,.building-adjust-button{position:absolute;top:145px}dialog#game-explorer-options{box-sizing:border-box;width:min(600px,calc(100vw - 20px));max-height:85dvh;overflow:auto;padding:16px;border:1px solid #bdda9c;background:#18291c;color:white}dialog#game-explorer-options::backdrop{background:#0007}.player-settings-grid{display:grid;gap:12px}.player-settings-grid>label{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.player-settings-grid input[type=range]{max-width:100%}button{min-height:44px;cursor:pointer}';document.head.append(style);
                await settingsUI.restore();
                window.actionFixture={stage,shell,dock,panel};
            }''')
            page.wait_for_timeout(150)
            toggle = page.get_by_label('Hide action bars (keep scores)', exact=True)
            settings = page.locator('#house-view-options')
            settings_count = page.locator('.house-stage button,.house-control-dock button').count()
            assert page.locator('.house-bottom-controls').bounding_box()['height'] == 52
            assert page.locator('.basketball-hud .sports-action-modes').first.is_visible()
            assert page.locator('.firing-range-hud').is_visible()
            assert page.locator('.nearby-gameplay-actions').is_visible()
            assert page.locator('.rad-tox-fire-trigger').is_visible()
            assert page.locator('[data-target-score]').is_hidden(), 'Fixture starts with collapsed target details.'
            assert page.locator('.fitness-toggle').evaluate('(node)=>node.hidden')
            settings.click()
            assert toggle.is_enabled() and not toggle.is_checked()
            toggle.check()
            page.get_by_role('button', name='Save settings', exact=True).click()
            page.wait_for_function('settingsWrites.length===1')
            page.get_by_role('button', name='Return to game', exact=True).click()
            page.wait_for_function('document.querySelector(".house-stage").classList.contains("player-hide-action-bars")')
            hidden_selectors = ['.resident-visitor-prompt', '.basketball-controls', '.fitness-nearby', '.game-camera-toggle', '.district-map-toggle', '.fitness-toggle', '.nearby-gameplay-actions', '.rad-tox-fire-trigger', '.range-ops-button', '.building-adjust-button', '.firing-range-hud', '.firing-range-caption', '[data-rad-row=tools]', '.rad-tox-row-toggle', '.sports-action-modes', '.sports-action-tools', '.sports-action-utilities', '#house-tools', '#house-controller-toggle']
            for selector in hidden_selectors:
                assert all(node.is_hidden() for node in page.locator(selector).all()), (width, selector)
            assert page.locator('.house-bottom-controls').bounding_box()['height'] == 0, 'Hidden dock must release its row.'
            assert page.locator('.game-dock-actions').bounding_box()['height'] == 0
            assert page.locator('.game-viewport-toggle').is_hidden(), 'Unused expand control belongs to the hidden toolbar.'
            assert page.locator('.basketball-score-strip').is_visible()
            assert page.locator('.firing-range-telemetry .firing-range-strip').is_visible()
            assert page.locator('[data-target-score]').is_visible(), 'Targets remain readable even when that row was collapsed.'
            for side in ['left', 'right']:
                stick = page.locator(f'[data-thumbstick="{side}"] .thumbstick-base')
                assert stick.is_visible()
                box = stick.bounding_box()
                assert box and 0 <= box['x'] and box['x'] + box['width'] <= width + 1, (width, side, box)
            box = settings.bounding_box()
            assert box and box['width'] == 44 and box['height'] == 44 and box['y'] == 8
            assert settings.evaluate('(node)=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===node||node.contains(hit);}')
            assert page.locator('.house-stage button,.house-control-dock button').count() == settings_count, 'No extra show/hide button is added.'
            # Snapshots continue changing the score while their action controls stay hidden.
            page.evaluate('''() => {
                basketballState.homeScore=15;basketball.render(basketballState,basketballPlayer,true,{me:basketballPlayer});
                rangeState.participants.me.score=60;range.render(rangeState,'me',true);actionFixture.stage.classList.remove('basketball-world','firing-range-world');
                const road=document.createElement('section');road.className='road-vehicle-controls';road.innerHTML='<button>Drive incoming truck</button>';actionFixture.stage.append(road);
                for(const name of ['factory-toggle','prison-toggle','factory-testing-toggle','factory-logistics-toggle','map-quest-launcher']){const button=document.createElement('button');button.className=name;button.textContent=name;actionFixture.stage.append(button);}
            }''')
            page.wait_for_function('document.querySelector(".game-display-flow>.road-vehicle-controls") !== null')
            assert page.locator('.road-vehicle-controls').is_hidden(), 'Incoming controls inherit hidden preference.'
            assert page.locator('.basketball-score-strip [data-home]').inner_text() == '15'
            assert page.locator('.firing-range-telemetry [data-self-score]').inner_text() == '60 pts'
            settings.click()
            assert toggle.is_checked()
            assert page.evaluate('savedSettings.hideActionBars') is True
            page.get_by_role('button', name='Reset preferences', exact=True).click()
            assert not toggle.is_checked()
            assert page.locator('.house-bottom-controls').bounding_box()['height'] == 52
            assert page.locator('[data-target-score]').is_hidden(), 'Original row collapse is preserved.'
            assert page.locator('.fitness-toggle').is_hidden() and page.locator('.fitness-toggle').evaluate('(node)=>node.hidden')
            assert page.locator('.road-vehicle-controls').is_visible()
            page.wait_for_function('''()=>{const row=document.querySelector('.game-display-flow-views');return row.scrollWidth<=row.clientWidth+1;}''')
            if width < 760:
                assert page.locator('.game-view-more').is_visible(), 'Restored toolbar must refit incoming buttons into its overflow menu.'
            page.get_by_role('button', name='Return to game', exact=True).click()
            settings.click()
            assert toggle.is_checked(), 'Reopening settings restores saved hidden bars after a reset preview.'
            page.get_by_role('button', name='Return to game', exact=True).click()
            # Hidden bars retain the existing fullscreen exit and Settings control.
            page.evaluate('''async()=>{const button=document.querySelector('.game-viewport-toggle');await actionFixture.shell.requestFullscreen();button.setAttribute('aria-pressed','true');}''')
            page.wait_for_function('document.fullscreenElement !== null')
            assert settings.is_visible() and page.locator('.game-viewport-toggle').is_visible()
            assert page.locator('.house-bottom-controls').bounding_box()['height'] == 0
            settings.click()
            assert toggle.is_checked()
            toggle.uncheck()
            page.get_by_role('button', name='Save settings', exact=True).click()
            page.wait_for_function('settingsWrites.length===2')
            page.get_by_role('button', name='Return to game', exact=True).click()
            page.evaluate('document.exitFullscreen()')
            page.wait_for_function('document.fullscreenElement === null')
            assert page.locator('.house-bottom-controls').bounding_box()['height'] == 52
            assert page.locator('.nearby-gameplay-actions').is_visible()
            assert page.locator('.rad-tox-fire-trigger').is_visible()
            assert page.locator('.basketball-hud .sports-action-modes').first.is_visible()
            assert page.locator('.fitness-toggle').is_hidden()
            assert page.locator('[data-target-score]').is_hidden()
            settings.click()
            assert not toggle.is_checked(), 'Saving visible bars persists across settings reopen.'
            assert not errors, (width, errors)
            page.close()
        browser.close()
    print('Action bar settings passed at 320, 390 and 1280px: live scores, sticks, hidden rows, incoming controls, save/reset/reopen and fullscreen Settings access.')
finally:
    server.shutdown()
