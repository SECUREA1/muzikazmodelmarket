import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {cleanDesignerDraft} from '../public/js/designer-draft-rules.js';
const design={product:'Sticker sheet',character:'Chaos Ape',fields:{product:'avatar-stickers',name:'My art',quantity:'2'},placements:{'preview-name':{left:'30%',top:'60%'}},uploads:[{name:'Art.png',src:'data:image/png;base64,AA==',left:'45%',top:'55%',scale:'1.5',rotate:'30',flipX:'true'}]};
test('designer drafts persist artwork and transforms, isolate owners, and update without consuming another slot',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'designs-'));try{
 const db=new UserJsonDatabase(join(directory,'users.json'));const draft=await db.saveDesignerDraft('alice',{name:'Sheet',design});
 assert.equal((await db.designerDrafts('alice',draft.id)).design.uploads[0].scale,'1.5');assert.deepEqual((await db.designerDrafts('alice',draft.id)).design.placements,design.placements);
 assert.equal((await db.designerDrafts('alice'))[0].design,undefined);assert.equal((await db.designerDrafts('bob')).length,0);
 await assert.rejects(db.designerDrafts('bob',draft.id),/not found/);await assert.rejects(db.deleteDesignerDraft('bob',draft.id),/not found/);await assert.rejects(db.saveDesignerDraft('bob',{id:draft.id,design}),/not found/);
 await db.saveDesignerDraft('alice',{id:draft.id,name:'Updated',design});assert.equal((await db.designerDrafts('alice')).length,1);assert.equal((await db.designerDrafts('alice'))[0].name,'Updated');
 for(let i=0;i<4;i++)await db.saveDesignerDraft('alice',{design});await assert.rejects(db.saveDesignerDraft('alice',{design}),/slots are full/);
 await db.deleteDesignerDraft('alice',draft.id);assert.equal((await db.designerDrafts('alice')).length,4);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('invalid artwork and order quantities are rejected and placements bounded',()=>{
 assert.throws(()=>cleanDesignerDraft({...design,fields:{quantity:'-1'}}),/quantity/);
 assert.throws(()=>cleanDesignerDraft({...design,uploads:[{src:'javascript:alert(1)'}]}),/image source/);
 const cleaned=cleanDesignerDraft({...design,uploads:[{...design.uploads[0],scale:100,left:'900%'}]});assert.equal(cleaned.uploads[0].scale,'2.2');assert.equal(cleaned.uploads[0].left,'50%');
});
