"""Real browser, isolated server, and a health response slower than gameplay's deadline."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright
import os,socket,subprocess,time,urllib.request,json
root=Path(__file__).resolve().parents[1]
with TemporaryDirectory(prefix='muzikaz-connect-') as directory:
 env=dict(os.environ)
 for key in ['MUZIKAZ_USER_DATABASE_FILE','MUZIKAZ_ACCOUNTS_FILE','MUZIKAZ_PAYMENT_ORDERS_FILE','MUZIKAZ_ACCOUNT_SESSIONS_FILE','MUZIKAZ_GAME_SESSIONS_FILE','MUZIKAZ_CUSTOM_MAPS_FILE','MUZIKAZ_ENVIRONMENT_DATA_FILE','MUZIKAZ_AVATAR_UPLOAD_DIR','MUZIKAZ_ASSET_UPLOAD_DIR','MUZIKAZ_ENVIRONMENT_UPLOAD_DIR','MUZIKAZ_BACKUP_DIR']:
  env.pop(key,None)
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 env.update(PORT=str(port),MUZIKAZ_DATA_DIR=directory,UPLOAD_STORAGE_PATH=str(Path(directory)/'models'))
 base=f'http://127.0.0.1:{port}'
 with (Path(directory)/'server.log').open('w+') as log:
  server=subprocess.Popen(['node','server.mjs'],cwd=root,env=env,stdout=log,stderr=log)
  try:
   for _ in range(200):
    if server.poll() is not None:log.seek(0);raise AssertionError(log.read())
    try:
     with urllib.request.urlopen(base+'/api/health',timeout=1) as reply:
      if reply.status==200:break
    except Exception:time.sleep(.1)
   else:raise AssertionError('Server failed to start')
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'],headless=True)
    context=browser.new_context()
    for name in ['api-connection.js','shared-game-inventory.js']:
     served=context.request.get(base+'/public/js/'+name)
     assert served.ok and served.text()==(root/'public/js'/name).read_text(), 'Rebuild dist before testing current connection code: '+name
    guest=context.request.post(base+'/api/access/guest',data={});assert guest.status==201,guest.text()
    page=context.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/connection-probe.html',lambda route:route.fulfill(status=200,content_type='text/html',body='<!doctype html><title>Connection probe</title>'))
    page.goto(base+'/connection-probe.html')
    result=page.evaluate('''async()=>{
     const nativeFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(new URL(args[0],location.href).pathname==='/api/health')await new Promise(resolve=>setTimeout(resolve,9000));return response;};
     await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/public/js/api-connection.js';script.onload=resolve;script.onerror=reject;document.head.append(script);});
     const {SharedGameInventory}=await import('/public/js/shared-game-inventory.js');
     const inventory=new SharedGameInventory(),started=performance.now();
     const session=await inventory.roomSession();
     const {connectAuthoritativeRoom}=await import('/public/js/authoritative-room-client.js');
     let latest=null;const client=connectAuthoritativeRoom({roomId:'public-commons',input:()=>({}),render:state=>latest=state});
     try{await client.whenReady();return {elapsedMs:performance.now()-started,proof:!!session.csrfToken,connected:client.ready,playerConfirmed:!!latest.players[client.selfId],apiConnected:document.documentElement.dataset.apiConnected};}
     finally{client.stop();}
    }''')
    assert result['elapsedMs']>=8000,result
    assert result['proof'] and result['connected'] and result['playerConfirmed'],result
    assert result['apiConnected']=='true' and not errors,(result,errors)
    print(json.dumps(result));browser.close()
  finally:
   server.terminate()
   try:server.wait(timeout=15)
   except subprocess.TimeoutExpired:server.kill();server.wait()
