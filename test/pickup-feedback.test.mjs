import test from 'node:test';
import assert from 'node:assert/strict';
import {playPickupChime} from '../public/js/pickup-feedback.js';
test('pickup chimes schedule three short rising notes and respect muted effects',()=>{
 const notes=[],context={state:'running',currentTime:4,destination:{},createOscillator(){const note={frequency:{setValueAtTime:value=>{note.hz=value;}},connect(){},disconnect(){},start:at=>{note.start=at;},stop:at=>{note.stop=at;}};notes.push(note);return note;},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}};
 playPickupChime(context,null,{coin:true});assert.equal(notes.length,3);assert.ok(notes[0].hz<notes[1].hz&&notes[1].hz<notes[2].hz);assert.ok(notes[2].stop-context.currentTime<.3);
 playPickupChime(context,null,{volume:0});assert.equal(notes.length,3);
 context.state='suspended';playPickupChime(context);assert.equal(notes.length,3);
});
