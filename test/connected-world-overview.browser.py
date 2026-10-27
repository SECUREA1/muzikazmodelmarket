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
        browser = p.chromium.launch(
            executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}/test/fixtures/compact-sports-actions.html')
        page.wait_for_selector('body[data-ready="true"]')
        page.evaluate('''async () => {
            const THREE = await import('/public/vendor/three/three.module.min.js');
            const originalAdd = THREE.Object3D.prototype.add;
            THREE.Object3D.prototype.add = function(...objects) {
                const result = originalAdd.apply(this,objects);
                if (this.isScene && this.children.some(object=>object.isHemisphereLight)) window.mapRenderScene=this;
                return result;
            };
            // Observe what reaches the real renderer: a loaded counter alone
            // cannot prove the room geometry is visible or correctly placed.
            Object.defineProperty(window,'renderedOverview',{get() {
                const cells = {}, scene = window.mapRenderScene;
                scene?.updateMatrixWorld(true);
                scene?.traverseVisible(mesh => {
                    const color = mesh.geometry?.attributes?.color;
                    if (!mesh.isMesh || color?.itemSize !== 4 ||
                        !mesh.material.vertexColors || mesh.material.roughness !== .9) return;
                    mesh.updateWorldMatrix(true, false);
                    const bounds = new THREE.Box3().setFromObject(mesh);
                    const center = bounds.getCenter(new THREE.Vector3());
                    const place = window.atlas.locations.slice().sort((a,b) =>
                        Math.abs(a.column*256-center.x)-Math.abs(b.column*256-center.x))[0];
                    const cell = cells[place.mapId] ||= {vertices:0, paintSum:0, paintCount:0};
                    const position = mesh.geometry.attributes.position;
                    cell.vertices += position.count;
                    for (let index=0; index<position.count; index++) {
                        if (color.getX(index)>.99 && color.getY(index)<.001 &&
                            Math.abs(color.getZ(index)-window.paintColor.b)<.001) {
                            const point = new THREE.Vector3().fromBufferAttribute(position,index).applyMatrix4(mesh.matrixWorld);
                            cell.paintSum += point.x; cell.paintCount++;
                        }
                    }
                });
                return cells;
            }});
            window.paintColor = new THREE.Color(0xff00de);
            document.body.replaceChildren();
            const style = document.createElement('style');
            style.textContent = '.local-map-3d-viewport{height:520px!important}.local-map-3d-tag{position:absolute}';
            document.head.append(style);
            const root = document.createElement('section');
            root.id = 'overview-regression'; root.className = 'connected-world-map';
            document.body.append(root);
            window.worlds = {};
            window.snapshots = {};
            window.makeMap = (id,column) => {
                worlds[id] = {id,name:'Authored '+id,proceduralLand:true,
                    builderScene:{layout:'grand-floor',mapSize:40,objects:[
                        {id:'table',modelId:'dining-set',position:{x:-7,y:0,z:3},
                        scale:{x:1,y:1,z:1},rotation:{x:0,y:.3,z:0}}]}};
                snapshots[id] = {objects:{block:{id:'block',materialId:'wood',
                    position:[10,1,8],rotation:[0,0,0],scale:[2,1,3],paint:[0xff00de]}},
                    actors:{rangeTarget:{id:'rangeTarget',position:{x:0,y:1,z:0},health:100}},players:{}};
                return {mapId:id,name:worlds[id].name,column,row:0,size:40,
                    streets:[],portalTargets:[],ownerName:'Builder',playerCount:0,
                    buildingCount:1,savedObjectCount:1,updatedAt:'1',
                    playUrl:'model-explorer.html?environment='+id};
            };
            window.atlas = {revision:1,cellSize:256,connections:[],
                locations:[makeMap('map-a',0),makeMap('map-b',4),makeMap('map-c',8)]};
            window.requests = [];
            const api = async path => {
                requests.push(path);
                if (path.startsWith('/api/environments/')) return structuredClone(worlds[decodeURIComponent(path.split('/').pop())]);
                if (path.endsWith('/gameplay')) return structuredClone(snapshots[decodeURIComponent(path.split('/')[3])]);
                throw Error('Unexpected API request: '+path);
            };
            const {mountConnectedWorldMap} = await import('/public/js/connected-world-map.js');
            window.controller = await mountConnectedWorldMap(root,{atlas,api});
        }''')
        page.wait_for_function("document.querySelector('#overview-regression').dataset.overviewCount==='3'")
        page.wait_for_function('Object.keys(window.renderedOverview||{}).length===3')
        assert '0 detailed plots loaded' in page.locator('.connected-world-status').inner_text()
        assert page.locator('#overview-regression').get_attribute('data-overview-failed') == '0'
        initial_x = page.evaluate('renderedOverview["map-a"].paintSum/renderedOverview["map-a"].paintCount')
        assert abs(initial_x-57.6) < .02, initial_x
        assert page.evaluate("requests.filter(path=>path.startsWith('/api/environments/')).length") == 3

        page.evaluate("controller.select('map-a')")
        page.wait_for_function("document.querySelector('.connected-world-status').textContent.includes('1 detailed plots loaded')")
        page.wait_for_function('Object.keys(renderedOverview).length===2')
        page.wait_for_selector('[data-map-tag="map-a:item:block"]', state='attached')

        # Edit a live block without changing its count or atlas metadata. Its
        # next distant graphic must be rebuilt from the changed geometry too.
        page.evaluate("snapshots['map-a'].objects.block.position[0]=12;controller.update(atlas)")
        page.wait_for_function("Math.abs(Number(document.querySelector('[data-map-tag=\"map-a:item:block\"]')?.dataset.worldX)-69.12)<.02")
        page.evaluate('controller.fit()')
        page.wait_for_function('Object.keys(renderedOverview).length===3')
        page.wait_for_function("Math.abs(renderedOverview['map-a'].paintSum/renderedOverview['map-a'].paintCount-69.12)<.02")

        # The directory remains open ended: deleted and newly published rooms
        # change the rendered map, without a reload or an enumerated map list.
        page.evaluate("atlas.locations=atlas.locations.filter(place=>place.mapId!=='map-b');atlas.locations.push(makeMap('map-d',12));atlas.revision++;controller.update(atlas)")
        page.wait_for_function("document.querySelector('#overview-regression').dataset.overviewCount==='3' && renderedOverview['map-d'] && !renderedOverview['map-b']")
        assert sorted(page.evaluate('Object.keys(renderedOverview)')) == ['map-a', 'map-c', 'map-d']
        assert page.locator('[data-map-tag="plot:map-b"]').count() == 0
        assert page.locator('[data-map-tag="plot:map-d"]').count() == 1

        # Disposing during queued work must stop the queue and release the view.
        page.evaluate("atlas.locations.push(makeMap('map-e',16));controller.update(atlas);controller.dispose();window.requestsAtDisposal=requests.length")
        page.wait_for_timeout(600)
        assert page.evaluate('requests.length===requestsAtDisposal')
        assert page.locator('#overview-regression canvas').count() == 0
        assert not errors, errors
        browser.close()
    print('All-map overview: actual geometry before zoom, exact live edits, far-view restoration, dynamic rooms, model-less actors and disposal passed.')
finally:
    server.shutdown()
