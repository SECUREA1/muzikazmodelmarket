"""Quest prompts remain nonmodal and use the authoritative command paths."""
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
        for width, height in [(390, 844), (844, 390), (1280, 800)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.evaluate('''async()=>{
              document.body.innerHTML='<main class="house-stage" style="position:fixed;inset:0"><canvas id="game" tabindex="0" style="width:100%;height:100%"></canvas><button id="left" style="position:absolute;left:20px;bottom:24px;width:82px;height:82px">Move</button><button id="right" style="position:absolute;right:20px;bottom:24px;width:82px;height:82px">Look</button></main>';
              const {mountMapQuestPrompts}=await import('/public/js/map-quest-prompts.js');
              const {mountGameDisplayFlow}=await import('/public/js/game-display-flow.js');
              const stage=document.querySelector('main');
              if(innerWidth<600)window.flow=mountGameDisplayFlow(stage);
              const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');window.blocked=()=>gameplayOverlayOpen();
              window.commands=[];window.releases=[];window.gameKeys=[];
              document.addEventListener('muzikaz:release-game-input',event=>releases.push(event.detail.reason));
              window.addEventListener('keydown',event=>gameKeys.push(event.key));
              window.environment={id:'test-garden',name:'Garden & <script>unsafe</script>'};
              window.offers=[{id:'garden-tour',title:'Garden discovery',siteQuest:true,mode:'foot',kind:'site-tour',description:'Visit the garden sites.',reward:100,timeLimit:600},{id:'garden-work',title:'Garden service',siteQuest:true,mode:'foot',kind:'site-job',description:'Speak to your actual guide.',reward:150,timeLimit:600}];
              window.snapshot={serverTime:10000,actors:{},players:{p:{id:'p',health:100,position:{x:0,y:0,z:0}}},questOffers:offers};
              window.ui=mountMapQuestPrompts({stage:document.querySelector('main'),command:async(action,fields)=>{commands.push({action,...fields});if(window.deferNext){window.deferNext=false;return await new Promise(resolve=>window.finishDeferred=resolve);}return {result:{message:'Confirmed by server'}};}});
              if(!window.flow)window.flow=mountGameDisplayFlow(stage);
              for(const name of ['game-camera-toggle','district-map-toggle','factory-toggle','fitness-toggle','ski-resort-toggle','airport-ops-toggle','harbor-ops-toggle','game-viewport-toggle']){const control=document.createElement('button');control.className=name;control.setAttribute('aria-label',name);control.textContent=name;stage.append(control);}
              document.querySelector('#game').focus();ui.update(snapshot,'p',environment);
            }''')
            card = page.get_by_role('region', name='Local quests and challenges', exact=True)
            assert card.is_visible()
            page.wait_for_selector('.game-display-flow-views > .map-quest-launcher')
            page.wait_for_function('''()=>{const button=document.querySelector('.map-quest-launcher'),row=document.querySelector('.game-display-flow-views');return button.parentElement===row&&button.getBoundingClientRect().width===44&&row.scrollWidth<=row.clientWidth+1;}''')
            launcher=page.locator('.map-quest-launcher')
            assert launcher.locator('svg').count()==1
            assert launcher.inner_text()==''
            assert launcher.get_attribute('title')=='Quests and challenges'
            assert launcher.get_attribute('aria-controls')==card.get_attribute('id')
            button_box=launcher.bounding_box()
            assert 0<=button_box['y']<12 and button_box['height']==44,button_box
            assert launcher.evaluate('button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("button")===button;}')
            assert page.locator('.map-quest-prompts .map-quest-launcher').count()==0,'Only the shared top shelf owns the quest control.'
            assert page.evaluate('document.activeElement.id') == 'game', 'Automatic offer must not steal gameplay focus.'
            assert not page.evaluate('blocked()')
            assert page.evaluate('releases') == [], 'Snapshot updates must not clear fresh movement.'
            assert page.locator('.map-quest-world').inner_text() == 'Garden & <script>unsafe</script>'
            for control in ['#left', '#right']:
                assert page.locator(control).evaluate('node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;}'), (width, height, control)
            page.evaluate("window.oldSelect=document.querySelector('.map-quest-card select');for(let i=0;i<20;i++)ui.update({...snapshot,serverTime:10000+i*50},'p',environment)")
            assert page.evaluate("document.querySelector('.map-quest-card select')===oldSelect"), 'Snapshots must preserve native selection controls.'
            card.get_by_label('Choose local challenge', exact=True).select_option('garden-work')
            card.locator('[data-quest-accept]').click()
            assert page.evaluate('commands') == [{'action': 'vehicle-mission', 'operation': 'start', 'questId': 'garden-work'}]
            assert page.evaluate('releases.at(-1)') == 'quest-start'
            page.evaluate('''()=>{
              snapshot.players.p.vehicleMission={instanceId:'instance-1',questId:'garden-work',title:'Garden service',siteQuest:true,status:'active',ready:true,index:0,startedAt:10000,deadline:610000,reward:150,checkpoints:[{name:'Park guide',entityId:'guide',action:'interact',prompt:'Talk to the park guide',x:2,y:0,z:0}]};
              ui.update(snapshot,'p',environment);
            }''')
            assert page.locator('.map-quest-launcher svg').count()==1
            assert page.locator('.map-quest-count').inner_text()=='1'
            assert card.locator('[data-quest-confirm]').count() == 0
            card.get_by_role('button', name='Talk to the park guide', exact=True).click()
            assert page.evaluate('commands.at(-1)') == {'action': 'interact', 'entityId': 'guide'}
            page.evaluate("snapshot.players.p.vehicleMission.checkpoints[0].action='check-in';ui.update(snapshot,'p',environment)")
            card.get_by_role('button', name='Confirm check-in', exact=True).click()
            assert page.evaluate('commands.at(-1)') == {'action': 'vehicle-mission', 'operation': 'interact'}
            card.get_by_role('button', name='Close local quests', exact=True).click()
            assert not card.is_visible()
            page.evaluate("for(let i=0;i<20;i++)ui.update(snapshot,'p',environment)")
            assert not card.is_visible(), 'A dismissed active quest must stay dismissed on snapshots.'
            page.locator('.map-quest-launcher').click()
            card.get_by_role('button', name='Close local quests', exact=True).focus()
            page.keyboard.press('w')
            page.keyboard.press('Space')
            assert page.evaluate('gameKeys.slice(-2)') == ['w', ' ']
            assert card.is_visible(), 'Jump must not click a focused close button.'
            page.keyboard.press('Escape')
            assert not card.is_visible()
            page.evaluate("snapshot.players.p.vehicleMission.status='completed';snapshot.players.p.vehicleMission.message='Complete · +150 score';ui.update(snapshot,'p',environment)")
            assert card.get_by_role('heading', name='Challenge complete', exact=True).is_visible()
            card.get_by_role('button', name='Close local quests', exact=True).click()
            page.evaluate("for(let i=0;i<20;i++)ui.update(snapshot,'p',environment)")
            assert not card.is_visible(), 'A completion result should appear once per assignment.'
            page.evaluate("delete snapshot.players.p.vehicleMission;environment={id:'new-map',name:'Harbor'};ui.update(snapshot,'p',environment)")
            assert card.is_visible() and card.get_by_role('heading', name='Local quests & challenges', exact=True).is_visible()
            page.evaluate("snapshot.players.p.mapQuestProgress={worldId:'new-map',completed:{'garden-tour':{count:2,bestMs:83400}}};ui.update(snapshot,'p',environment)")
            assert card.locator('.map-quest-completion').inner_text() == 'Completed 2 times · Best 1:23'
            page.evaluate('window.deferNext=true')
            card.locator('[data-quest-accept]').click()
            page.evaluate("environment={id:'third-map',name:'Airport'};ui.update(snapshot,'p',environment);finishDeferred({result:{message:'An old world answered'}})")
            assert card.locator('.map-quest-feedback').inner_text() == ''
            assert card.locator('[data-quest-accept]').is_enabled(), 'An old request must not leave a new map busy.'
            assert card.locator('.map-quest-completion').count() == 0
            page.evaluate("snapshot.players.p.localQuests=true;ui.update(snapshot,'p',environment)")
            assert 'Solo practice' in card.locator('.map-quest-world').inner_text()
            assert '100 practice score' in card.inner_text() and '100 world score' not in card.inner_text()
            assert not page.evaluate('blocked()')
            page.evaluate('ui.dispose();flow.dispose()')
            assert page.locator('.map-quest-prompts').count() == 0
            assert page.locator('.map-quest-launcher').count() == 0
            assert not errors, errors
            page.close()
        browser.close()
    print('Quest prompts: safe map text, explicit acceptance, actual object actions, stable controls, once-only popups and usable mobile movement passed.')
finally:
    server.shutdown()
