import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {FACTORY_ID} from '../public/js/missile-factory-config.js';
import {PROVING_ID,COMPOUND_ID} from '../public/js/factory-test-config.js';

test('factory expansion allocates the next free adjoining lot without moving an existing map or deed',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-neighbors-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const atlas=new WorldAtlas(join(directory,'atlas.json')),factory={id:FACTORY_ID,name:'Factory',game:'missile-factory',publicDestination:true,visibility:'public',playable:true},range={id:PROVING_ID,name:'Proving grounds',game:'factory-proving',adjacentTo:FACTORY_ID,publicDestination:true,visibility:'public',playable:true,streets:[]};
 const before=await atlas.synchronize([factory]),cell=Object.values(before.cells).find(row=>row.mapId===FACTORY_ID);
 const after=await atlas.synchronize([factory,range]),factoryCell=Object.values(after.cells).find(row=>row.mapId===FACTORY_ID),rangeCell=Object.values(after.cells).find(row=>row.mapId===PROVING_ID);
 assert.equal(factoryCell.column,cell.column);assert.equal(factoryCell.row,cell.row);
 assert.equal(Math.abs(rangeCell.column-cell.column)+Math.abs(rangeCell.row-cell.row),1);assert.deepEqual(rangeCell.streets,[]);
 for(const existing of Object.values(before.cells)){const retained=Object.values(after.cells).find(row=>row.mapId===existing.mapId);if(retained){assert.equal(retained.column,existing.column);assert.equal(retained.row,existing.row);}}
});

test('the factory and proving grounds have reciprocal travel and the compound return remains available',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-directory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const state=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),[]),factory=state.environments.find(map=>map.id===FACTORY_ID),range=state.environments.find(map=>map.id===PROVING_ID),compound=state.environments.find(map=>map.id===COMPOUND_ID);
 assert.ok(range&&compound,'both new permanent destinations are registered');
 assert.ok(factory.portalTargets.includes(PROVING_ID));assert.ok(range.portalTargets.includes(FACTORY_ID));assert.ok(compound.portalTargets.includes(PROVING_ID));
 assert.ok(!range.travelPortals.some(portal=>portal.mapId===COMPOUND_ID),'public travel does not add an unlocked compound portal');
});
