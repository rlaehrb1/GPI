import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const LOCAL_MODELS = [
  { id: 'gemma-heretic-q5', label: 'Gemma 4 E4B · Q5_K_M', quantization: 'Q5_K_M' },
  { id: 'gemma-heretic-q8', label: 'Gemma 4 E4B · Q8_0', quantization: 'Q8_0' }
];

function failure(message, status = 503) {
  return Object.assign(new Error(message), { status });
}

// Resolve the exact base model and quantization, never a similarly named fine-tune.
export function discoverModels(models) {
  return LOCAL_MODELS.map(choice => {
    const matches = models.filter(model => {
      const name = `${model.key} ${model.display_name}`.toLowerCase();
      return model.type === 'llm' && /gemma.?4.?e4b/.test(name)
        && name.includes('heretic') && !name.includes('deckard')
        && model.quantization?.name?.toUpperCase() === choice.quantization;
    }).sort((a, b) => Number(a.key.startsWith('local/')) - Number(b.key.startsWith('local/')));
    const model = matches.find(item => item.capabilities?.vision === true) || matches[0];
    return {
      ...choice,
      key: model?.key || null,
      available: model?.capabilities?.vision === true,
      loaded: Boolean(model?.loaded_instances?.length),
      reasoningOff: model?.capabilities?.reasoning?.allowed_options?.includes('off') || false,
      reason: !model ? '모델 설치 필요' : !model.capabilities?.vision ? '비전 보조 파일 확인 필요' : ''
    };
  });
}

export function createLMStudio({
  baseUrl = process.env.LMSTUDIO_BASE_URL || 'http://127.0.0.1:1234',
  fetchImpl = fetch,
  runCli = async (port) => {
    const local = path.join(homedir(), '.lmstudio', 'bin', process.platform === 'win32' ? 'lms.exe' : 'lms');
    await execFileAsync(existsSync(local) ? local : 'lms', ['server', 'start', '--port', String(port)], {
      windowsHide: true, timeout: 30000, maxBuffer: 128 * 1024
    });
  }
} = {}) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('LMSTUDIO_BASE_URL은 이 기기의 http://127.0.0.1 주소여야 합니다.');
  }
  const origin = url.origin;
  let connecting = null;
  let generating = false;
  async function request(endpoint, { signal, timeout = 4000, ...options } = {}) {
    const combined = AbortSignal.any([AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
    const response = await fetchImpl(`${origin}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(process.env.LMSTUDIO_API_TOKEN ? { Authorization: `Bearer ${process.env.LMSTUDIO_API_TOKEN}` } : {}) },
      signal: combined
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw failure('LM Studio에 API 인증이 설정되어 있습니다. 서버의 LMSTUDIO_API_TOKEN 설정을 확인하세요.', 401);
      if (response.status === 404) throw failure('LM Studio를 0.4 이상으로 업데이트한 뒤 다시 연결하세요.');
      throw failure(`LM Studio: ${data.error?.message || data.error || data.message || response.statusText}`, response.status);
    }
    return data;
  }
  async function status() {
    try {
      const data = await request('/api/v1/models');
      if (!Array.isArray(data.models)) throw failure('LM Studio 모델 목록을 읽지 못했습니다.');
      return { running: true, connecting: Boolean(connecting), models: discoverModels(data.models) };
    } catch (error) {
      return { running: false, connecting: Boolean(connecting), models: discoverModels([]),
        message: error.status ? error.message : 'LM Studio에 연결되지 않았습니다. 눌러서 자동 연결하세요.',
        authRequired: error.status === 401 };
    }
  }
  async function connect() {
    if (connecting) return connecting;
    connecting = (async () => {
      const before = await status();
      if (before.running) return before;
      if (before.authRequired) throw failure(before.message, 401);
      try { await runCli(url.port || 80); }
      catch { throw failure('LM Studio 자동 연결에 실패했습니다. LM Studio를 설치·실행한 뒤 다시 눌러 주세요.'); }
      const after = await status();
      if (!after.running) throw failure(after.message);
      return after;
    })();
    try { return await connecting; }
    finally { connecting = null; }
  }
  async function generate({ model, instruction, imageDataUrl, requestSignal }) {
    if (!LOCAL_MODELS.some(item => item.id === model)) throw failure('지원하지 않는 로컬 모델입니다.', 400);
    if (generating) throw failure('로컬 모델이 생성 중입니다. 완료 또는 중단 후 다시 시도하세요.', 409);
    generating = true;
    try {
      requestSignal?.throwIfAborted();
      const current = await connect();
      requestSignal?.throwIfAborted();
      const selected = current.models.find(item => item.id === model);
      if (!selected?.available) throw failure(`${selected?.label}: ${selected?.reason}. LM Studio에서 해당 모델과 mmproj 파일을 확인하세요.`, 400);
      // Native chat loads on demand. Do not unload models owned by other apps.
      const data = await request('/api/v1/chat', {
        method: 'POST', signal: requestSignal, timeout: 300000,
        body: JSON.stringify({
          model: selected.key,
          input: [{ type: 'text', content: instruction }, { type: 'image', data_url: imageDataUrl }],
          context_length: 8192, max_output_tokens: 2000, temperature: 0.4,
          ...(selected.reasoningOff ? { reasoning: 'off' } : {}),
          stream: false, store: false
        })
      });
      const text = (data.output || []).filter(item => item.type === 'message').map(item => item.content).join('\n').trim();
      if (!text) throw failure('로컬 모델이 이미지 설명을 반환하지 않았습니다. 다른 모델로 다시 시도하세요.', 502);
      return { text, finishReason: 'STOP', usage: data.stats || {}, resolvedModel: selected.key };
    } catch (error) {
      if (requestSignal?.aborted) throw error;
      if (error.name === 'TimeoutError') throw failure('로컬 생성이 5분을 초과했습니다. Q5_K_M 모델이나 더 작은 이미지로 다시 시도하세요.', 504);
      if (error.status) throw error;
      throw failure('LM Studio 연결이 끊겼습니다. 상단 LM Studio 버튼으로 다시 연결하세요.');
    } finally { generating = false; }
  }
  return { status, connect, generate };
}
