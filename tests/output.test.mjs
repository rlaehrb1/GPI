import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {buildInstruction,requireOutputFormat} from '../server/prompt.js';
import {normalizePreferences,historySelection,DEFAULTS} from '../client/preferences.js';
assert.equal(requireOutputFormat(),'narrative');
for(const bad of ['unknown',null,{},'']) assert.throws(()=>requireOutputFormat(bad),e=>e.status===400);
const narrative=buildInstruction('구겨진 셔츠, 단추 세 개가 풀림');
const tags=buildInstruction('구겨진 셔츠, 단추 세 개가 풀림','booru');
assert(narrative.includes('Body: ...')&&narrative.includes('Outfit: ...'));
assert(!tags.includes('Body: ...')&&!tags.includes('full, natural sentences'));
assert(tags.includes('comma-separated')&&tags.includes('underscores')&&tags.includes('Danbooru')&&tags.includes('Gelbooru'));
for(const prompt of [narrative,tags])for(const term of ['misconstrue','distort','euphemize','soften','wrinkles','buttons','구겨진 셔츠'])assert(prompt.includes(term),term);
assert.equal(normalizePreferences({...DEFAULTS,outputFormat:'booru'}).outputFormat,'booru');
assert.equal(normalizePreferences({outputFormat:'bad'}).outputFormat,'narrative');
assert.equal(historySelection({provider:'openai',model:'gpt-5.5'}, {...DEFAULTS,outputFormat:'booru'}).outputFormat,'narrative');
assert.equal(historySelection({provider:'openai',model:'gpt-6-astra',outputFormat:'booru'},DEFAULTS).outputFormat,'booru');
const source=fs.readFileSync(new URL('../server/index.js', import.meta.url),'utf8');
const from=source.indexOf('  app.post("/api/generate"');
const to=source.indexOf('\n  app.use((err',from);
let route;
const requests=[],history=[],logs=[];
const context=vm.createContext({
  app:{post:(url,fn)=>{assert.equal(url,'/api/generate');route=fn}},asyncHandler:fn=>fn,
  compactKeyword:s=>String(s||'').trim().slice(0,120),parseDataUrl:()=>({base64:'AA==',mimeType:'image/png',byteLength:1}),
  buildInstruction,requireOutputFormat,AbortController,
  callOpenAI:async body=>{requests.push(body);return {text:'mock output',finishReason:'STOP',usage:{}}},
  callGemini:async body=>{requests.push(body);return {text:'mock tags',finishReason:'STOP',usage:{}}},
  loadConfig:async()=>({geminiApiKey:'mock-key'}),GEMINI_MODEL_DEFAULT_THINKING:{},
  addHistory:async row=>history.push(row),logEvent:async(event,data)=>logs.push(data)
});
vm.runInContext(source.slice(from,to),context);
async function generate(format,provider='openai'){
  const req=new EventEmitter();req.body={provider,model:provider==='openai'?'gpt-6-astra':'gemini-3.5-flash',keyword:'white_shirt',image:{dataUrl:'data:image/png;base64,AA=='}};
  if(format!==undefined)req.body.outputFormat=format;
  const res=new EventEmitter();res.writableEnded=false;res.json=data=>{res.data=data;res.writableEnded=true};
  await route(req,res);return res.data;
}
assert.equal((await generate()).result.outputFormat,'narrative');
assert(requests.at(-1).instruction.includes('Body: ...'));
assert.equal((await generate('booru')).result.outputFormat,'booru');
assert(requests.at(-1).instruction.includes('comma-separated'));
assert.equal((await generate('booru','gemini')).result.outputFormat,'booru');
assert(requests.at(-1).instruction.includes('comma-separated'));
const before=requests.length;await assert.rejects(generate('bad'),e=>e.status===400);assert.equal(requests.length,before);
assert.equal(history.length,3);assert.equal(logs.at(-1).outputFormat,'booru');
console.log('PASS: prompt fidelity and format separation, Body/Outfit retention, settings/history migration, OpenAI/Gemini request instructions and saved format, invalid format rejected before provider call.');
