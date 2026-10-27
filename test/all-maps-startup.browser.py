"""Start every public map with real room APIs and malformed legacy preferences.

Run after building dist. Use --shard 0/3, 1/3, 2/3 for independent workers;
each worker owns an isolated server, account, browser and persistent directory.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shard', default='0/1', help='zero-based shard/count')
    parser.add_argument('--map', action='append', dest='maps', help='limit to exact map ID (repeatable)')
    parser.add_argument('--list', action='store_true', help='list the real public directory without launching maps')
    parser.add_argument('--timeout', type=int, default=120000, help='startup timeout per map in milliseconds')
    parser.add_argument('--report', type=Path, help='JSON result artifact')
    value = parser.parse_args()
    value.shard_index, value.shard_count = map(int, value.shard.split('/'))
    assert 0 <= value.shard_index < value.shard_count
    return value


# These are display/backpack preferences, not credentials or authoritative
# account records. Different bad shapes cover both parsing and type regressions.
CORRUPT_STORAGE = {
    'muzikazRadToxHiddenRows': 'undefined',
    'muzikazRadToxBackpack': '<!doctype html>',
    'muzikazActiveBackpackItems': '{}',
    'muzikazConsumedBackpackItems': 'null',
    'muzikazUnlockedAttachmentLoot': '23',
    'muzikazDesignatedAvatar': '{malformed',
}
WEBGL_PROBE = """() => {
  window.__mapStartupDraws = 0;
  window.__mapStartupContexts = [];
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(...args) {
    const context = getContext.apply(this,args);
    if(context && /webgl/i.test(args[0]) && !context.__startupProbe) {
      context.__startupProbe = true;
      window.__mapStartupContexts.push(context);
      for(const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
        if(typeof context[name] !== 'function')continue;
        const draw=context[name];
        context[name]=function(...values){window.__mapStartupDraws++;return draw.apply(this,values);};
      }
    }
    return context;
  };
}"""


def play_url(base, world):
    # Preserve the published page and map/mode contract while explicitly asking
    # the lazy explorer to start; standalone sports pages consume their own URL.
    url = urlsplit(urljoin(base + '/', world.get('playUrl') or 'model-explorer.html?environment=' + world['id']))
    query = dict(parse_qsl(url.query, keep_blank_values=True))
    query['autoplay'] = '1'
    return urlunsplit((url.scheme, url.netloc, url.path, urlencode(query), url.fragment))


def seed(directory):
    # A controlled fixture account has canonical test-completion receipts so
    # the permanent compound can be tested without weakening its real gate.
    source = """
import {MzkAccountStore} from './loadout-code-store.mjs';
import {UserJsonDatabase} from './user-json-database.mjs';
import {PROVING_ID,PROVING_PROFILES} from './public/js/factory-test-config.js';
import {join} from 'node:path';
const directory=process.argv[2],accounts=new MzkAccountStore(join(directory,'accounts.json')),database=new UserJsonDatabase(join(directory,'users.json'));
const account=await accounts.freePlayLogin('AllMapStartup','all-map-startup-test-password'),wallet=(await database.ensureAccount(account)).walletId;
await database.transaction(data=>{for(const profile of PROVING_PROFILES)data.transactions.push({id:'map-startup-clearance-'+profile.id,type:'FACTORY_TEST_COMPLETE',walletId:wallet,environmentId:PROVING_ID,profileId:profile.id,qualified:true,score:100,createdAt:new Date().toISOString()});return {};});
"""
    subprocess.run(['node', '--input-type=module', '-', directory], cwd=ROOT, input=source, text=True, check=True, capture_output=True)


def diagnostics(page):
    try:
        return page.evaluate("""() => ({url:location.href,game:window.MuzikazHouseExplorer?.snapshot(),hockey:window.MuzikazHockey?.snapshot(),arcade:window.NeonJunction?.snapshot(),status:document.querySelector('#house-game-load-status')?.textContent,bodyControls:document.body.dataset.gameControls,draws:window.__mapStartupDraws,contextLost:window.__mapStartupContexts?.some(gl=>gl.isContextLost())})""")
    except Exception as error:
        return {'diagnosticError': str(error)}


def main():
    args = arguments()
    os.chdir(ROOT)
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    results = []
    with tempfile.TemporaryDirectory(prefix=f'all-map-startup-{args.shard_index}-') as directory:
        seed(directory)
        with open(Path(directory, 'server.log'), 'w') as log:
            environment = {**os.environ, 'PORT': str(port), 'MUZIKAZ_DATA_DIR': directory,
                           'MUZIKAZ_USER_DATABASE_FILE': str(Path(directory, 'users.json')),
                           'MUZIKAZ_ACCOUNTS_FILE': str(Path(directory, 'accounts.json')),
                           'MUZIKAZ_PAYMENT_ORDERS_FILE': str(Path(directory, 'orders.json')),
                           'MUZIKAZ_ACCOUNT_SESSIONS_FILE': str(Path(directory, 'account-sessions.json')),
                           'MUZIKAZ_GAME_SESSIONS_FILE': str(Path(directory, 'game-sessions.json'))}
            server = subprocess.Popen(['node', 'server.mjs'], cwd=ROOT, env=environment, stdout=log, stderr=log)
            try:
                with sync_playwright() as p:
                    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
                    try:
                        bootstrap = browser.new_context(service_workers='block')
                        for _ in range(120):
                            try:
                                if bootstrap.request.get(base + '/api/health', timeout=1000).ok:
                                    break
                            except Exception:
                                time.sleep(.1)
                        else:
                            raise AssertionError('server startup: ' + Path(directory, 'server.log').read_text()[-4000:])
                        login = bootstrap.request.post(base + '/api/access/free-play', data={'username': 'AllMapStartup', 'password': 'all-map-startup-test-password'})
                        assert login.ok, login.text()
                        auth = bootstrap.storage_state()
                        response = bootstrap.request.get(base + '/api/environments')
                        assert response.ok, response.text()
                        worlds = response.json()['data']
                        worlds = sorted((world for world in worlds if world.get('visibility') != 'private' and world.get('playable') is not False), key=lambda world: world['id'])
                        if args.maps:
                            requested = set(args.maps)
                            assert requested <= {world['id'] for world in worlds}, requested
                            worlds = [world for world in worlds if world['id'] in requested]
                        worlds = [world for index, world in enumerate(worlds) if index % args.shard_count == args.shard_index]
                        assert worlds, 'no public maps selected'
                        if args.list:
                            print(json.dumps([{'id': world['id'], 'playUrl': world.get('playUrl'), 'source': world.get('source')} for world in worlds], indent=2))
                            return
                        bootstrap.close()
                        print(f'Starting {len(worlds)} public maps in shard {args.shard}.', flush=True)
                        for index, world in enumerate(worlds):
                            started = time.monotonic()
                            context = browser.new_context(storage_state=auth, service_workers='block', viewport={'width': 800, 'height': 650}, is_mobile=True, has_touch=True, reduced_motion='reduce')
                            context.add_init_script('for(const [key,value] of Object.entries(' + json.dumps(CORRUPT_STORAGE) + '))localStorage.setItem(key,value)')
                            context.add_init_script('(' + WEBGL_PROBE + ')();')
                            page = context.new_page()
                            errors, modules, invalid_json, shader_errors = [], [], [], []
                            page.on('pageerror', lambda error: errors.append(str(error)))
                            page.on('console', lambda message: shader_errors.append(message.text) if message.type == 'error' and ('WebGLProgram' in message.text or 'VALIDATE_STATUS' in message.text) else None)
                            def response_check(value):
                                path = urlsplit(value.url).path
                                if not value.url.startswith(base + '/'):
                                    return
                                content_type = value.headers.get('content-type', '').lower()
                                if value.request.resource_type == 'script' and (value.status >= 400 or 'javascript' not in content_type):
                                    modules.append({'url': value.url, 'status': value.status, 'contentType': content_type})
                                if value.status == 200 and (path.endswith('.json') or path == '/api/environments'):
                                    try:
                                        value.json()
                                    except Exception as error:
                                        invalid_json.append({'url': value.url, 'contentType': content_type, 'error': str(error)})
                            page.on('response', response_check)
                            page.route('https://**/*', lambda route: route.abort())
                            record = {'id': world['id'], 'name': world.get('name'), 'url': play_url(base, world)}
                            try:
                                page.goto(record['url'], wait_until='domcontentloaded', timeout=args.timeout)
                                page.wait_for_function("""id => {
                                  if(window.MuzikazHouseExplorer){const state=MuzikazHouseExplorer.snapshot();return state.controlsReady&&state.gameplayStarted&&state.roomId===id&&(!state.serverHostedRoom||state.serverReady&&state.serverPlayerInitialized);}
                                  if(window.MuzikazHockey)return MuzikazHockey.snapshot().ready;
                                  return window.NeonJunction?.ready===true;
                                }""", arg=world['id'], timeout=args.timeout)
                                # The two dedicated sports pages have an honest
                                # lobby readiness state. Start their real live
                                # match too instead of accepting a loaded menu.
                                if world['id'] == 'hockey-arena':
                                    page.locator('#start').click()
                                    page.wait_for_function('MuzikazHockey.snapshot().running && MuzikazHockey.snapshot().live', timeout=30000)
                                elif world['id'] == 'neon-junction':
                                    page.locator('#attractions button').first.click()
                                    page.locator('#join-game').click()
                                    page.locator('#start-round').click()
                                    page.wait_for_function('NeonJunction.snapshot().gameStarted && NeonJunction.snapshot().liveGame', timeout=30000)
                                page.wait_for_function('window.__mapStartupDraws > 0 && !window.__mapStartupContexts.some(gl=>gl.isContextLost())', timeout=30000)
                                state = diagnostics(page)
                                assert not errors, errors
                                assert not modules, modules
                                assert not invalid_json, invalid_json
                                assert not shader_errors, shader_errors
                                record.update({'passed': True, 'draws': state.get('draws'), 'roomId': (state.get('game') or {}).get('roomId'), 'serverReady': (state.get('game') or {}).get('serverReady')})
                            except Exception as error:
                                record.update({'passed': False, 'error': str(error), 'diagnostic': diagnostics(page), 'pageErrors': errors, 'modules': modules, 'invalidJson': invalid_json, 'shaderErrors': shader_errors})
                            finally:
                                record['seconds'] = round(time.monotonic() - started, 2)
                                results.append(record)
                                print(('PASS' if record['passed'] else 'FAIL') + f" {index+1}/{len(worlds)} {world['id']} ({record['seconds']}s)" + ('' if record['passed'] else '\n' + json.dumps(record, default=str)[:7000]), flush=True)
                                if args.report:
                                    args.report.parent.mkdir(parents=True, exist_ok=True)
                                    args.report.write_text(json.dumps({'shard': args.shard, 'results': results}, indent=2))
                                context.close()
                        failures = [record for record in results if not record['passed']]
                        print(f"All-map startup shard {args.shard}: {len(results)-len(failures)}/{len(results)} passed.", flush=True)
                        assert not failures, 'startup failures: ' + ', '.join(record['id'] for record in failures)
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


if __name__ == '__main__':
    main()
