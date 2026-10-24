"""Touch boarding feedback, free map access, live controls and voiced objectives."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
Thread(target=server.serve_forever,daemon=True).start()
fixture='''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;background:#182c35;color:white}main{height:100vh;position:relative}canvas{width:100%;height:100%}
.game-display-flow{position:fixed;bottom:10px;left:10px;z-index:2000}#move{width:100px;height:44px}
.district-map-toggle{position:fixed!important;top:12px!important;left:12px!important;bottom:auto!important}
</style><main><canvas tabindex="0"></canvas><div class="game-display-flow"><button id="move">Move forward</button></div></main>'''
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader'])
        for width,height in [(390,844),(1280,900)]:
            page=browser.new_page(viewport={'width':width,'height':height},has_touch=True)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.route('**/__open_travel',lambda route:route.fulfill(body=fixture,content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/__open_travel')
            page.evaluate('''async()=>{
              const {airportWorld}=await import('/airport-world.mjs'),{mountDistrictMap}=await import('/public/js/district-map.js');
              const {gameplayOverlayOpen}=await import('/public/js/game-menu-controls.js');
              const {createGameplayAnnouncements}=await import('/public/js/gameplay-announcements.js');
              window.spoken=[];window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
              Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{resume(){},cancel(){},getVoices:()=>[],speak(call){spoken.push(call.text);queueMicrotask(()=>call.onend?.());}}});
              window.announcer=createGameplayAnnouncements();document.addEventListener('pointerdown',()=>announcer.unlock(),true);
              window.moves=0;window.walkKeys=[];document.querySelector('#move').onclick=()=>moves++;
              window.addEventListener('keydown',event=>{if(event.key==='w'&&!gameplayOverlayOpen())walkKeys.push(event.key);});
              window.blocked=gameplayOverlayOpen;window.world=airportWorld();window.commands=[];window.fail=false;
              const actors=Object.fromEntries(world.builderScene.objects.map(object=>[object.id,{...object,active:true}]));
              actors['airport-flight-1'].holderId='pilot';actors['airport-flight-2'].holderId='other';
              window.live={serverTime:100000,actors,players:{pilot:{id:'pilot',vehicleId:'airport-flight-1',health:100,position:{x:-18,y:.4,z:62}}}};
              window.map=mountDistrictMap({stage:document.querySelector('main'),fetchAtlas:async()=>({locations:[{mapId:'another-public-world',name:'Other public world',districtId:'different-district'},{mapId:'private-world',name:'Private world',visibility:'private'}]}),command:async(action,fields)=>{
                commands.push({action,...fields});if(fail)return false;
                return new Promise(resolve=>window.completeSelection=()=>{live.players.pilot.vehicleId=fields.entityId;actors['airport-flight-1'].holderId=null;actors[fields.entityId].holderId='pilot';map.updateLive(live,'pilot');resolve({selfId:'pilot',players:live.players,actors,result:{message:'Vehicle ready. Controls open.'}});});
              }});
              map.setReady(false);map.update(world);map.updateLive(live,'pilot');
            }''')
            page.wait_for_function("[...document.styleSheets].some(sheet=>sheet.href?.includes('district-map.css'))")
            assert page.locator('.district-map-toggle').is_visible()
            page.locator('.district-map-toggle').tap()
            page.get_by_role('link',name='Enter Other public world',include_hidden=True).wait_for(state='attached')
            assert page.get_by_role('link',name='Enter Other public world',include_hidden=True).count()==1
            assert page.get_by_role('link',name='Enter Private world',include_hidden=True).count()==0
            own=page.get_by_role('button',name='Open vehicle controls',exact=True)
            assert own.is_enabled()
            assert page.get_by_role('button',name='Occupied',exact=True).is_disabled()
            page.evaluate("window.firstFootprint=document.querySelector('[data-live-footprints] rect');map.updateLive(structuredClone(live),'pilot')")
            page.wait_for_timeout(80)
            assert page.evaluate("firstFootprint===document.querySelector('[data-live-footprints] rect')"),'static footprints must survive heartbeats'
            page.get_by_role('button',name='Board Piper Cub',exact=False).tap()
            page.wait_for_function("document.querySelector('.game-action-loading')?.dataset.state==='loading'")
            assert page.locator('.game-action-loading').is_visible()
            assert page.locator('.game-action-loading').inner_text().startswith('Loading')
            assert page.evaluate('commands.length')==1,'one touch sends one boarding command'
            assert page.evaluate('!blocked()')
            page.get_by_role('button',name='Move forward',exact=True).tap()
            page.keyboard.press('w')
            assert page.evaluate('moves===1&&walkKeys.length===1')
            page.evaluate('completeSelection()')
            page.wait_for_function("document.querySelector('.game-action-loading').dataset.state==='ready'")
            assert not page.locator('.district-map-dialog').is_visible(),'boarding exposes the vehicle controls'
            assert page.locator('.district-map-toggle').is_enabled()
            page.locator('.district-map-toggle').tap()
            page.evaluate('fail=true')
            page.get_by_role('button',name='Board Blackwing Corsair',exact=False).tap()
            page.wait_for_function("document.querySelector('.game-action-loading').dataset.state==='error'")
            assert page.get_by_role('button',name='Board Blackwing Corsair',exact=False).is_enabled(),'failed request releases the loading latch'
            page.evaluate('''()=>{
              live.players.pilot.vehicleMission={instanceId:'supply',title:'Mountain supply flight',status:'active',index:0,checkpoints:[{name:'Load supplies'},{name:'Fly to the mountain camp'}]};
              live.actors.ranger={id:'ranger',active:true,position:{x:-17,y:.4,z:62},resident:{name:'Rowan',role:'Ranger',task:'Preparing trail supplies.'}};
              announcer.update(live,'pilot',world);announcer.update(live,'pilot',world);
              live.players.pilot.vehicleMission.index=1;announcer.update(live,'pilot',world);
            }''')
            page.wait_for_function("spoken.some(text=>text.includes('Fly to the mountain camp'))")
            assert page.evaluate("spoken.filter(text=>text.includes('Load supplies')).length") == 1
            assert page.evaluate("spoken.some(text=>text.includes('Rowan'))")
            assert not errors,errors
            page.screenshot(path=f'/workspace/open-travel-feedback-{width}.png')
            print({'viewport':[width,height],'loading':'immediate','movement':'available','boarding':'one tap','audio':'automatic'},flush=True)
            page.close()
        browser.close()
finally:
    server.shutdown()
