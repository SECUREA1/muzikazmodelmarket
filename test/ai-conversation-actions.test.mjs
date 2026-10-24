import test from 'node:test';
import assert from 'node:assert/strict';
import {aiConversationIntent,constructionJobForRequest} from '../server-ai-interactions.mjs';

const actions=[{id:'work-demonstrate',label:'Show a machine job'},{id:'work-stop',label:'Stop my demonstration'},
 {id:'world:door:garden-door',kind:'door',targetName:'Garden door',label:'Open or close Garden door'},
 {id:'world:switch:garden-beacon',kind:'switch',targetName:'Garden beacon',label:'Test Garden beacon'}];

test('questions about player controls do not start AI jobs; direct requests can',()=>{
 for(const text of ['How do I run the crane?','How can I start production?','How should I operate this machine?','How can I help?'])assert.equal(aiConversationIntent('question',text,actions),null,text);
 for(const text of ['Can you run the crane?','Show me a production cycle.','Please operate the excavator.'])assert.equal(aiConversationIntent('question',text,actions),'work-demonstrate',text);
 assert.equal(aiConversationIntent('question','What is the machine crew working on?',actions),'work-status');
 assert.equal(aiConversationIntent('question','Stop my machine demonstration.',actions),'work-stop');
 assert.equal(aiConversationIntent('question','Please stop.',actions),'work-stop');
 assert.equal(aiConversationIntent('question','Please stop.',[...actions,{id:'ai-stop'}]),'ai-stop');
 assert.equal(aiConversationIntent('question','Buy a parts kit with my wallet.',actions),null);
});

test('requested machine work selects its real construction job',()=>{
 for(const [text,id]of [['Show me the crane.','steel'],['Run the excavator.','dig'],['Demonstrate loading.','load'],['Operate the dump truck.','haul'],['Tip the material.','dump'],['Show me grading with the bulldozer.','grade']])assert.equal(constructionJobForRequest(text),id,text);
 assert.equal(constructionJobForRequest('Show me a machine job.'),undefined);
 assert.equal(aiConversationIntent('question','Show me grading.',actions),'work-demonstrate');
});

test('natural object requests select actual offered props and leave ordinary conversation intact',()=>{
 assert.equal(aiConversationIntent('question','Open the garden door, please.',actions),'world:door:garden-door');
 assert.equal(aiConversationIntent('question','Can you toggle the garden beacon?',actions),'world:switch:garden-beacon');
 assert.equal(aiConversationIntent('question','How do I open the garden door?',actions),null);
 assert.equal(aiConversationIntent('question','What can you do?',actions),'ai-capabilities');
 assert.equal(aiConversationIntent('question','Thank you for helping.',actions),null);
 assert.equal(aiConversationIntent('help','run the crane',actions),null);
});
