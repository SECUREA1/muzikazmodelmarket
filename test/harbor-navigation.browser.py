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

def assert_buttons_fit(root):
    result = root.evaluate('''root => {
      const bounds=root.getBoundingClientRect(),buttons=[...root.querySelectorAll('button')].filter(button=>button.getClientRects().length);
      const boxes=buttons.map(button=>({label:button.getAttribute('aria-label')||button.textContent,rect:button.getBoundingClientRect()}));
      const small=boxes.filter(({rect})=>rect.width<43.5||rect.height<43.5).map(({label})=>label);
      const outside=boxes.filter(({rect})=>rect.left<bounds.left-.5||rect.right>bounds.right+.5).map(({label})=>label);
      const overlap=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i].rect,b=boxes[j].rect;if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5)overlap.push([boxes[i].label,boxes[j].label]);}
      return {small,outside,overlap,horizontal:root.scrollWidth>root.clientWidth+1};
    }''')
    assert not any(result.values()), result

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width, height in [(320,568),(390,844),(844,390),(1280,800)]:
            page = browser.new_page(viewport={'width':width,'height':height})
            page.set_default_timeout(6000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
            page.wait_for_selector('body[data-ready=true]')
            page.evaluate('''async () => {
              const {mountHarborOperations}=await import('/public/js/harbor-operations.js');
              const {harborDestinations}=await import('/public/js/harbor-destinations.js');
              const {neonMarina}=await import('/neon-marina.mjs');
              const source=neonMarina(),stage=document.querySelector('.house-stage');
              for(const panel of stage.querySelectorAll('.basketball-hud,.basketball-aim'))panel.hidden=true;
              window.env={id:'neon-marina',name:'Neon Marina',builderScene:{objects:source.objects,layoutMeta:{harbor:source.harbor,locations:source.locations}}};
              window.commands=[];window.inputs=[];window.resolveExit=null;window.holdNextRoute=false;window.resolveRoute=null;
              window.snapshot={players:{pilot:{id:'pilot',username:'Pilot',health:100,fuel:100,vehicleId:'boat',position:{x:144,y:.35,z:20.6}},peer:{id:'peer',username:'Other captain',health:100,position:{x:145,y:0,z:45}}},actors:{boat:{id:'boat',modelId:'harbor-skiff',active:true,health:200,holderId:'pilot',position:{x:144,y:0,z:20.6},rotation:{y:-Math.PI/2},boating:{speed:0,speedKnots:0,anchor:true,heading:90}}}};
              const command=async(action,fields={})=>{
                commands.push({action,...fields});
                if(action==='interact')return new Promise(resolve=>{window.resolveExit=()=>{snapshot.players.pilot.vehicleId=null;ops.update(snapshot,'pilot',env);resolve(structuredClone(snapshot));};});
                if(action==='vehicle-action'){
                  if(fields.mode==='navigate'&&holdNextRoute){holdNextRoute=false;await new Promise(resolve=>{window.resolveRoute=resolve;});}
                  const state=snapshot.actors.boat.boating;
                  if(fields.mode==='cancel'){Object.assign(state,{assist:null,assistStage:null,navigationDestinationId:null,navigationName:null});}
                  else if(['auto','launch','navigate'].includes(fields.mode)){
                    const id=fields.destinationId||'open-water',destination=harborDestinations(env).find(place=>place.id===id);
                    Object.assign(state,{anchor:false,assist:fields.mode==='navigate'?'navigate':'launch',assistStage:fields.mode==='navigate'?'passage':'departure',navigationDestinationId:id,navigationName:destination.name,remainingDistance:fields.mode==='navigate'?155:120,routeIndex:0,routeLength:3});
                  }
                }
                return {...structuredClone(snapshot),result:{message:'Shared helm action accepted.'}};
              };
              window.ops=mountHarborOperations({stage,command,onInput:()=>inputs.push({ahead:ops.ahead,...ops.inputs(0)})});
              ops.updateEnvironment(env);ops.update(snapshot,'pilot',env);
            }''')
            panel = page.locator('.harbor-helm-controls')
            readings = panel.get_by_label('Boat navigation readings')
            auto = panel.locator('.harbor-primary-action')
            initial_readings = readings.inner_text()
            assert readings.is_visible() and auto.is_visible()
            assert panel.locator('.harbor-boat-functions').is_hidden()
            assert panel.locator('button:visible').count() == 2
            auto.click()
            page.wait_for_function("snapshot.actors.boat.boating.assist==='launch'")
            assert page.evaluate('commands.at(-1).mode') == 'auto'
            marker = panel.get_by_label('Sailing destination',exact=True)
            assert marker.is_visible() and 'Open water' in marker.inner_text()
            assert readings.inner_text() == initial_readings
            assert_buttons_fit(panel)

            page.get_by_role('button', name='Show boat functions', exact=True).click()
            page.get_by_role('button',name='Open boat instruments',exact=True).click()
            helm = page.get_by_role('dialog',name='Harbor navigation and helm',exact=True)
            helm.get_by_role('slider',name='Boat throttle',exact=True).fill('35')
            assert page.evaluate('ops.inputs(0).throttle') == .35
            helm.get_by_role('button',name='Close',exact=True).click()
            page.evaluate('holdNextRoute=true')
            page.get_by_role('button', name='Choose sailing destination', exact=True).click()
            dialog = page.get_by_role('dialog', name='Sailing destinations', exact=True)
            assert dialog.is_visible()
            assert dialog.get_by_role('button', name='Sail to Beacon Island', exact=True).is_visible()
            assert dialog.get_by_role('button', name='Sail to Palm Key', exact=True).is_visible()
            assert dialog.get_by_role('button', name='Sail to North Haven', exact=True).is_visible()
            assert dialog.get_by_role('button', name='Sail to Neon Marina', exact=True).is_visible()
            assert dialog.evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), (width,height)
            assert_buttons_fit(dialog)
            dialog.get_by_role('button', name='Sail to Beacon Island', exact=True).click()
            assert dialog.is_hidden()
            assert page.evaluate('ops.inputs(0).throttle===undefined')
            assert page.evaluate('ops.inputs(0).sailTrim===undefined&&ops.inputs(0).anchor===undefined')
            assert auto.is_disabled()
            page.evaluate('resolveRoute()')
            page.wait_for_function("snapshot.actors.boat.boating.navigationDestinationId==='beacon-island'")
            assert page.evaluate('commands.at(-1).action') == 'vehicle-action'
            assert page.evaluate('commands.at(-1).mode') == 'navigate'
            assert page.evaluate('commands.at(-1).destinationId') == 'beacon-island'
            assert 'Beacon Island' in marker.inner_text() and '155 m' in marker.inner_text()
            page.get_by_role('button', name='Hide boat functions', exact=True).click()
            assert readings.is_visible() and readings.inner_text() == initial_readings
            assert marker.is_visible() and auto.is_visible()
            assert panel.locator('.harbor-boat-functions').is_hidden()
            assert panel.locator('button:visible').count() == 2
            assert_buttons_fit(panel)

            page.get_by_role('button', name='Show boat functions', exact=True).click()
            page.get_by_role('button', name='Choose sailing destination', exact=True).click()
            assert dialog.get_by_role('button',name='Sail to Beacon Island',exact=True).get_attribute('aria-pressed') == 'true'
            assert dialog.locator('circle[fill="#ffd37d"]').count() == 1
            dialog.get_by_role('button',name='Close',exact=True).click()
            page.get_by_role('button',name='Manual boat control',exact=True).click()
            page.wait_for_function("snapshot.actors.boat.boating.assist===null")
            assert page.evaluate('commands.at(-1).mode') == 'cancel'
            assert marker.is_hidden()
            ahead = page.get_by_role('button',name='Ahead boat',exact=True)
            ahead.press('Enter')
            assert page.evaluate('inputs.some(value=>value.ahead===1)')
            assert page.evaluate('ops.ahead') == 0

            exit_button = page.get_by_role('button',name='Leave stopped boat',exact=True)
            exit_button.evaluate('(button)=>{button.click();button.click();}')
            assert page.evaluate("commands.filter(command=>command.action==='interact').length") == 1
            page.evaluate("ops.update(snapshot,'pilot',env)")
            assert exit_button.is_disabled()
            exit_button.evaluate("(button)=>button.dispatchEvent(new MouseEvent('click',{bubbles:true}))")
            assert page.evaluate("commands.filter(command=>command.action==='interact').length") == 1
            page.evaluate('resolveExit()')
            page.wait_for_function("snapshot.players.pilot.vehicleId===null")
            assert panel.is_hidden()
            assert page.evaluate('Object.keys(snapshot.players).length') == 2
            assert page.locator('dialog[open]').count() == 0
            assert not errors, errors
            page.close()
        browser.close()
finally:
    server.shutdown()

print('Mobile harbor departure, destination highlights, persistent compact information, manual overrides and single pending exit passed.')
