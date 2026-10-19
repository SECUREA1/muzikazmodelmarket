import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative,extname,sep} from 'node:path';

const sourceExtensions=new Set(['.html','.htm','.js','.mjs','.css']);
const runtimeExtensions=new Set(['.js','.mjs','.css']);
const origin='https://static-release.invalid';

/** Add one release to every local module edge and document-based script URL. */
export function releaseAssetUrl(value,importer,revision,assets){
 if(typeof value!=='string'||!value||/[\s\\<>]/.test(value)||/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))return value;
 const pathname=value.split(/[?#]/,1)[0];
 if(!runtimeExtensions.has(extname(pathname).toLowerCase()))return value;
 let found=false;
 try{const base=new URL(importer.replace(/^\//,''),origin+'/');found=[new URL(value,base),new URL(value,origin+'/')].some(url=>assets.has(decodeURIComponent(url.pathname).replace(/^\//,'')));}catch{return value;}
 if(!found)return value;
 const hashIndex=value.indexOf('#'),hash=hashIndex<0?'':value.slice(hashIndex),withoutHash=hashIndex<0?value:value.slice(0,hashIndex),queryIndex=withoutHash.indexOf('?');
 const path=queryIndex<0?withoutHash:withoutHash.slice(0,queryIndex),query=new URLSearchParams(queryIndex<0?'':withoutHash.slice(queryIndex+1).replace(/&amp;/g,'&'));
 query.set('release',revision);
 return path+'?'+query.toString()+hash;
}

export function versionStaticSource(source,path,revision,assets){
 // Existing-file validation keeps API URLs, external dependencies, and user
 // model paths unchanged. This also covers classic launchers' module.src and
 // new URL()/dynamic import() references, without editing maintained sources.
 return source.replace(/(["'])([^"'\r\n<>]+\.(?:m?js|css)(?:[?#][^"'\r\n<>]*)?)\1/g,(literal,quote,value)=>quote+releaseAssetUrl(value,path,revision,assets)+quote);
}

async function collect(directory){
 const files=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory())files.push(...await collect(path));else if(entry.isFile()&&sourceExtensions.has(extname(entry.name).toLowerCase()))files.push(path);
 }
 return files.sort();
}

export async function releaseStaticAssets(directory){
 const files=await collect(directory),sources=await Promise.all(files.map(async path=>({file:path,path:relative(directory,path).split(sep).join('/'),source:await readFile(path,'utf8')})));
 const hash=createHash('sha256');
 for(const {path,source}of sources)hash.update(path).update('\0').update(source).update('\0');
 const revision=hash.digest('hex').slice(0,20),assets=new Set(sources.map(({path})=>path));
 for(const {file,path,source}of sources){
  let output=versionStaticSource(source,path,revision,assets);
  if(path==='service-worker.js')output=output.replace("const RELEASE = 'development';",`const RELEASE = '${revision}';`);
  if(output!==source)await writeFile(file,output);
 }
 await writeFile(join(directory,'asset-release.json'),JSON.stringify({revision,assets:[...assets]},null,2)+'\n');
 return {revision,assets:[...assets]};
}

export async function validateStaticRelease(directory){
 const manifest=JSON.parse(await readFile(join(directory,'asset-release.json'),'utf8'));
 if(!/^[a-f0-9]{20}$/.test(manifest.revision)||!Array.isArray(manifest.assets))throw new Error('The static build is missing its release manifest.');
 const assets=new Set(manifest.assets);
 for(const path of assets){
  const source=await readFile(join(directory,path),'utf8');
  if(versionStaticSource(source,path,manifest.revision,assets)!==source)throw new Error(`Static code in ${path} mixes release revisions.`);
  if(!['.js','.mjs'].includes(extname(path)))continue;
  const imports=[...source.matchAll(/^\s*(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?['"]([^'"]+)['"]/gm),...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)];
  for(const [,specifier]of imports){
   if(!/^(?:\.{1,2}\/|\/(?!\/))/.test(specifier)||!runtimeExtensions.has(extname(specifier.split(/[?#]/,1)[0])))continue;
   const target=new URL(specifier,new URL(path,origin+'/'));
   if(!assets.has(decodeURIComponent(target.pathname).slice(1)))throw new Error(`Module ${specifier} imported by ${path} is missing from the static build.`);
   if(target.searchParams.get('release')!==manifest.revision)throw new Error(`Module ${specifier} imported by ${path} has the wrong release revision.`);
  }
 }
 return manifest;
}
