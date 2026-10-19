"""Exercise the real range dialog without accounts, purchases, or a game server.

Run: python3 test/firing-range-advanced-hud.browser.py
Requires Python Playwright and /usr/bin/chromium. A temporary local HTTP server
serves the production HUD modules; only its action callbacks are simulated.
"""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


FIXTURE = """<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;background:#17251c}#stage{position:relative;height:100vh;width:100vw}</style>
<button id="fullscreen">Fullscreen</button><main id="stage"></main>
<script type="module">
import { mountFiringRangeHud, FIRING_RANGE_SETUP_DEFAULTS } from '/js/firing-range-hud.js';
const initial = () => ({state:'ready',hostId:'host',settings:{...FIRING_RANGE_SETUP_DEFAULTS},round:1,
 locations:[{id:'main',name:'Main range'},{id:'east',name:'East annex'}],activeLocationId:'main',
 participants:{host:{id:'host',name:'Alice',role:'player',locationId:'main',lane:0,team:'red',score:0,hits:0,shots:0},
 bob:{id:'bob',name:'Bob',role:'player',locationId:'main',lane:1,team:'blue',score:0,hits:0,shots:0}},roundResults:[]});
window.actions=[];window.weapons=[];window.markets=[];window.backpacks=0;window.neutral=0;window.worldKeys=0;
window.deferNext=null;window.failSave=false;window.saveDelay=0;window.actorId='host';window.game=initial();
window.render=()=>hud.render(structuredClone(game),actorId,true);
window.update=patch=>{game={...game,...patch};render();};
window.reset=()=>{game=initial();actorId='host';failSave=false;saveDelay=0;actions.length=0;render();};
window.hud=mountFiringRangeHud({stage:document.querySelector('#stage'),onOpen:()=>neutral++,
 onWeapon:id=>{weapons.push(id);return true;},onMarket:request=>markets.push(request),onBackpack:()=>backpacks++,
 onAction:async(name,extra)=>{actions.push({name,...extra});
   if(window.deferNext===name){window.deferNext=null;const snapshot=structuredClone(game);return await new Promise((resolve,reject)=>{window.resolvePending=fail=>fail?reject(new Error('Stale range request failed')):resolve({firingRange:snapshot});});}
   if(name==='range-settings'){if(saveDelay)await new Promise(resolve=>setTimeout(resolve,saveDelay));if(failSave)return false;game={...game,settings:{...extra.settings}};}
   if(name==='range-start')game={...game,state:'countdown'};
   if(name==='range-practice')game={...game,state:'live',settings:{...game.settings,mode:'freeplay'}};
   if(name==='range-stop')game={...game,state:'finished'};
   if(name==='range-watch')game={...game,participants:{...game.participants,[actorId]:{...game.participants[actorId],role:'spectator'}}};
   if(name==='range-join')game={...game,participants:{...game.participants,[actorId]:{...game.participants[actorId],role:'player',...extra}}};
   render();return {firingRange:game};
 }});
document.addEventListener('keydown',()=>worldKeys++);
document.querySelector('#fullscreen').onclick=()=>document.querySelector('#stage').requestFullscreen();
render();window.ready=true;
</script>"""


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/fixture":
            body = FIXTURE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, *_):
        pass


def run():
    public = Path(__file__).resolve().parents[1] / "public"
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=public))
    Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    checks = 0
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"http://127.0.0.1:{server.server_port}/fixture")
            page.wait_for_function("window.ready === true")
            panel = page.locator(".firing-range-panel")
            start = panel.locator('[data-range-action="range-start"]')
            page.evaluate("hud.open('armory','east')")
            assert panel.locator('[data-range-section="armory"]').is_visible()
            assert panel.locator('[name="range-location"]').input_value() == "east"
            assert panel.locator('[data-range-loan]').count() == 9
            for button in panel.locator('[data-range-loan]').all():
                button.click()
            assert len(page.evaluate("weapons")) == 9
            assert page.evaluate("markets.length") == 0
            checks += 1

            panel.locator('[data-range-loan="arc-carbine"]').click()
            panel.locator('[data-range-buy]').click()
            assert not panel.is_visible()
            assert page.evaluate("markets.at(-1)") == {"category": "weapons", "weaponId": "arc-carbine", "intent": "buy"}
            page.evaluate("hud.open('armory')")
            panel.locator('[data-range-market]').click()
            assert page.evaluate("markets.at(-1)") == {"category": "weapons", "intent": "browse"}
            page.evaluate("hud.open('armory')")
            panel.locator('[data-range-backpack]').click()
            assert page.evaluate("backpacks") == 1
            checks += 1

            page.evaluate("hud.open('play')")
            panel.locator('[data-range-action="range-practice"]').click()
            page.wait_for_function("game.state === 'live' && !document.querySelector('.firing-range-panel').open")
            assert page.evaluate("weapons.at(-1)") == "arc-carbine"
            page.evaluate("hud.open('tournament')")
            assert panel.locator('[name="mode"]').is_disabled()
            assert "End open practice" in panel.locator('[data-setup-help]').inner_text()
            panel.locator('[data-range-action="range-stop"]').click()
            page.wait_for_function("!document.querySelector('[name=mode]').disabled")
            assert panel.locator('[data-range-section="tournament"]').is_visible()
            assert panel.locator('[name="mode"]').input_value() == "precision"
            checks += 1

            panel.locator('[name="mode"]').select_option("moving")
            panel.locator('[name="durationSeconds"]').fill("10")
            panel.locator('[name="rounds"]').fill("2")
            panel.locator('[name="shotLimit"]').fill("2")
            panel.locator('[name="countdownSeconds"]').fill("0")
            panel.locator('[name="weapon"]').select_option("pulse-pistol")
            panel.locator('[name="teamMode"]').select_option("true")
            page.evaluate("saveDelay=120;actions.length=0")
            start.evaluate("el=>{el.click();el.click()}")
            page.wait_for_function("game.state === 'countdown'")
            assert [action["name"] for action in page.evaluate("actions")] == ["range-settings", "range-start"]
            assert page.evaluate("game.settings") == {"mode": "moving", "durationSeconds": 10, "rounds": 2, "shotLimit": 2, "countdownSeconds": 0, "targetSpeed": 1, "weapon": "pulse-pistol", "teamMode": True}
            assert page.evaluate("weapons.at(-1)") == "pulse-pistol"
            checks += 1

            page.evaluate("hud.open('armory')")
            assert panel.locator('[data-range-loan="pulse-pistol"]').get_attribute("aria-pressed") == "true"
            assert panel.locator('[data-range-loan]:disabled').count() == 9
            assert "locked: Pulse Pistol" in panel.locator('[data-weapon-lock]').inner_text()
            page.evaluate("hud.open('play')")
            assert panel.locator('[name="range-lane"]').is_disabled()
            assert panel.locator('[data-range-action="range-join"]').is_disabled()
            checks += 1

            page.evaluate("update({state:'intermission',round:1,roundResults:[{round:1,leaderboard:[{id:'host',name:'Alice',score:100,roundScore:100,hits:1,shots:2},{id:'bob',name:'Bob',score:60,roundScore:60,hits:1,shots:2}]}]});hud.open('results')")
            assert "Round 1: Alice" in panel.locator('[data-results]').inner_text()
            assert "Bob · 60 pts" in panel.locator('[data-results]').inner_text()
            page.evaluate("update({state:'live',round:2}); update({state:'finished',results:{winnerIds:['host'],leaderboard:[{id:'host',name:'Alice',score:200,roundScore:100,hits:2,shots:4},{id:'bob',name:'Bob',score:120,hits:2,shots:4}],rounds:[{round:1,leaderboard:[{id:'host',name:'Alice',score:100,hits:1,shots:2}]},{round:2,leaderboard:[{id:'host',name:'Alice',score:100,hits:1,shots:2}]}]}})")
            assert panel.locator('[data-results] > li').count() == 3
            assert "Alice wins · 200 points" in panel.locator('[data-results]').inner_text()
            assert "Alice · 200 pts" in panel.locator('[data-results]').inner_text()
            panel.locator('[data-range-section="results"] [data-range-link="tournament"]').click()
            assert start.is_enabled()
            checks += 1

            page.evaluate("reset();hud.open('tournament');actions.length=0")
            panel.locator('[name="durationSeconds"]').fill("9")
            start.click()
            assert page.evaluate("actions.length") == 0
            panel.locator('[name="durationSeconds"]').fill("15")
            page.evaluate("failSave=true")
            start.click()
            page.wait_for_function("document.querySelector('[data-range-status]').textContent.includes('not accepted')")
            assert [action["name"] for action in page.evaluate("actions")] == ["range-settings"]
            assert panel.is_visible()
            assert panel.locator('[name="durationSeconds"]').input_value() == "15"
            page.evaluate("failSave=false;actions.length=0")
            start.click()
            page.wait_for_function("game.state === 'countdown'")
            assert [action["name"] for action in page.evaluate("actions")] == ["range-settings", "range-start"]
            checks += 1

            for cancellation, pending, failed in [("availability", "range-settings", False), ("actor", "range-settings", False), ("revision", "range-settings", False), ("availability", "range-start", False), ("availability", "range-settings", True)]:
                page.evaluate("action=>{reset();hud.open('tournament');actions.length=0;window.deferNext=action;window.resolvePending=null}", pending)
                if pending == "range-settings":
                    panel.locator('[name="durationSeconds"]').fill("15")
                start.click()
                page.wait_for_function("typeof window.resolvePending === 'function'")
                before_weapons = page.evaluate("weapons.length")
                page.evaluate('''reason=>{
                  if(reason==='availability')hud.render(null,null,false);
                  if(reason==='actor'){actorId='bob';game={...game,hostId:'bob'};}
                  if(reason!=='actor')game={...game,revision:'new-range-'+reason};
                  render();hud.open('armory');
                }''', cancellation)
                page.evaluate("async fail=>{resolvePending(fail);await new Promise(resolve=>requestAnimationFrame(resolve));}", failed)
                assert [action["name"] for action in page.evaluate("actions")] == [pending]
                assert page.evaluate("weapons.length") == before_weapons
                assert panel.is_visible()
                assert panel.locator('[data-range-section="armory"]').is_visible()
                assert panel.locator('[data-range-loan="laser"]').is_enabled()
                assert 'Stale range request failed' not in panel.locator('[data-range-status]').inner_text()
                checks += 1

            page.evaluate("reset();actorId='bob';render();hud.open('tournament')")
            assert panel.locator('[name="mode"]').is_disabled()
            assert start.is_disabled()
            page.evaluate("actorId='host';render();hud.open('play','main')")
            assert panel.locator('[name="range-lane"] option[value="1"]').evaluate('el=>el.disabled'), page.evaluate("({game,location:document.querySelector('[name=range-location]').value,options:[...document.querySelector('[name=range-lane]').options].map(o=>({value:o.value,disabled:o.disabled}))})")
            panel.locator('[name="range-location"]').select_option("east")
            assert panel.locator('[name="range-lane"] option[value="1"]').evaluate('el=>!el.disabled')
            checks += 1

            page.evaluate("update({settings:{...game.settings,teamMode:true},participants:{host:{...game.participants.host,score:100},bob:{...game.participants.bob,role:'spectator',enrolled:true,score:60}}});hud.open('results')")
            assert panel.locator('[data-team-score]').inner_text() == 'RED 100 · BLUE 60'
            assert panel.locator('[data-leaderboard] tr').count() == 2
            checks += 1

            page.evaluate("hud.open('armory');worldKeys=0")
            zoom = panel.locator('[name="range-scope-zoom"]')
            zoom.focus()
            zoom.press("End")
            panel.locator('[name="range-scope-reticle"]').select_option("ring")
            assert page.evaluate("hud.scope().zoom") == 8
            assert page.evaluate("hud.scope().reticle") == "ring"
            assert page.evaluate("worldKeys") == 0
            panel.locator('[data-panel-aim]').click()
            assert page.evaluate("hud.scope().active") is True
            assert not panel.is_visible()
            page.evaluate("hud.open('armory')")
            page.keyboard.press("Escape")
            assert not panel.is_visible()
            checks += 1

            page.locator("#fullscreen").click()
            page.wait_for_function("document.fullscreenElement !== null")
            page.evaluate("hud.open('results')")
            assert page.evaluate("document.fullscreenElement.contains(document.querySelector('.firing-range-panel'))")
            panel.locator('[data-range-close]').first.click()
            page.evaluate("document.exitFullscreen()")
            checks += 1

            page.set_viewport_size({"width": 390, "height": 844})
            page.evaluate("hud.open('armory')")
            assert panel.evaluate("el=>el.scrollWidth<=el.clientWidth")
            assert panel.bounding_box()["width"] <= 390
            panel.locator('[data-range-nav="tournament"]').click()
            assert panel.locator('[data-range-section="tournament"]').is_visible()
            assert panel.evaluate("el=>el.scrollWidth<=el.clientWidth")
            checks += 1
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print(f"Advanced firing range HUD: {checks} browser scenarios passed")


if __name__ == "__main__":
    run()
