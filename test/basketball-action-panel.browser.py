"""Exercise the production basketball dock and aim dialogs on desktop/mobile.

Run: python3 test/basketball-action-panel.browser.py
The temporary HTTP fixture mocks action callbacks, not the actual HUD modules.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

FIXTURE = '''<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#35412b}#stage{position:relative;height:100vh;width:100vw}.house-stage button{width:100%}</style>
<main id="stage" class="house-stage"><span class="game-live-connection">Live · 10 players</span><button class="builder-nearby-action">Duplicate catch</button></main>
<script type="module">
import {mountBasketballHud} from '/js/basketball-hud.js';
import {mountBasketballAim} from '/js/basketball-aim.js';
window.actions=[];window.selected=[];window.openCount=0;window.deferPrimary=false;
window.game={state:'ready',homeScore:0,awayScore:0,clockMs:720000,shotClockMs:24000,quarter:1,settings:{teamSize:5,quarters:4,quarterMinutes:12,homeHumans:1,awayHumans:0,aiDifficulty:3},lastPlay:'Ready for tip-off.'};
window.player={id:'self',basketballTeam:'home',basketballRole:'player'};
window.enabled=true;window.deferSettings=false;
window.aim=mountBasketballAim({stage,onOpen:()=>openCount++});
window.hud=mountBasketballHud({stage,onOpen:()=>openCount++,onOpenAim:()=>aim.open(),
 onTriggerMode:mode=>{selected.push(mode);hud.setTriggerAction(mode==='auto'?'Grab / catch':mode,mode);},
 onPrimaryAction:async()=>{actions.push({action:'primary',mode:selected.at(-1)||'auto'});if(deferPrimary)await new Promise(resolve=>window.resolvePrimary=resolve);},
 onAction:async(action,fields)=>{actions.push({action,...fields});if(action==='basketball-settings'&&deferSettings)await new Promise(resolve=>window.resolveSettings=resolve);return true;}
});
hud.attachNearbyAction(document.querySelector('.builder-nearby-action'));document.querySelector('.builder-nearby-action').hidden=true;window.nearbyActions=0;document.querySelector('.builder-nearby-action').onclick=()=>nearbyActions++;
window.render=()=>{hud.render(game,player,enabled,{self:player});aim.render({enabled,spectator:player.basketballRole==='spectator',held:false});};
window.hideWorld=()=>{enabled=false;render();};
window.showWorld=()=>{enabled=true;player.basketballRole='player';render();};
render();hud.setTriggerAction('Grab / catch','auto');window.ready=true;
</script>'''

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/fixture'):
            body=FIXTURE.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:
            super().do_GET()
    def log_message(self,*_):
        pass

def run():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=Path(__file__).resolve().parents[1]/'public'))
    Thread(target=server.serve_forever,daemon=True).start();checks=0;errors=[]
    try:
        with sync_playwright() as playwright:
            browser=playwright.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':390,'height':640});page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/fixture?mode=solo');page.wait_for_function('window.ready === true')
            dock=page.locator('.basketball-hud');choices=page.locator('[data-basketball-trigger-mode]');primary=page.locator('[data-basketball-primary]')
            for width,height in [(390,640),(320,568),(1280,800),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                bounds=dock.bounding_box()
                assert bounds['y']>height/2 and bounds['y']+bounds['height']<=height
                assert bounds['x']>=0 and bounds['x']+bounds['width']<=width
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
                for choice in choices.all():
                    box=choice.bounding_box();assert box['height']>=44 and box['width']>=38
                assert page.locator('.builder-nearby-action').is_hidden()
                checks+=1
            page.set_viewport_size({'width':390,'height':640})
            for mode in ['auto','shoot','pass','toss','catch','steal']:
                page.locator(f'[data-basketball-trigger-mode="{mode}"]').click()
                assert page.locator('[data-basketball-trigger-mode][aria-pressed="true"]').count()==1
                assert page.locator(f'[data-basketball-trigger-mode="{mode}"]').get_attribute('aria-pressed')=='true'
                primary.click();assert page.evaluate('actions.at(-1).mode')==mode
                page.evaluate('render()');assert page.locator(f'[data-basketball-trigger-mode="{mode}"]').get_attribute('aria-pressed')=='true'
                checks+=1
            page.evaluate('deferPrimary=true;actions.length=0')
            primary.evaluate('element=>{element.click();element.click()}')
            assert primary.is_disabled() and page.evaluate('actions.length')==1
            page.evaluate('resolvePrimary();deferPrimary=false');page.wait_for_function('!document.querySelector("[data-basketball-primary]").disabled');checks+=1
            collapse=page.locator('[data-basketball-collapse]');collapse.click();assert choices.first.is_hidden();assert collapse.get_attribute('aria-expanded')=='false';assert primary.is_visible()
            collapsed=dock.bounding_box()['height'];collapse.click();assert dock.bounding_box()['height']>collapsed;checks+=1
            page.locator('[data-basketball-lobby]').click();match=page.locator('.basketball-match-menu');assert match.is_visible()
            before=page.evaluate('actions.length');primary.evaluate('el=>el.click()');assert page.evaluate('actions.length')==before
            match.locator('[data-basketball-action="basketball-team"][data-team="away"]').click();assert page.evaluate('actions.at(-1)')=={'action':'basketball-team','team':'away'}
            match.locator('[data-basketball-rules]').click();rules=page.locator('.basketball-rules:not(.basketball-match-menu)');assert rules.is_visible();rules.locator('[name="teamSize"]').select_option('3');rules.locator('[name="homeHumans"]').fill('1');rules.locator('[name="awayHumans"]').fill('0');rules.locator('[data-save-rules]').click();page.wait_for_function('!document.querySelector(".basketball-rules:not(.basketball-match-menu)").open');assert page.evaluate('actions.at(-1).settings.teamSize')==3;checks+=1
            page.locator('[data-basketball-aim]').click();aim=page.locator('dialog.basketball-aim');assert aim.is_visible();assert page.locator('.basketball-aim-toggle').is_hidden()
            aim.locator('[name="basketball-power"]').fill('81');aim.locator('[name="basketball-angle"]').fill('66');aim.locator('[name="basketball-aim-mode"]').select_option('manual');assert page.evaluate('aim.options()')=={'power':.81,'angle':66,'mode':'manual'}
            before=page.evaluate('actions.length');primary.evaluate('el=>el.click()');assert page.evaluate('actions.length')==before
            aim.locator('[data-calibrate]').click();assert page.evaluate('aim.options()')=={'power':.7,'angle':55,'mode':'assisted'}
            page.keyboard.press('Escape');assert aim.is_hidden();checks+=1
            page.locator('[data-basketball-lobby]').click();match.locator('[data-basketball-rules]').click();page.evaluate('deferSettings=true;actions.length=0');rules.locator('[data-start-match]').click();page.wait_for_function('Boolean(window.resolveSettings)')
            page.evaluate('hideWorld();showWorld()');page.locator('[data-basketball-lobby]').click();match.locator('[data-basketball-rules]').click();page.evaluate('resolveSettings();deferSettings=false');page.wait_for_timeout(30)
            assert page.evaluate('actions.map(a=>a.action)')==['basketball-settings'] and rules.is_visible() and rules.locator('[data-start-match]').is_enabled()
            rules.locator('[data-close-rules]').click();checks+=1
            page.evaluate('stage.requestFullscreen()');page.locator('[data-basketball-aim]').click();assert aim.is_visible();assert page.evaluate('document.fullscreenElement === stage');aim.locator('[data-close-aim]').last.click();page.evaluate('document.exitFullscreen()');checks+=1
            page.evaluate('game={...game,state:"live",homeScore:4,awayScore:2,clockMs:709000,shotClockMs:23000};render()');assert page.locator('[data-home]').inner_text()=='4' and page.locator('[data-away]').inner_text()=='2';assert page.locator('[data-clock]').inner_text()=='11:49';assert page.locator('[data-shot]').inner_text()=='23';checks+=1
            page.evaluate('player.basketballRole="spectator";render();document.querySelector(".builder-nearby-action").hidden=false');page.locator('.builder-nearby-action').click();assert page.evaluate('nearbyActions')==1;assert page.locator('.basketball-hud > .builder-nearby-action').is_visible();assert page.locator('[data-basketball-trigger-mode]:disabled').count()==6 and primary.is_disabled();assert page.locator('[data-basketball-lobby]').is_enabled();checks+=1
            page.evaluate('showWorld()');page.locator('[data-basketball-aim]').click();page.evaluate('hideWorld()');assert dock.is_hidden() and aim.is_hidden();assert page.locator('.basketball-aim-toggle').is_hidden();assert page.locator('#stage > .builder-nearby-action').is_visible();page.locator('.builder-nearby-action').click();assert page.evaluate('nearbyActions')==2;checks+=1
            page.evaluate('showWorld()');page.locator('[data-basketball-lobby]').click();page.evaluate('hideWorld()');assert match.is_hidden();checks+=1
            page.evaluate('hud.render(game,null,true)');assert primary.is_disabled();page.locator('.basketball-hud > .builder-nearby-action').click();assert page.evaluate('nearbyActions')==3;page.evaluate('hideWorld()');checks+=1
            assert not errors,errors
            browser.close()
    finally:
        server.shutdown()
    print(f'{checks} basketball dock and aim browser scenarios passed; no runtime errors.')

if __name__=='__main__':run()
