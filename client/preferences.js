// Lightweight browser settings shared by the portable UI and its checks.
export const SETTINGS_KEY = 'gpi.preferences.v1';
export const DEFAULTS = Object.freeze({
  provider: 'openai', openaiModel: 'gpt-6-astra',
  geminiModel: 'gemini-3.5-flash', localModel: 'gemma-heretic-q5', reasoningEffort: 'medium', thinkingLevel: 'medium',
  outputFormat: 'narrative'
});
const ALLOWED = {
  provider: ['openai', 'gemini', 'lmstudio'],
  localModel: ['gemma-heretic-q5', 'gemma-heretic-q8'],
  openaiModel: ['gpt-6-astra', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  geminiModel: ['gemini-3.5-flash', 'gemini-3.1-flash-lite'],
  reasoningEffort: ['low', 'medium', 'high', 'xhigh'],
  thinkingLevel: ['minimal', 'low', 'medium', 'high'],
  outputFormat: ['narrative', 'booru']
};
export function normalizePreferences(value) {
  return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key,
    ALLOWED[key].includes(value?.[key]) ? value[key] : DEFAULTS[key]
  ]));
}
export function loadPreferences() {
  try { return normalizePreferences(JSON.parse(window.localStorage.getItem(SETTINGS_KEY))); }
  catch { return { ...DEFAULTS }; }
}
export function savePreferences(value) {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizePreferences(value))); }
  catch { /* Storage may be disabled or full. The app still works in memory. */ }
}
export function historySelection(entry, current) {
  const result = normalizePreferences(current);
  result.outputFormat = ALLOWED.outputFormat.includes(entry?.outputFormat) ? entry.outputFormat : 'narrative';
  if (!ALLOWED.provider.includes(entry?.provider)) return result;
  result.provider = entry.provider;
  const field = entry.provider === 'openai' ? 'openaiModel' : entry.provider === 'lmstudio' ? 'localModel' : 'geminiModel';
  // Historical metadata stays unchanged; retired models never become active.
  if (ALLOWED[field].includes(entry.model)) result[field] = entry.model;
  return result;
}
export function startVisiblePolling(refresh, doc = document, timers = window) {
  let interval = null;
  let pending = false;
  let disposed = false;
  async function tick() {
    if (disposed || doc.hidden || pending) return;
    pending = true;
    try { await refresh(); } catch { /* The caller reports status errors. */ }
    finally { pending = false; }
  }
  function update() {
    if (interval !== null) timers.clearInterval(interval);
    interval = null;
    if (!doc.hidden && !disposed) {
      void tick();
      interval = timers.setInterval(tick, 8000);
    }
  }
  doc.addEventListener('visibilitychange', update);
  update();
  return () => {
    disposed = true;
    if (interval !== null) timers.clearInterval(interval);
    doc.removeEventListener('visibilitychange', update);
  };
}
