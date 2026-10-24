import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('public RSS is discoverable and served as a feed while sitemap remains ordinary XML',async t=>{
 const port=await new Promise(resolve=>{
  const listener=createServer();listener.listen(0,'127.0.0.1',()=>{const port=listener.address().port;listener.close(()=>resolve(port));});
 });
 const directory=await mkdtemp(join(tmpdir(),'muzikaz-feed-'));
 const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),MUZIKAZ_DATA_DIR:directory},stdio:'ignore'});
 t.after(async()=>{
  if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  await rm(directory,{recursive:true,force:true});
 });
 const base=`http://127.0.0.1:${port}`;
 let ready=false;
 for(let attempt=0;attempt<100;attempt++){
  if(child.exitCode!==null)throw Error('Feed test server exited before becoming ready.');
  try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,50));
 }
 assert.ok(ready,'feed test server becomes ready');
 const page=await fetch(base+'/model-explorer.html');
 assert.ok(page.ok);
 assert.match(await page.text(),/<link\b[^>]*type="application\/rss\+xml"[^>]*href="feed\.xml"/);
 const feed=await fetch(base+'/feed.xml');
 assert.equal(feed.status,200);
 assert.equal(feed.headers.get('content-type'),'application/rss+xml; charset=utf-8');
 const body=await feed.text();
 assert.match(body,/<rss\b[^>]*version="2\.0"/);
 assert.match(body,/<channel>[\s\S]*<title>MUZIKAZ Drops Feed<\/title>/);
 assert.ok((body.match(/<item>/g)||[]).length>0,'the feed has published entries');
 const sitemap=await fetch(base+'/sitemap.xml');
 assert.equal(sitemap.status,200);
 assert.equal(sitemap.headers.get('content-type'),'application/xml; charset=utf-8');
});
