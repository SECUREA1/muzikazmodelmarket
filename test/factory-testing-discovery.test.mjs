import test from 'node:test';
import assert from 'node:assert/strict';
import {factoryProvingGroundsWorld,mountainCompoundWorld} from '../factory-testing-world.mjs';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {mapSectorKind,mapWheelSvg} from '../public/js/map-wheel-svg.js';
import {filterWorlds,filterWorldCategory,sortWorlds} from '../public/js/world-map-picker.js';
import {destinationTheme,destinationIcon,isProvingDestination,isCompoundDestination} from '../public/js/atlas-destinations.js';

test('production, proving grounds and locked compound retain distinct searchable map identities',()=>{
 const factory=missileFactoryWorld(),proving=factoryProvingGroundsWorld(),compound=mountainCompoundWorld(),worlds=[factory,proving,compound].map(env=>({env,count:0}));
 assert.equal(mapSectorKind(factory),'factory');assert.equal(mapSectorKind(proving),'proving');assert.equal(mapSectorKind(compound),'compound');
 assert.equal(destinationTheme(proving),'proving');assert.equal(destinationTheme(compound),'compound');assert.equal(destinationIcon(proving),'🚀');assert.equal(destinationIcon(compound),'🔒');
 assert.equal(filterWorldCategory(worlds,'proving')[0].env.id,proving.id);assert.equal(filterWorldCategory(worlds,'compound')[0].env.id,compound.id);
 assert.equal(filterWorlds(worlds,'rocket tests')[0].env.id,proving.id);assert.ok(filterWorlds(worlds,'locked containment').some(({env})=>env.id===compound.id));
 assert.deepEqual(sortWorlds([...worlds].reverse()).map(({env})=>env.id),[factory.id,proving.id,compound.id]);
 const svg=mapWheelSvg(worlds,proving.id);assert.match(svg,/data-kind="proving"/);assert.match(svg,/data-kind="compound"/);assert.match(svg,/Mountain Compound/);
});

test('custom test layouts inherit their map kinds without being identified as the canonical locked facility',()=>{
 const copied={id:'custom-compound',builderScene:{sourceFactoryTesting:{enabled:true,kind:'compound'}}},range={id:'custom-range',builderScene:{layoutMeta:{factoryTesting:{enabled:true,kind:'proving'}}}};
 assert.equal(mapSectorKind(copied),'compound');assert.ok(isCompoundDestination(copied));assert.equal(mapSectorKind(range),'proving');assert.ok(isProvingDestination(range));
 assert.notEqual(copied.id,'muzikaz-mountain-compound');assert.equal(copied.clearance,undefined);
});
