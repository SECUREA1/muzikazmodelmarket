"""Expanded forge: stale-catalog recovery, commissions, native SVGs and finite freight.

Run after npm run build. Uses an isolated server, funded fixture and Chromium.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/workspace/scratch')
ARTIFACTS.mkdir(exist_ok=True)
os.chdir(ROOT)
CONFIG = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', "import {FORGE_ITEMS} from './public/js/forge-items.js';import {FORGE_RECIPES} from './public/js/forge-recipes.js';import {FORGE_QUESTS} from './public/js/forge-quests.js';console.log(JSON.stringify({items:FORGE_ITEMS,recipes:FORGE_RECIPES,quests:FORGE_QUESTS}));"], text=True))
assert len(CONFIG['items']) >= 28 and len(CONFIG['recipes']) >= 10 and len(CONFIG['quests']) >= 9
RECIPE = next(recipe for recipe in CONFIG['recipes'] if recipe['id'] == 'forge-dagger')
SEED = """
import {MzkAccountStore} from './loadout-code-store.mjs';import {UserJsonDatabase} from './user-json-database.mjs';import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('ForgeExpansion','forge-expansion-password'),wallet=(await database.ensureAccount(account)).walletId;
await database.transaction(data=>{data.users[wallet].tokens.MZK=50000;return {};});
"""


def data(response):
    assert response.ok, f'{response.status}: {response.text()[:3000]}'
    value = response.json()
    assert value.get('success') is not False, value
    return value['data']


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
base = f'http://127.0.0.1:{port}'
with tempfile.TemporaryDirectory(prefix='forge-expansion-') as directory:
    subprocess.run(['node', '--input-type=module', '-', directory], input=SEED, text=True, check=True, capture_output=True)
    with open(Path(directory, 'server.log'), 'w') as server_log:
        server = subprocess.Popen(['node', 'server.mjs'], env={**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory, 'MUZIKAZ_STATIC_SOURCE': os.environ.get('MUZIKAZ_STATIC_SOURCE', 'dist')}, stdout=server_log, stderr=server_log)
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                context = browser.new_context(service_workers='block', viewport={'width': 1440, 'height': 1050}, device_scale_factor=.5, reduced_motion='reduce')
                try:
                    for _ in range(100):
                        try:
                            if context.request.get(base+'/api/health', timeout=1000).ok:
                                break
                        except Exception:
                            time.sleep(.1)
                    else:
                        raise AssertionError(Path(directory, 'server.log').read_text()[-3000:])
                    data(context.request.post(base+'/api/access/free-play', data={'username': 'ForgeExpansion', 'password': 'forge-expansion-password'}))
                    forge = next(world for world in data(context.request.get(base+'/api/environments')) if world['id'] == 'traditional-forge')
                    assert any(obj['id'] == 'forge-market-kiosk' for obj in forge['builderScene']['objects'])
                    errors = []
                    page = context.new_page()
                    page.set_default_timeout(15000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    stale_requests = []

                    def older_catalogue(route):
                        response = route.fetch()
                        source = response.text()
                        signature = 'export function createBuilderModel(id,options={}) {'
                        assert signature in source
                        source = source.replace(signature, signature+"\nif(String(id).startsWith('forge-')){globalThis.__oldForgeMisses=(globalThis.__oldForgeMisses||0)+1;return null;}\n", 1)
                        stale_requests.append(route.request.url)
                        route.fulfill(response=response, body=source, content_type='text/javascript')

                    page.route('**/public/js/builder-models-3d.js*', older_catalogue)
                    page.goto(base+'/'+forge['playUrl'], wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    assert stale_requests and page.evaluate('window.__oldForgeMisses') >= 6
                    models = page.evaluate('window.MuzikazHouseExplorer.inspectModels()')
                    assert not models['placements']['missing'] and not models['placements']['empty'], models['placements']
                    assert models['placements']['loaded'] == len(forge['builderScene']['objects'])
                    assert 'saved 3D model definition is unavailable' not in page.locator('body').inner_text()
                    assert not errors, errors
                    page.screenshot(path=str(ARTIFACTS/'forge-expansion-cache-recovery.png'))
                    print('Stale native factory recovered actual forge map models', flush=True)
                    page.close()
                    page = context.new_page()
                    page.set_default_timeout(15000)
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.route('https://**/*', lambda route: route.abort())
                    page.goto(base+'/'+forge['playUrl'], wait_until='domcontentloaded', timeout=90000)
                    page.wait_for_function('window.MuzikazHouseExplorer?.snapshot().controlsReady', timeout=90000)
                    panel = page.locator('#forge-workspace')

                    def ready():
                        page.wait_for_function('document.querySelector("#forge-workspace [data-work-action]").textContent!=="Working…"')

                    def open_forge():
                        if panel.is_visible():
                            return
                        toggle = page.get_by_role('button', name='Open forge workshop', exact=True)
                        if not toggle.is_visible():
                            page.get_by_role('button', name='More view controls', exact=True).click()
                        toggle.click()
                        expect(panel).to_be_visible()
                        ready()

                    def response_for(action, button):
                        with page.expect_response(lambda response: '/gameplay' in response.url and (response.request.post_data_json or {}).get('action') == action) as result:
                            button.click()
                        value = data(result.value)
                        ready()
                        assert panel.locator('[data-status]').get_attribute('data-error') != 'true', panel.locator('[data-status]').inner_text()
                        return value

                    def find_required():
                        panel.locator('[data-find-required]').click()
                        expect(panel).to_be_hidden()
                        time.sleep(.5)
                        open_forge()

                    open_forge()
                    expect(panel.locator('[data-recipe]')).to_have_count(len(CONFIG['recipes']))
                    expect(panel.locator('.forge-commission')).to_have_count(len(CONFIG['quests']))
                    for identifier, item in CONFIG['items'].items():
                        response = context.request.get(base+'/public/images/native-designs/'+identifier+'.svg')
                        assert response.ok, identifier
                        document = ET.fromstring(response.text())
                        assert document.tag.endswith('svg') and document.find('{http://www.w3.org/2000/svg}title') is not None, identifier
                    print('10 recipe cards,9 commissions and28 valid authored SVG previews', flush=True)
                    response_for('forge-accept-quest', panel.locator('[data-quest-accept="first-maker-mark"]'))
                    panel.locator('[data-recipe="forge-dagger"]').click()
                    find_required()
                    started = response_for('forge-start', panel.locator('[data-work-action]'))
                    assert started['result']['forge']['balance'] == 50000-RECIPE['costMzk']
                    find_required()
                    response_for('forge-heat', panel.locator('[data-work-action]'))
                    expect(panel.locator('[data-stage-name]')).to_have_text('Shape at the anvil', timeout=15000)
                    find_required()
                    for _ in range(RECIPE['hammerStrikes']):
                        response_for('forge-hammer', panel.locator('[data-work-action]'))
                        time.sleep(.55)
                    find_required()
                    response_for('forge-quench', panel.locator('[data-work-action]'))
                    find_required()
                    response_for('forge-temper', panel.locator('[data-work-action]'))
                    expect(panel.locator('[data-stage-name]')).to_have_text('Finish & collect', timeout=15000)
                    find_required()
                    completed = response_for('forge-finish', panel.locator('[data-work-action]'))
                    item = completed['result']['item']
                    assert item['buildAssetId'] == 'forge-dagger'
                    rewarded = response_for('forge-claim-quest', panel.locator('[data-quest-claim="first-maker-mark"]'))
                    assert rewarded['result']['forge']['balance'] == 50000-RECIPE['costMzk']+15
                    expect(panel.locator('[data-quest-claim="first-maker-mark"]')).to_have_count(0)
                    csrf = data(context.request.get(base+'/api/game/room-session'))['csrfToken']
                    headers = {'x-csrf-token': csrf}
                    endpoint = base+'/api/rooms/traditional-forge/gameplay'
                    replay = data(context.request.post(endpoint, headers=headers, data={'action': 'forge-claim-quest', 'questId': 'first-maker-mark', 'requestId': 'forge-reward-retry'}))
                    assert replay['result']['duplicate'] and replay['result']['forge']['balance'] == rewarded['result']['forge']['balance']
                    page.screenshot(path=str(ARTIFACTS/'forge-expansion-commissions.png'))
                    print('New dagger crafted through all stages; apprentice quest rewarded exactly once', flush=True)
                    response_for('forge-accept-quest', panel.locator('[data-quest-accept="first-market-sale"]'))
                    panel.locator('[data-quest-destination="market"]').click()
                    market = page.locator('#game-market-popup')
                    expect(market).to_be_visible()
                    expect(market.locator('[data-market-search]')).to_have_value('forge')
                    expect(market.locator('[data-market-results]')).to_contain_text('item', timeout=30000)
                    expect(market.get_by_text('Cinderfang Dagger', exact=True).first).to_be_visible()
                    page.screenshot(path=str(ARTIFACTS/'forge-expansion-market.png'))
                    market.locator('[data-market-close]').click()
                    open_forge()
                    with page.expect_response(lambda response: response.url.endswith('/api/world-supply/export-forge')) as exported:
                        panel.locator('[data-forge-export]').click()
                    export = data(exported.value)
                    expect(panel.locator('[data-forge-export]')).to_have_text('Sealed in world warehouse', timeout=15000)
                    assert export['itemId'] == 'native:forge-dagger' and export['quantity'] == 1
                    backpack = data(context.request.get(base+'/api/wallet/state'))
                    assert all(owned['id'] != item['id'] for owned in backpack['items'])
                    workspace = data(context.request.get(base+'/api/world-supply/workspace?mapId=traditional-forge'))
                    lot = next(lot for lot in workspace['lots'] if lot['id'] == export['lotId'])
                    assert lot['quantity'] == 1 and lot['availableQuantity'] == 1 and lot['origin'] == 'traditional-forge'
                    assert (workspace['availableFactoryStock'].get('native:forge-dagger') or 0) >= 1
                    panel.locator('[data-collected] [data-quest-destination="supply"]').click()
                    supply = page.locator('#world-supply-panel')
                    expect(supply).to_be_visible()
                    expect(supply.locator('[data-item]')).to_have_value('native:forge-dagger', timeout=15000)
                    page.screenshot(path=str(ARTIFACTS/'forge-expansion-freight.png'))
                    print('Exact creation consumed once into a finite warehouse lot; dispatch workspace connected', flush=True)
                    supply.locator('[data-close]').first.click() if supply.locator('[data-close]').count() else page.keyboard.press('Escape')
                    open_forge()
                    page.set_viewport_size({'width': 390, 'height': 844})
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    expect(panel.locator('[data-recipe]')).to_have_count(len(CONFIG['recipes']))
                    page.screenshot(path=str(ARTIFACTS/'forge-expansion-mobile.png'))
                    assert not errors, errors
                    print('Expanded forge mobile workspace and browser error checks passed', flush=True)
                except Exception:
                    try:
                        print('Diagnostic:', page.evaluate('({room:window.MuzikazHouseExplorer?.snapshot().roomId,ready:window.MuzikazHouseExplorer?.snapshot().controlsReady,text:document.body.innerText.slice(-3500)})'), errors, flush=True)
                        page.screenshot(path=str(ARTIFACTS/'forge-expansion-failure.png'))
                    except Exception:
                        pass
                    raise
                finally:
                    browser.close()
        except Exception:
            print(Path(directory, 'server.log').read_text()[-6000:], flush=True)
            raise
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
