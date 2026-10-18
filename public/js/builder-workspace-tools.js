const name=model=>String(model.formLabel||model.name||'');
export function sortBuilderItems(items,{sort='name',scope='all',favorites=[],recent=[]}={}){
 const stars=new Set(favorites),used=new Map(recent.map((id,index)=>[id,index]));
 const filtered=items.filter(m=>scope==='favorites'?stars.has(m.id):scope==='recent'?used.has(m.id):scope==='backpack'?m.ownedBuilder||m.category==='backpack':scope==='custom'?m.custom||m.assetKind==='custom-svg':true);
 return [...filtered].sort((a,b)=>sort==='recent'||scope==='recent'?(used.get(a.id)??1e9)-(used.get(b.id)??1e9)||name(a).localeCompare(name(b)):sort==='category'?String(a.category||a.type||'').localeCompare(String(b.category||b.type||''))||name(a).localeCompare(name(b)):sort==='name-desc'?name(b).localeCompare(name(a)):name(a).localeCompare(name(b)));
}
export function rememberBuilderItem(recent,id){return [id,...recent.filter(value=>value!==id)].slice(0,60);}
export function tuningSnapshot(object){return structuredClone({position:object.position,rotation:object.rotation,scale:object.scale,groundOffset:object.groundOffset});}
export function createTuningHistory(limit=50){
 const undo=[],redo=[];
 return {record(id,before,after){if(JSON.stringify(before)===JSON.stringify(after))return;undo.push({id,before,after});if(undo.length>limit)undo.shift();redo.length=0;},undo(id){if(undo.at(-1)?.id!==id)return null;const record=undo.pop();redo.push(record);return structuredClone(record.before);},redo(id){if(redo.at(-1)?.id!==id)return null;const record=redo.pop();undo.push(record);return structuredClone(record.after);},canUndo:id=>undo.at(-1)?.id===id,canRedo:id=>redo.at(-1)?.id===id};
}
export function finiteTuning(value,min,max){const number=Number(value);return String(value).trim()!==''&&Number.isFinite(number)?Math.max(min,Math.min(max,number)):null;}
