// Local presentation data is optional. Old or damaged values must never stop
// a world from loading, and recovering one key must not clear other progress.
const browserStorage=()=>{try{return globalThis.localStorage||null;}catch{return null;}};
const fresh=value=>value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):value;
export const isGameRecord=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

export function writeGameStorage(key,value,{storage=browserStorage()}={}){
 try{if(!storage)return false;storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}
}

export function readGameJson(key,fallback,{validate=()=>true,storage=browserStorage()}={}){
 let raw;
 try{if(!storage)return fresh(fallback);raw=storage.getItem(key);}catch{return fresh(fallback);}
 if(raw===null||raw===undefined)return fresh(fallback);
 try{const value=JSON.parse(raw);if(validate(value))return value;}catch{}
 const value=fresh(fallback);writeGameStorage(key,value,{storage});return value;
}

export function readGameArray(key,{item=()=>true,storage=browserStorage()}={}){
 const values=readGameJson(key,[],{validate:Array.isArray,storage});
 const clean=values.filter(value=>{try{return item(value);}catch{return false;}});
 if(clean.length!==values.length)writeGameStorage(key,clean,{storage});
 return clean;
}

export function readGameObject(key,{nullable=false,storage=browserStorage()}={}){
 return readGameJson(key,nullable?null:{},{validate:value=>isGameRecord(value)||nullable&&value===null,storage});
}
