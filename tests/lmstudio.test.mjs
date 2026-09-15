import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLMStudio, discoverModels } from '../server/lmstudio.js';

const models = ['Q5_K_M', 'Q8_0'].map(quant => ({ type: 'llm', key: `gemma-4-e4b-it-heretic@${quant.toLowerCase()}`, display_name: 'Gemma 4 E4B Instruct Heretic', quantization: { name: quant }, capabilities: { vision: true, reasoning: { allowed_options: ['off', 'on'] } } }));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const args = { model: 'gemma-heretic-q5', instruction: 'Describe this image', imageDataUrl: 'data:image/png;base64,AA==' };

test('exact quantization and vision required; DECKARD is never substituted', () => {
  const found = discoverModels([...models, { ...models[1], key: 'gemma-4-e4b-it-the-deckard-heretic', capabilities: { vision: true } }]);
  assert.equal(found[0].key, models[0].key);
  assert.equal(found[1].key, models[1].key);
  assert.equal(discoverModels([{ ...models[0], capabilities: { vision: false } }])[0].available, false);
  assert.equal(discoverModels([{ ...models[1], key: 'gemma-4-e4b-it-the-deckard-heretic' }])[1].available, false);
});

test('each choice sends real image and correct quant, only final output is returned', async () => {
  const requests = [];
  const client = createLMStudio({ fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return json({ models });
    requests.push(JSON.parse(options.body));
    return json({ output: [{ type: 'reasoning', content: 'private thinking' }, { type: 'message', content: 'red square' }], stats: { total_output_tokens: 4 } });
  } });
  for (const [id, quant] of [['gemma-heretic-q5', 'q5_k_m'], ['gemma-heretic-q8', 'q8_0']]) {
    const result = await client.generate({ ...args, model: id });
    assert.equal(result.text, 'red square');
    assert(result.resolvedModel.endsWith(quant));
    assert.deepEqual(requests.at(-1).input[1], { type: 'image', data_url: args.imageDataUrl });
    assert.equal(requests.at(-1).reasoning, 'off');
    assert.equal(requests.at(-1).store, false);
  }
});

test('offline startup is deduplicated and auth failures do not launch a CLI', async () => {
  let online = false, starts = 0;
  const client = createLMStudio({ fetchImpl: async () => { if (!online) throw Error('offline'); return json({ models }); }, runCli: async () => { starts++; online = true; } });
  await Promise.all([client.connect(), client.connect()]);
  assert.equal(starts, 1);
  const locked = createLMStudio({ fetchImpl: async () => json({}, 401), runCli: async () => { throw Error('must not launch'); } });
  await assert.rejects(locked.connect(), e => e.status === 401);
});

test('reject missing vision, unknown selection and empty responses', async () => {
  let chatCalls = 0;
  const client = createLMStudio({ fetchImpl: async url => {
    if (url.endsWith('/models')) return json({ models: [{ ...models[0], capabilities: { vision: false } }] });
    chatCalls++; return json({ output: [] });
  } });
  await assert.rejects(client.generate(args), /비전 보조/);
  await assert.rejects(client.generate({ ...args, model: 'unknown' }), e => e.status === 400);
  assert.equal(chatCalls, 0);
  const empty = createLMStudio({ fetchImpl: async url => json(url.endsWith('/models') ? { models } : { output: [{ type: 'reasoning', content: 'thinking only' }] }) });
  await assert.rejects(empty.generate(args), /반환하지/);
});

test('abort reaches inference and concurrent requests cannot load two models', async () => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const client = createLMStudio({ fetchImpl: async (url, options) => {
    if (url.endsWith('/models')) return json({ models });
    entered();
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  } });
  const controller = new AbortController();
  const pending = client.generate({ ...args, requestSignal: controller.signal });
  await started;
  await assert.rejects(client.generate({ ...args, model: 'gemma-heretic-q8' }), e => e.status === 409);
  controller.abort();
  await assert.rejects(pending, e => e.name === 'AbortError');
});
