import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DEFAULTS,SETTINGS_KEY,loadPreferences,savePreferences,historySelection,startVisiblePolling} from '../client/preferences.js';
const store=new Map();
globalThis.window={localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}};
assert.deepEqual(loadPreferences(),DEFAULTS);
const saved={provider:'gemini',openaiModel:'gpt-5.6-luna',geminiModel:'gemini-3.1-flash-lite',localModel:'gemma-heretic-q8',reasoningEffort:'high',thinkingLevel:'minimal',outputFormat:'narrative'};
savePreferences({...saved,secret:'must not persist'});
assert.deepEqual(loadPreferences(),saved);
assert(!store.get(SETTINGS_KEY).includes('secret'));
for(const model of ['gpt-5.5','gpt-5.4','gpt-5.4-mini']) {
  const entry={provider:'openai',model,text:'old result'};
  assert.equal(historySelection(entry,saved).openaiModel,'gpt-5.6-luna');
  assert.equal(entry.model,model);
}
assert.equal(historySelection({provider:'openai',model:'gpt-6-astra'},saved).openaiModel,'gpt-6-astra');
assert.equal(historySelection({provider:'lmstudio',model:'gemma-heretic-q5'},saved).localModel,'gemma-heretic-q5');
assert.equal(historySelection({provider:'lmstudio',model:'unknown'},saved).localModel,'gemma-heretic-q8');
savePreferences({...saved,provider:'lmstudio'});assert.equal(loadPreferences().provider,'lmstudio');
store.set(SETTINGS_KEY,'{bad'); assert.deepEqual(loadPreferences(),DEFAULTS);
store.set(SETTINGS_KEY,JSON.stringify({openaiModel:'gpt-5.5',reasoningEffort:'invalid'}));assert.deepEqual(loadPreferences(),DEFAULTS);
Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')},configurable:true});
assert.deepEqual(loadPreferences(),DEFAULTS);savePreferences(saved);
let listener, timer, cleared=0,calls=0,resolve;
const doc={hidden:false,addEventListener:(_,fn)=>listener=fn,removeEventListener:(_,fn)=>{assert.equal(fn,listener);listener=null}};
const timers={setInterval:(fn,ms)=>{assert.equal(ms,8000);timer=fn;return 1},clearInterval:()=>{cleared++;timer=null}};
const stop=startVisiblePolling(()=>{calls++;return new Promise(r=>resolve=r)},doc,timers);
assert.equal(calls,1);await timer();assert.equal(calls,1);
doc.hidden=true;listener();assert.equal(timer,null);assert.equal(calls,1);
resolve();await Promise.resolve();doc.hidden=false;listener();assert.equal(calls,2);
resolve();await Promise.resolve();stop();assert.equal(listener,null);assert.equal(timer,null);
const hiddenDoc={...doc,hidden:true};const stopHidden=startVisiblePolling(()=>{calls++},hiddenDoc,timers);assert.equal(calls,2);stopHidden();

console.log('PASS: preferences, historical models, storage errors, visibility polling and cleanup.');
