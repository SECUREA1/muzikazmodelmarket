import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable,Writable} from 'node:stream';

test('published model detail resolves list IDs and keeps unpublished records private', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'published-model-api-'));
  const previous = {...process.env};
  let fixture;
  Object.assign(process.env, {
    MUZIKAZ_DATA_DIR:directory,
    MUZIKAZ_USER_DATABASE_FILE:join(directory,'users.json'),
    MUZIKAZ_ACCOUNTS_FILE:join(directory,'accounts.json'),
    MUZIKAZ_PAYMENT_ORDERS_FILE:join(directory,'orders.json'),
    UPLOAD_STORAGE_PATH:join(directory,'models'),
    MUZIKAZ_AVATAR_UPLOAD_DIR:join(directory,'avatars'),
    MUZIKAZ_ASSET_UPLOAD_DIR:join(directory,'assets'),
    MUZIKAZ_ENVIRONMENT_UPLOAD_DIR:join(directory,'environments')
  });
  try {
    const records = [
      {id:'public-model',name:'Public model',status:'published',visibility:'public',modelUrl:'/uploads/models/public.glb'},
      {id:'model with / unicode ☃',name:'Encoded identifier',visibility:'public',modelUrl:'/uploads/models/encoded.glb'},
      {id:'unpublished',name:'Private draft',status:'draft',visibility:'private',modelUrl:'/uploads/models/private.glb'},
      {id:'unpublished-after-publish',name:'Unpublished model',status:'published',visibility:'private',modelUrl:'/uploads/models/private.glb'}
    ];
    await writeFile(join(directory,'published-models.json'),JSON.stringify(records));
    await mkdir(join(directory,'models'));
    const bytes=Buffer.from('fixture-model-binary');
    for(const name of ['public','private','unregistered'])await writeFile(join(directory,'models',name+'.glb'),bytes);
    const original = await readFile(new URL('../server.mjs',import.meta.url),'utf8');
    const source = original.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL('../'+path,import.meta.url).href}'`)
      .replace(/server\.listen\(port,[^\n]+\);/,'export {server}; export async function stopFixture(){masterMaintenance=true;await drainServerState();}');
    const path = join(directory,'handler.mjs');
    await writeFile(path,source);
    fixture = await import(pathToFileURL(path).href);
    const handler = fixture.server.listeners('request')[0];
    async function get(url) {
      const request = Readable.from([]);
      Object.assign(request,{url,method:'GET',headers:{host:'localhost'},socket:{remoteAddress:'127.0.0.1'}});
      const result = {headers:{}};
      const response = {
        setHeader(name,value){result.headers[name.toLowerCase()]=value;},
        getHeader(name){return result.headers[name.toLowerCase()];},
        writeHead(status,headers){result.status=status;for(const [name,value] of Object.entries(headers))this.setHeader(name,value);this.headersSent=true;},
        end(body){result.body=JSON.parse(body);}
      };
      await handler(request,response);
      return result;
    }
    const list = await get('/api/models');
    assert.equal(list.status,200);
    assert.equal(list.body.data.length,2);
    for (const listed of list.body.data) {
      const detail = await get('/api/models/'+encodeURIComponent(listed.id));
      assert.equal(detail.status,200);
      assert.deepEqual(detail.body.data,listed);
      assert.match(detail.headers['content-type'],/application\/json/);
    }
    for (const id of ['unpublished','unpublished-after-publish','missing']) {
      const detail = await get('/api/models/'+id);
      assert.equal(detail.status,404);
      assert.equal(detail.body.code,'MODEL_NOT_FOUND');
      assert.equal(detail.body.data,undefined);
    }
    const malformed = await get('/api/models/%E0%A4%A');
    assert.equal(malformed.status,400);
    assert.equal(malformed.body.code,'MODEL_ID_INVALID');
    async function asset(url,origin='https://muzikaz.com') {
      const request=Readable.from([]),chunks=[],result={headers:{}};
      Object.assign(request,{url,method:'GET',headers:{host:'localhost',origin},socket:{remoteAddress:'127.0.0.1'}});
      const response=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
      response.setHeader=(name,value)=>{result.headers[name.toLowerCase()]=value;};
      response.getHeader=name=>result.headers[name.toLowerCase()];
      response.writeHead=(status,headers)=>{result.status=status;for(const [name,value]of Object.entries(headers))response.setHeader(name,value);response.headersSent=true;};
      const finished=new Promise((resolve,reject)=>{response.on('finish',resolve);response.on('error',reject);});
      await handler(request,response);await finished;result.body=Buffer.concat(chunks);return result;
    }
    const downloaded=await asset('/uploads/models/public.glb');
    assert.equal(downloaded.status,200);
    assert.equal(downloaded.headers['access-control-allow-origin'],'https://muzikaz.com');
    assert.equal(downloaded.headers['access-control-allow-credentials'],'true');
    assert.equal(downloaded.headers['content-type'],'model/gltf-binary');
    assert.deepEqual(downloaded.body,bytes);
    records[0].modelUrl='uploads/models/public.glb?revision=2#model';
    await writeFile(join(directory,'published-models.json'),JSON.stringify(records));
    assert.equal((await asset('/uploads/models/public.glb')).status,200,'relative metadata references retain query/fragment support');
    assert.equal((await asset('/uploads/models/private.glb')).status,404);
    assert.equal((await asset('/uploads/models/unregistered.glb')).status,404);
    records.push({id:'external',visibility:'public',modelUrl:'https://example.invalid/uploads/models/unregistered.glb'});
    await writeFile(join(directory,'published-models.json'),JSON.stringify(records));
    assert.equal((await asset('/uploads/models/unregistered.glb')).status,404,'external metadata cannot expose unregistered local files');
    const untrusted=await asset('/uploads/models/public.glb','https://example.invalid');
    assert.equal(untrusted.headers['access-control-allow-origin'],undefined);
    const eventRequest=Readable.from([]),eventResult={headers:{},chunks:[]};
    Object.assign(eventRequest,{url:'/api/houses/ioncore-house/events',method:'GET',headers:{host:'localhost',origin:'https://muzikaz.com'},socket:{remoteAddress:'127.0.0.1'}});
    const eventResponse={
      setHeader(name,value){eventResult.headers[name.toLowerCase()]=value;},
      getHeader(name){return eventResult.headers[name.toLowerCase()];},
      writeHead(status,headers){eventResult.status=status;for(const [name,value]of Object.entries(headers))this.setHeader(name,value);this.headersSent=true;},
      write(chunk){eventResult.chunks.push(chunk);}
    };
    await handler(eventRequest,eventResponse);
    assert.equal(eventResult.status,200);
    assert.equal(eventResult.headers['access-control-allow-origin'],'https://muzikaz.com','cross-origin EventSource receives the configured origin');
    assert.equal(eventResult.headers['access-control-allow-credentials'],'true');
    assert.match(eventResult.chunks[0],/event: house-presence-updated/);
    eventRequest.emit('close');
  } finally {
    await fixture?.stopFixture();
    process.env=previous;
    await rm(directory,{recursive:true,force:true});
  }
});
