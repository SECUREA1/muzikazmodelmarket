"""Selected map fishing actions preserve their target and enter the local activity."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Thread
from playwright.sync_api import sync_playwright
import os

os.chdir(Path(__file__).resolve().parents[1])

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def do_GET(self):
        if self.path == '/__fishing-map-actions':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'<!doctype html><meta name="viewport" content="width=device-width"><main style="position:relative;width:100%;height:800px"></main>')
        else:
            super().do_GET()

server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
        for width in [390, 1100]:
            page = browser.new_page(viewport={'width': width, 'height': 844})
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/__fishing-map-actions')
            page.evaluate('''async()=>{
              const {mountDistrictMap}=await import('/public/js/district-map.js');
              const {neonMarina}=await import('/neon-marina.mjs');
              const marina=neonMarina();window.env={id:'harbor',name:'Fishing Harbor',builderScene:{objects:marina.objects,layoutMeta:{harbor:marina.harbor,locations:marina.locations}}};
              const boats=marina.objects.filter(actor=>actor.modelId==='harbor-fishing-boat');window.oceanBoat=boats[0].id;
              window.commands=[];window.fishOpens=[];window.state={sequence:1,serverTime:100000,players:{self:{health:100,vehicleId:oceanBoat,position:{...boats[0].position},fishing:{availability:{sides:{port:{canCast:false},starboard:{canCast:false}}}}}},actors:Object.fromEntries(boats.map(actor=>[actor.id,structuredClone(actor)]))};state.actors[oceanBoat].holderId='self';
              window.map=mountDistrictMap({stage:document.querySelector('main'),fetchAtlas:async()=>({locations:[]}),onFishing:fields=>fishOpens.push(fields),command:async(action,fields)=>{
                commands.push({action,...fields});state.sequence++;
                if(action==='map-access'){state.players.self.vehicleId=fields.entityId;}
                if(action==='vehicle-navigate'){const boat=state.actors[state.players.self.vehicleId];boat.boating={assist:'navigate',navigationDestinationId:fields.destinationId,navigationName:fields.destinationId,assistRoute:[{x:boat.position.x+8,z:boat.position.z},{x:260,z:80}],routeIndex:0};}
                queueMicrotask(()=>map.updateLive(state,'self'));return {...state,selfId:'self',result:{message:'Selected route confirmed.'}};
              }});map.update(env);map.updateLive(state,'self');
            }''')

            def show_action(name):
                page.locator('.district-map-toggle').click()
                dialog = page.locator('.district-map-dialog')
                button = dialog.get_by_role('button', name=name, exact=True, include_hidden=True).first
                button.evaluate('(button)=>{const card=button.closest("details[data-map-search-item]");if(card)card.open=true;}')
                return dialog, button

            for zone, name in [('beacon-reef', 'Beacon Reef Fishing'), ('palm-shoals', 'Palm Shoals Fishing')]:
                dialog, button = show_action('Sail & fish at ' + name)
                if zone == 'beacon-reef':
                    dialog.locator('[data-fishing-zone="beacon-reef"]').dispatch_event('click')
                    assert page.evaluate('commands.length') == 0, 'Selecting a fishing map marker must not teleport'
                    button = dialog.get_by_role('region', name='Selected map location').get_by_role('button', name='Sail & fish at ' + name, exact=True)
                else:
                    assert dialog.locator('[data-live-route] polyline').get_attribute('data-destination-id') == 'beacon-reef'
                button.click()
                page.wait_for_function('(id)=>commands.at(-1)?.destinationId===id', arg=zone)
                assert page.evaluate('commands.at(-1).action') == 'vehicle-navigate'
                assert dialog.is_hidden()

            # A walking selection boards the selected freshwater lake's Angler;
            # it must never teleport to the sea marina or route the ocean boat.
            page.evaluate("state.players.self.vehicleId=null;map.updateLive(state,'self')")
            dialog, button = show_action('Sail & fish at Crescent Lake Fishing')
            button.click()
            page.wait_for_function("commands.at(-1)?.destinationId==='crescent-lake-fishing'")
            assert page.evaluate("commands.at(-2).action==='map-access'&&commands.at(-2).entityId.includes('crescent-lake')")

            page.evaluate("state.players.self.fishing.availability={sides:{port:{canCast:true,zoneId:'crescent-lake-fishing'},starboard:{canCast:false}}};map.updateLive(state,'self')")
            dialog, _ = show_action('Sail & fish at Crescent Lake Fishing')
            fish = dialog.get_by_role('button', name='Fish here at Crescent Lake Fishing', exact=True).first
            fish.click()
            assert page.evaluate("fishOpens.at(-1).zoneId==='crescent-lake-fishing'&&fishOpens.at(-1).side==='port'")
            assert dialog.is_hidden()
            assert not errors, errors
            page.close()
        browser.close()
    print('PASS: selected fishing map routes keep exact IDs, lake boarding is local, and Fish here opens the ready activity on mobile and desktop')
finally:
    server.shutdown()
