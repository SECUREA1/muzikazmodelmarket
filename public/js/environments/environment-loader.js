import {isWorldItemFactoryEnvironment} from '../world-item-factory-config.js';
import {isTropicalIslandEnvironment} from '../tropical-island-config.js';
import {isPrisonEnvironment} from '../prison-config.js';
import {isFitnessEnvironment} from '../fitness-config.js';
import {isProvingEnvironment,isCompoundEnvironment} from '../factory-test-config.js';
import {isFactoryEnvironment} from '../missile-factory-config.js';
import {isCleanCommonsEnvironment} from '../rad-tox-rules.js';
import {builderBaseEnvironment,applyBuilderBaseTransform,builderBaseSpawn} from './builder-base.js';
import { isBasketballEnvironment } from '../basketball-rules.js';
import { isFiringRangeEnvironment } from '../firing-range.js';
import { isCleanSportsEnvironment } from '../sports-worlds.js';

import {createSlimeFloor,collectSlimeFloorMeshes} from './slime-floor.js';
import { replaceServerStreets } from './server-streets.js';
import { createBuilderLand } from './builder-land.js';
import * as THREE from '../../vendor/three/three.module.min.js';
import {createGameModelLoader,loadGameModel,disposeGameModel} from '../game-model-loader.js';
import { Octree } from '../../vendor/three/addons/math/Octree.js';
import { applyWorldQuality } from './environment-quality.js';
import {buildCollision,resolveSafeSpawn} from './environment-collision.js';

export class EnvironmentLoader {
  constructor({ scene, renderer, camera = null, onProgress = () => {}, serverAuthoritative = () => false, localCollision = false }) {
    this.serverAuthoritative=serverAuthoritative;this.localCollision=localCollision;this.camera=camera;
    this.scene = scene; this.renderer = renderer; this.onProgress = onProgress; this.token = 0; this.world = null; this.mixers = []; this.meshes = []; this.collisionMeshes = []; this.floorMeshes = []; this.supplementalCollisionRoots = []; this.octree = new Octree(); this.bounds = new THREE.Box3(); this.activeEnvironment = null; this.baseScale = 1; this.spaceScale = 1;
    this.loader = createGameModelLoader(renderer); this.pendingLoads = new Set();
  }
  disposeMaterial(material,materials=new Set(),textures=new Set()) { if(!material||materials.has(material))return;materials.add(material);for(const value of Object.values(material))if(value?.isTexture&&!value.userData.sportsSurfaceShared&&!textures.has(value)){textures.add(value);value.dispose();}material.dispose?.(); }

  clearFloorEffects() { this.floorSlime?.dispose(); this.floorSlime=null; }
  refreshFloorEffects() { this.clearFloorEffects(); this.floorSlime=this.world&&!isWorldItemFactoryEnvironment(this.activeEnvironment)&&!isTropicalIslandEnvironment(this.activeEnvironment)&&!isPrisonEnvironment(this.activeEnvironment)&&!isProvingEnvironment(this.activeEnvironment)&&!isCompoundEnvironment(this.activeEnvironment)&&!isFactoryEnvironment(this.activeEnvironment)&&!isCleanCommonsEnvironment(this.activeEnvironment)&&!this.activeEnvironment?.airport?.enabled&&!this.activeEnvironment?.builderScene?.layoutMeta?.harbor&&!isCleanSportsEnvironment(this.activeEnvironment)&&!isFiringRangeEnvironment(this.activeEnvironment)?createSlimeFloor(collectSlimeFloorMeshes(this.world)):null; }
  updateEffects(elapsed, reducedMotion=false,serverTime=Date.now()) { this.floorSlime?.update(elapsed,reducedMotion);this.world?.userData.updateIslandEffects?.(elapsed,reducedMotion,serverTime); this.world?.userData.updateBasketballEffects?.(elapsed,reducedMotion);this.world?.userData.updateHarborEffects?.(elapsed,reducedMotion);this.world?.userData.updateCasinoEffects?.(elapsed,reducedMotion);this.world?.userData.updateFunhouseEffects?.(elapsed,reducedMotion,serverTime);this.world?.userData.updateFactoryEffects?.(elapsed,reducedMotion);this.world?.userData.updateTestingEffects?.(elapsed,reducedMotion,serverTime); this.world?.userData.updatePrisonEffects?.(elapsed,reducedMotion); }
  cancelPendingLoads() { for(const controller of this.pendingLoads)controller.abort(); this.pendingLoads.clear(); }
  unload({cancelPending=true} = {}) { if(cancelPending){this.token+=1;this.cancelPendingLoads();}this.clearFloorEffects();if(this.world){this.scene.remove(this.world);this.disposeWorld(this.world,this.mixers);}else this.mixers.forEach(m=>m.stopAllAction());this.mixers=[];this.meshes=[];this.collisionMeshes=[];this.floorMeshes=[];this.supplementalCollisionRoots=[];this.world=null;this.octree=new Octree();this.localCollisionReady=false;this.renderer.renderLists?.dispose?.(); }

  async loadOne(url, index, count, token=this.token) {
    let lastError;
    for (let attempt=0; attempt<2; attempt+=1) {
      if(token!==this.token)throw new DOMException('World loading was cancelled.','AbortError');
      const controller=new AbortController();this.pendingLoads.add(controller);let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},30000);
      try {
        // Settle the aborted transport before retrying to avoid duplicate
        // downloads. The shared loader discards late decoder-worker results.
        const gltf=await loadGameModel(this.loader,url,{signal:controller.signal,onProgress:event=>{
          if(!controller.signal.aborted&&token===this.token)this.onProgress(((index+(event.total?event.loaded/event.total:.35))/count)*100);
        }});
        if(controller.signal.aborted||token!==this.token){disposeGameModel(gltf);throw new DOMException('World loading was cancelled.','AbortError');}
        return gltf;
      } catch(error){
        if(token!==this.token||controller.signal.aborted&&!timedOut)throw error;
        lastError=timedOut?new Error('Map asset request timed out: '+url,{cause:error}):error;
      } finally {clearTimeout(timer);this.pendingLoads.delete(controller);}
    }
    throw lastError;
  }


  createBuilderLand(environment){const root=createBuilderLand(environment);replaceServerStreets(root,environment.streets||environment.builderScene?.streets||[],{labels:true});return root;}

  setSpaceScale(scale) {
    if (!this.world) return null;
    const nextScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.1, 100);
    this.spaceScale = nextScale;
    this.world.scale.setScalar(this.baseScale * this.spaceScale);
    this.world.updateMatrixWorld(true);
    const collision = buildCollision(this.world, this.activeEnvironment?.collisionMode, this.supplementalCollisionRoots,{buildOctree:this.localCollision||!this.serverAuthoritative()});
    this.localCollisionReady=collision.octreeBuilt!==false;this.meshes = collision.visibleMeshes;
    this.collisionMeshes = collision.collisionMeshes;
    this.floorMeshes = collision.floorMeshes;
    this.octree = collision.octree;
    this.bounds = new THREE.Box3().setFromObject(this.world);
    return { scale: this.spaceScale, collision, bounds: this.bounds };
  }
  setSupplementalCollisionRoots(roots = []) {
    this.supplementalCollisionRoots = roots.filter(Boolean);
    if (!this.world) return null;
    const collision = buildCollision(this.world, this.activeEnvironment?.collisionMode, this.supplementalCollisionRoots,{buildOctree:this.localCollision||!this.serverAuthoritative()});
    this.localCollisionReady=collision.octreeBuilt!==false;this.meshes = collision.visibleMeshes; this.collisionMeshes = collision.collisionMeshes; this.floorMeshes = collision.floorMeshes; this.octree = collision.octree;
    return collision;
  }
  disposeWorld(world,mixers=[]) {
    mixers.forEach(mixer=>mixer.stopAllAction());const geometries=new Set(),materials=new Set(),textures=new Set();
    world.traverse(object=>{if(object.geometry&&!geometries.has(object.geometry)){geometries.add(object.geometry);object.geometry.dispose?.();}for(const material of [].concat(object.material||[]))this.disposeMaterial(material,materials,textures);});
  }

  async load(environment) {
    this.cancelPendingLoads();
    const base=builderBaseEnvironment(environment);if(base)environment={...base,...environment,modelUrl:base.modelUrl,modelUrls:base.modelUrls,scale:base.scale,spaceScale:base.spaceScale,rotation:base.rotation,playableSize:base.playableSize,spawn:builderBaseSpawn(environment)};
    const token = ++this.token; const builderLand = Boolean(!base&&(environment.builderScene || environment.proceduralLand)); const urls = builderLand ? [] : (environment.modelUrls?.length ? environment.modelUrls : [environment.modelUrl].filter(Boolean));
    const nextWorld = new THREE.Group(); nextWorld.name = `WORLD_${environment.id}`; const baseScale = Number(environment.scale) || 1; let spaceScale = Number(environment.spaceScale) || 1; nextWorld.userData.baseScale = baseScale; nextWorld.scale.setScalar(baseScale * spaceScale); nextWorld.rotation.set(environment.rotation?.x || 0, environment.rotation?.y || 0, environment.rotation?.z || 0);
    nextWorld.userData.cleanSportsWorld=isCleanSportsEnvironment(environment);
    const nextMixers = [];
    try {
      if (builderLand) {const land=this.createBuilderLand(environment);nextWorld.add(land);nextWorld.userData.streetHeightAt=land.userData.streetHeightAt;for(const key of ['updateIslandEffects','setIslandState','setPrisonState','setPrisonDoor','updatePrisonEffects','updateFactoryTestingEffects','setFactoryTestingState','updateTestingEffects','setTestingState','updateFactoryEffects','setFactoryState','updateFitnessEffects','updateSkiEffects','updateHarborEffects','updateCasinoEffects','animateCasinoStation','updateFunhouseEffects','setFunhouseState','animateFunhouseStation','basketball','updateBasketballScoreboard','setBasketballState','updateBasketballEffects'])if(land.userData[key])nextWorld.userData[key]=land.userData[key];}

      else if (!urls.length) throw new Error('This environment has neither a 3D model nor a playable builder land definition.');
      for (let i = 0; i < urls.length; i += 1) {
        const gltf = await this.loadOne(urls[i], i, urls.length, token); if (token !== this.token) { nextWorld.add(gltf.scene); this.disposeWorld(nextWorld,nextMixers); return null; }
        gltf.scene.name = `GLB_${environment.id}_${i + 1}`; nextWorld.add(gltf.scene);
        if (gltf.animations?.length) { const mixer = new THREE.AnimationMixer(gltf.scene); gltf.animations.forEach((clip) => mixer.clipAction(clip).play()); nextMixers.push(mixer); }
      }
      nextWorld.updateMatrixWorld(true);
      const authoredBounds = new THREE.Box3().setFromObject(nextWorld);
      const authoredSize = authoredBounds.getSize(new THREE.Vector3());
      const authoredFootprint = Math.max(authoredSize.x, authoredSize.z);
      const playableSize = Number(environment.playableSize);
      if (!isTropicalIslandEnvironment(environment) && !isPrisonEnvironment(environment) && !isBasketballEnvironment(environment) && !isFitnessEnvironment(environment) && playableSize > 0 && authoredFootprint > 0) {
        const normalization = THREE.MathUtils.clamp(playableSize / authoredFootprint, 0.01, 100);
        spaceScale *= normalization;
        nextWorld.scale.setScalar(baseScale * spaceScale);
        nextWorld.userData.playableSize = playableSize;
        nextWorld.userData.authoredFootprint = authoredFootprint;
        nextWorld.updateMatrixWorld(true);
      }
      if(base)applyBuilderBaseTransform(nextWorld,environment.builderScene.baseTransform);
      const quality = applyWorldQuality(nextWorld, this.renderer);
      // Prepare streamed materials before the world becomes visible. Three uses
      // parallel shader compilation when the browser supports it.
      if(this.camera&&this.renderer.compileAsync&&(!this.serverAuthoritative()||Number(quality.triangleCount||0)<=60000))await this.renderer.compileAsync(nextWorld,this.camera,this.scene);
      if(token!==this.token){this.disposeWorld(nextWorld,nextMixers);return null;}
      const collision = buildCollision(nextWorld, environment.collisionMode,[],{buildOctree:this.localCollision||!this.serverAuthoritative()});
      if (!collision.visibleMeshes.length) throw new Error('Missing meshes: the environment loaded, but no renderable world meshes were found.');
      const spawn = resolveSafeSpawn(nextWorld, collision.floorMeshes, builderLand?(builderBaseSpawn(environment)||environment.spawn||{}):environment.spawn);
      this.unload({cancelPending:false}); this.baseScale=baseScale; this.spaceScale=spaceScale; this.world = nextWorld; this.activeEnvironment = environment; this.mixers = nextMixers; this.localCollisionReady=collision.octreeBuilt!==false;this.meshes = collision.visibleMeshes; this.collisionMeshes = collision.collisionMeshes; this.floorMeshes = collision.floorMeshes; this.octree = collision.octree; this.bounds = spawn.bounds; this.scene.add(nextWorld); this.refreshFloorEffects(); this.onProgress(100);
      return { world: nextWorld, mixers: nextMixers, meshes: collision.visibleMeshes, octree: collision.octree, spawn, quality, collision, scale: this.spaceScale };
    } catch (error) { this.disposeWorld(nextWorld,nextMixers); if(token!==this.token)return null; throw error; }
  }
}
