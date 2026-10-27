import {readFile} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Ignore examples, generated worker source and comments while finding literal
// browser imports. Bare package imports and computed runtime URLs belong to
// their own loader; this check follows only the deployed relative URL graph.
function codeMask(source){
 const mask=new Uint8Array(source.length).fill(1);
 for(let index=0;index<source.length;){
  const start=index,character=source[index];
  if(character==='"'||character==="'"||character==='`'){
   index++;while(index<source.length){if(source[index]==='\\'){index+=2;continue;}if(source[index++]===character)break;}
   mask.fill(0,start,index);
  }else if(source.startsWith('//',index)){
   index=source.indexOf('\n',index+2);if(index<0)index=source.length;mask.fill(0,start,index);
  }else if(source.startsWith('/*',index)){
   const end=source.indexOf('*/',index+2);index=end<0?source.length:end+2;mask.fill(0,start,index);
  }else if(character==='/'&&(!source.slice(0,index).trim()||/[=(:,\[!&|?{};+*%^~<>-]/.test(source.slice(0,index).trim().at(-1))||/\b(?:return|case|throw|yield|await|else|do|typeof|void|delete|instanceof|in|of)\s*$/.test(source.slice(0,index)))){
   let characterClass=false;index++;
   while(index<source.length){const next=source[index++];if(next==='\\'){index++;continue;}if(next==='[')characterClass=true;else if(next===']')characterClass=false;else if(next==='/'&&!characterClass)break;}
   while(/[a-z]/i.test(source[index]||'')&&index<source.length)index++;mask.fill(0,start,index);
  }else index++;
 }
 return mask;
}
export function browserModuleSpecifiers(source){
 const mask=codeMask(source),imports=[];
 const patterns=[/\b(?:import|export)\s+(?:[^;"'`]*?\bfrom\s*)?(["'])([^"']+)\1/g,/\bimport\s*\(\s*(["'])([^"']+)\1/g];
 for(const pattern of patterns)for(const match of source.matchAll(pattern)){
  if(!mask[match.index]||source[match.index-1]==='.')continue;
  const specifier=match[2];if(specifier.startsWith('.')||specifier.startsWith('/')&&!specifier.startsWith('//'))imports.push(specifier);
 }
 return [...new Set(imports)];
}
export async function verifyBrowserModuleGraph({root='dist',entries=['public/js/house-explorer-glb.js','public/js/hockey-game.js','public/js/arcade-game.js','environment-builder.js']}={}){
 const directory=resolve(root),rootURL=pathToFileURL(directory+sep),visited=new Set();let imports=0;
 async function visit(file,importer,specifier){
  const location=relative(directory,file);
  if(location.startsWith('..'+sep)||location==='..'||isAbsolute(location))throw Error('Browser module '+specifier+' imported by '+importer+' escapes the static build.');
  if(visited.has(file))return;visited.add(file);
  let source;try{source=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')throw Error('Browser module '+(specifier||location)+' imported by '+(importer||'game entrypoint')+' is missing from '+root+'.');throw error;}
  if(!/\.(?:js|mjs)$/i.test(file))return;
  for(const dependency of browserModuleSpecifiers(source)){
   const url=dependency.startsWith('/')?new URL(dependency.slice(1),rootURL):new URL(dependency,pathToFileURL(file));url.search='';url.hash='';imports++;
   await visit(fileURLToPath(url),location,dependency);
  }
 }
 for(const entry of entries)await visit(resolve(directory,entry),null,null);
 return {files:[...visited].map(file=>relative(directory,file)).sort(),imports};
}
