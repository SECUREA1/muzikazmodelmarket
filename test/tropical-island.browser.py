"""Play the resort through the real shared world, AI and quest server.

Run after npm run build: python3 test/tropical-island.browser.py
The guest session, room commands, island scene and world controls are production
code. Map travel uses the same validated map-access action as the real map UI.
Independent 120-second expiry is covered by server/rules tests; this browser test
checks authoritative intake and projection without replacing the server clock.
"""
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import uuid
from urllib.request import urlopen

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/tmp/tropical-island-previews')
ARTIFACTS.mkdir(exist_ok=True)
WORLD = 'tropical-island'
os.chdir(ROOT)


def available(locator):
    assert locator.is_visible(), str(locator)
    assert locator.evaluate('''element=>{
      const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width>0&&r.height>0&&r.x>=-1&&r.y>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&
        (hit===element||element.contains(hit));
    }'''), 'Control is covered or outside the viewport: '+str(locator)


def run_checks(browser, base, directory, *, mobile=False):
    context = browser.new_context(
        service_workers='block', viewport={'width':390 if mobile else 1280,'height':844 if mobile else 900},
        is_mobile=mobile, has_touch=True, device_scale_factor=.8, reduced_motion='reduce' if mobile else 'no-preference',
    )
    page = context.new_page()
    page.set_default_timeout(20000)
    errors, joins, actions = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def request_sent(request):
        if request.method=='POST' and '/gameplay' in request.url:
            body=request.post_data_json or {}
            actions.append(body.get('action'))
            if body.get('action')=='join': joins.append(body)
    page.on('request',request_sent)
    page.on('console',lambda message:errors.append(message.text) if message.type=='error' and any(marker in message.text for marker in ['Shader Error','VALIDATE_STATUS','program not valid']) else None)
    page.route('https://**/*',lambda route:route.abort())
    assert context.request.post(base+'/api/access/guest',data={}).status==201
    csrf=context.request.get(base+'/api/game/room-session').json()['data']['csrfToken']

    def command(action,**fields):
        response=context.request.post(base+'/api/rooms/'+WORLD+'/gameplay',headers={'X-CSRF-Token':csrf},data={'action':action,'requestId':str(uuid.uuid4()),**fields})
        assert response.ok,(action,response.status,response.text())
        return response.json()['data']

    def room():
        response=context.request.get(base+'/api/rooms/'+WORLD+'/gameplay')
        assert response.ok,response.text()
        return response.json()['data']

    def state():return page.evaluate('window.MuzikazHouseExplorer.snapshot()')
    def self_state():
        value=room()
        return value['players'][state()['serverSelfId']]
    def travel(x,z):
        result=command('map-access',position={'x':x,'z':z})
        target=result['players'][result['selfId']]['position']
        page.wait_for_function('(target)=>{const p=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(p[0]-target.x,p[2]-target.z)<1.5}',arg=target,timeout=30000)
        return target
    def close_companions():
        for selector in ['.map-quest-card [aria-label="Close local quests"]','.world-resident-panel [data-close]','.district-map-dialog>header button']:
            button=page.locator(selector).filter(visible=True)
            if button.count():button.first.click()

    try:
        # The old URL is a compatibility entry, never a second solo game loop.
        page.goto(base+'/tropical-island.html?environment=tropical-island&mode=multiplayer&autoplay=1',wait_until='domcontentloaded',timeout=90000)
        page.wait_for_url('**/model-explorer.html?**',timeout=30000)
        page.wait_for_function('''()=>{const s=window.MuzikazHouseExplorer?.snapshot();return s?.controlsReady&&s.serverReady&&s.serverPlayerInitialized;}''',timeout=180000)
        live=state()
        assert live['roomId']==WORLD and live['serverHostedRoom'] and live['localQuests'] is None,live
        assert page.locator('#house-explorer-canvas').is_visible()
        assert page.locator('[data-thumbstick="left"] .thumbstick-base').count()==1
        assert page.locator('[data-thumbstick="right"] .thumbstick-base').count()==1
        assert page.locator('[data-rad-pack-toggle]').count()==1,'the native shared Backpack must remain available'
        assert page.locator('#start-button').count()==0,'the old independent island control loop must not load'
        assert joins and not joins[-1].get('residentWalkthrough',False),joins
        value=room(); own=value['players'][live['serverSelfId']]
        residents=[a for a in value['actors'].values() if a.get('resident') and a.get('active',True)]
        assert len(residents)>=4,[(a['id'],a.get('resident')) for a in residents]
        assert all(a['resident'].get('personality') and a['resident'].get('context') for a in residents)
        offers=value.get('questOffers',[])
        assert {'map:tropical-island:tour','map:tropical-island:challenge','map:tropical-island:service'}.issubset({q['id'] for q in offers}),offers
        assert own['radToxEnabled'] is False and not value.get('radTox')
        assert own.get('island') is not None,'the shared server publishes resort progress'
        boats={a['id']:a for a in value['actors'].values() if a.get('modelId') in ['resort-paddle-boat','resort-pontoon']}
        assert len(boats)==3,boats

        close_companions()
        # Keyboard/touch steering uses the standard native movement contract.
        canvas=page.locator('#house-explorer-canvas');canvas.scroll_into_view_if_needed();canvas.focus()
        before=state()['player']['position']
        if mobile:
            stick=page.locator('[data-thumbstick="left"] .thumbstick-base');available(stick)
            rect=stick.bounding_box();page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']/2);page.mouse.down();page.mouse.move(rect['x']+rect['width']/2,rect['y']+rect['height']*.18,steps=3)
        else:page.keyboard.down('w')
        try:page.wait_for_function('(p)=>{const q=MuzikazHouseExplorer.snapshot().player.position;return Math.hypot(q[0]-p[0],q[2]-p[2])>.35}',arg=before,timeout=15000)
        finally:
            if mobile:page.mouse.up()
            else:page.keyboard.up('w')
        previous=state()['cameraMode'];canvas.focus();page.keyboard.press('v')
        page.wait_for_function('(previous)=>MuzikazHouseExplorer.snapshot().cameraMode!==previous',arg=previous)
        page.screenshot(path=str(ARTIFACTS/('native-mobile-resort.png' if mobile else 'native-desktop-resort.png')))

        # The actual shared map contains locations, vehicles, quests and routes.
        map_button=page.locator('.district-map-toggle');available(map_button);map_button.click()
        map_dialog=page.locator('.district-map-dialog');map_dialog.wait_for(state='visible')
        for section in ['locations','vehicles','quests','destinations']:
            map_dialog.locator('[data-map-view="'+section+'"]').click()
            assert map_dialog.get_attribute('data-map-section')==section
            if section=='locations':assert 'tiki tide' in map_dialog.text_content().lower() and 'horizon point' in map_dialog.text_content().lower()
            if section=='vehicles':assert 'paddle' in map_dialog.text_content().lower() and 'pontoon' in map_dialog.text_content().lower()
            if section=='quests':assert map_dialog.locator('.local-map-quests article').count()>=2
            if section=='destinations':
                page.wait_for_function('document.querySelector(".district-map-dialog [data-map-section=destinations] a")')
                assert map_dialog.locator('[data-map-section="destinations"] a').count()>=1
        map_dialog.locator('header').get_by_role('button',name='Close',exact=True).click()
        assert not state()['player']['inputBlocked']
        if mobile:
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
            assert not errors,errors
            print(json.dumps({'view':'mobile','sharedController':True,'mapSections':5,'residents':len(residents),'browserErrors':errors}),flush=True)
            return

        # Accept and advance a real server quest at the authored arrival point.
        travel(0,24)
        page.locator('.map-quest-launcher').click()
        quest=page.locator('.map-quest-card');quest.wait_for(state='visible')
        quest.locator('select').select_option('map:tropical-island:tour')
        quest.locator('[data-quest-accept]').click()
        page.wait_for_function('MuzikazHouseExplorer.snapshot().serverReady')
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            mission=self_state().get('vehicleMission')
            if mission and mission.get('status')=='active' and mission.get('ready'):break
            time.sleep(.2)
        else:raise AssertionError(('Quest failed to become ready at arrival',self_state().get('vehicleMission')))
        quest.locator('[data-quest-confirm]').click()
        deadline=time.monotonic()+10
        while time.monotonic()<deadline:
            mission=self_state().get('vehicleMission')
            if mission and mission.get('index',0)>=1:break
            time.sleep(.2)
        else:raise AssertionError(('Quest check-in was not authoritative',mission))
        quest.get_by_role('button',name='Cancel quest',exact=True).click();quest.get_by_role('button',name='Close local quests',exact=True).click()

        # Speak through the existing resident conversation and daily-favor UI.
        value=room();current=self_state()['position']
        residents=sorted((a for a in value['actors'].values() if a.get('resident') and a.get('active',True)),key=lambda a:math.hypot(a['position']['x']-current['x'],a['position']['z']-current['z']))
        target=residents[0]['position'];travel(target['x']+1.8,target['z'])
        page.locator('.world-resident-toggle').click()
        panel=page.locator('.world-resident-panel');panel.wait_for(state='visible')
        panel.locator('[data-resident-talk]:enabled').first.click()
        panel.get_by_label('Quest conversation transcript',exact=True).wait_for(state='visible',timeout=20000)
        assert panel.locator('.resident-contact-profile').is_visible()
        assert self_state().get('npcConversation',{}).get('type')=='resident'
        panel.get_by_role('button',name='Close resident conversations',exact=True).click()

        # Server-owned drinks, passport progress and effects from the real bar UI.
        travel(-15,11);canvas.focus();page.keyboard.press('e')
        bar=page.locator('.island-native-dialog');bar.wait_for(state='visible',timeout=15000)
        beer=bar.locator('[data-island-drink="beer"]');beer.click()
        page.wait_for_function('MuzikazHouseExplorer.snapshot().island?.activeDrinks?.length===1',timeout=15000)
        first=self_state()['island']['activeDrinks'][0]
        assert first['remaining']>100 and first['kind']=='beer',first
        page.wait_for_timeout(3000);beer.click()
        page.wait_for_function('MuzikazHouseExplorer.snapshot().island?.activeDrinks?.length===2',timeout=15000)
        drinks=self_state()['island']['activeDrinks']
        assert drinks[0]['id']==first['id'] and drinks[0]['consumedAt']==first['consumedAt'],drinks
        assert drinks[1]['consumedAt']>drinks[0]['consumedAt'],drinks
        bar.locator('[data-island-close]').first.click()
        page.wait_for_function('MuzikazHouseExplorer.snapshot().island?.effects?.strength>.08',timeout=20000)
        assert not state()['player']['inputBlocked']
        page.screenshot(path=str(ARTIFACTS/'native-desktop-buzz.png'))

        # Native vehicle boarding and helm projection, with shared ownership.
        boarded=command('map-access',entityId='island-paddle-boat')
        assert boarded['players'][boarded['selfId']]['vehicleId']=='island-paddle-boat'
        page.wait_for_function('MuzikazHouseExplorer.snapshot().vehicleId==="island-paddle-boat"',timeout=15000)
        page.locator('.harbor-helm-controls').wait_for(state='visible')
        assert page.locator('.harbor-helm-controls').get_by_role('button',name='Exit boat',exact=True).count() or state()['vehicleActive']
        command('interact')
        page.wait_for_function('!MuzikazHouseExplorer.snapshot().vehicleActive',timeout=15000)
        assert 'island-action' in actions and 'vehicle-mission' in actions and 'npc-social' in actions,actions
        assert not errors,errors
        print(json.dumps({'view':'desktop','nativeWorld':True,'residents':len(residents),'questCheckIn':True,'conversation':True,'stackedBeers':2,'nativeBoat':True,'browserErrors':errors}),flush=True)
    except Exception:
        print('Island native diagnostic',json.dumps({'mobile':mobile,'url':page.url,'errors':errors,'joins':joins,'actions':actions,'native':page.evaluate('({snapshot:window.MuzikazHouseExplorer?.snapshot(),status:document.querySelector("#house-status")?.textContent})')}),flush=True)
        page.screenshot(path=str(ARTIFACTS/('native-mobile-failure.png' if mobile else 'native-desktop-failure.png')),timeout=20000)
        print('Server diagnostic',Path(directory,'server.log').read_text()[-4000:],flush=True)
        raise
    finally:context.close()


with socket.socket() as probe:
    probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
base=f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='native-island-') as directory:
    with open(Path(directory)/'server.log','w') as log:
        server=subprocess.Popen(['node','server.mjs'],env={**os.environ,'PORT':str(port),'MUZIKAZ_DATA_DIR':directory},stdout=log,stderr=log)
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
                try:
                    for _ in range(150):
                        try:
                            if urlopen(base+'/api/health',timeout=1).status==200:break
                        except Exception:time.sleep(.1)
                    else:raise AssertionError('Server startup failed: '+Path(directory,'server.log').read_text()[-3000:])
                    run_checks(browser,base,directory)
                    run_checks(browser,base,directory,mobile=True)
                finally:browser.close()
        finally:
            server.terminate()
            try:server.wait(timeout=10)
            except subprocess.TimeoutExpired:server.kill();server.wait(timeout=5)
