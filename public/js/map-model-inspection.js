// Explicit diagnostics: inspect the installed map when requested, without
// traversing its geometry during ordinary gameplay snapshots or animation.
export function inspectMapModels({world,decor,expected=[],actors=[],renderer,pending={}}={}){
 const geometryChecks=new Map();
 function geometryIssue(geometry){
  if(geometryChecks.has(geometry))return geometryChecks.get(geometry);
  const position=geometry?.attributes?.position;let issue=null;
  if(!position||!Number.isFinite(position.count)||position.count<1)issue='empty geometry';
  else if(position.isInterleavedBufferAttribute){
   for(let i=0;i<position.count;i++)if(!Number.isFinite(position.getX(i))||!Number.isFinite(position.getY(i))||!Number.isFinite(position.getZ(i))){issue='non-finite vertices';break;}
  }else if(position.array){for(const value of position.array)if(!Number.isFinite(value)){issue='non-finite vertices';break;}}
  geometryChecks.set(geometry,issue);return issue;
 }
 function meshes(root){
  const result={meshes:0,visibleMeshes:0,triangles:0,invalid:[],empty:[]};
  if(!root)return result;root.updateMatrixWorld(true);
  root.traverse(node=>{
   if(!node.isMesh)return;
   const count=node.isInstancedMesh?Math.max(0,Number(node.count)||0):1;
   if(!count)return;
   const issue=geometryIssue(node.geometry),name=node.name||node.type||'Mesh';
   if(issue==='empty geometry'){result.empty.push(name);return;}
   result.meshes++;
   let visible=true;for(let parent=node;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}
   if(visible)result.visibleMeshes++;
   result.triangles+=Math.floor((node.geometry.index?.count||node.geometry.attributes.position.count)/3)*count;
   if(issue)result.invalid.push({name,issue});
   else if(node.matrixWorld.elements.some(value=>!Number.isFinite(value)))result.invalid.push({name,issue:'non-finite transform'});
  });return result;
 }
 const environment=meshes(world),placed=meshes(decor),objects=Array.isArray(expected)?expected:[];
 const key=(item,index)=>String(item.id||`Builder_${item.modelId}_${index}`);
 const required=objects.map((item,index)=>({item,id:key(item,index)})).filter(({item})=>!item.casinoStation);
 const loaded=new Map();
 for(const root of decor?.children||[]){const id=String(root.userData.builderObjectId||root.name);loaded.set(id,root);}
 const missing=[],empty=[];
 for(const {id}of required){const root=loaded.get(id);if(!root)missing.push(id);else if(!meshes(root).meshes)empty.push(id);}
 const ids=required.map(({id})=>id),duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
 const embedded={expected:0,loaded:0,missing:[],empty:[]};
 for(const [index,item]of objects.entries())if(item.casinoStation){
  embedded.expected++;const id=key(item,index),normalized=id.replaceAll('-','_').toUpperCase();
  let root=world?.getObjectByName(id);
  if(!root)world?.traverse(node=>{if(!root&&(node.name===normalized||node.name.startsWith(normalized+'_')))root=node;});
  if(!root)embedded.missing.push(id);else if(!meshes(root).meshes)embedded.empty.push(id);else embedded.loaded++;
 }
 const dynamic={expected:0,loaded:0,missing:[],empty:[]};
 for(const actor of Array.isArray(actors)?actors:[]){
  if(actor.rangeManaged||actor.rangeTarget||actor.active===false||(!actor.spawned&&!actor.worldGateway))continue;
  dynamic.expected++;const id=String(actor.id),root=loaded.get(id);
  if(!root)dynamic.missing.push(id);else if(!meshes(root).meshes)dynamic.empty.push(id);else dynamic.loaded++;
 }
 const render=renderer?.info?.render||{},memory=renderer?.info?.memory||{};
 return {environment,placed,embedded,actors:dynamic,placements:{expected:required.length,loaded:required.filter(({id})=>loaded.has(id)).length,
  modelTypes:new Set(required.map(({item})=>item.modelId)).size,missing,empty,duplicates,
  deferred:objects.filter(item=>item.casinoStation).map((item,index)=>key(item,index))},
  pending:{environment:Number(pending.environment)||0,authored:Number(pending.authored)||0,
   actors:typeof pending.actors==='number'?pending.actors:[...(pending.actors||[])].filter(id=>!loaded.has(String(id))).length},
  render:{calls:Number(render.calls)||0,triangles:Number(render.triangles)||0,lines:Number(render.lines)||0,points:Number(render.points)||0,
   geometries:Number(memory.geometries)||0,textures:Number(memory.textures)||0}};
}
