import * as THREE from '../vendor/three/three.module.min.js';
import {finishNativeDesign} from './native-design-system.js';

let forgeFactory;
const loadForge=()=>forgeFactory ||= import('./forge-models.js?v=forge-metallurgy-20261031');

/** A fresh world directory can arrive while a browser still has an older
 * native model catalogue. Forge identities have their own real model factory;
 * recover that catalogue without substituting a placeholder for an item. */
export async function resolveRuntimeNativeModel(id,{create,loadForgeModels=loadForge}={}){
 if(typeof id!=='string'||!id)return null;
 const model=create(id);
 if(model||!id.startsWith('forge-'))return model;
 const {createForgeModel}=await loadForgeModels();
 return finishNativeDesign(THREE,createForgeModel(id),id);
}
