import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBrowserLifecycle } from '../server/browser-lifecycle.js';
import { trackBrowserLifetime } from '../client/browser-lifecycle.js';

function setup() {
  let next = 1, exited = 0;
  const timeouts = new Map(), intervals = new Map();
  const timers = {
    setTimeout(fn, ms) { assert.equal(ms, 10000); timeouts.set(next, fn); return next++; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn) { intervals.set(next, fn); return next++; },
    clearInterval(id) { intervals.delete(id); }
  };
  const tracker = createBrowserLifecycle(() => exited++, { timers });
  const connect = () => {
    const response = new EventEmitter();
    response.writeHead = () => {}; response.write = () => {};
    response.end = () => response.emit('close');
    tracker.attach(response); return response;
  };
  const expire = () => { for (const fn of timeouts.values()) fn(); timeouts.clear(); };
  return { tracker, connect, expire, timeouts, intervals, exited: () => exited };
}

test('no browser yet or a background tab never triggers shutdown', () => {
  const s = setup();
  s.expire(); assert.equal(s.exited(), 0);
  s.connect(); s.expire(); assert.equal(s.exited(), 0);
  assert.equal(s.intervals.size, 1); s.tracker.dispose();
  assert.equal(s.intervals.size, 0);
});
test('last tab only: refresh/reconnect cancels pending shutdown', () => {
  const s = setup(), a = s.connect(), b = s.connect();
  a.end(); s.expire(); assert.equal(s.exited(), 0);
  b.end(); assert.equal(s.timeouts.size, 1);
  const refreshed = s.connect(); assert.equal(s.timeouts.size, 0);
  s.expire(); assert.equal(s.exited(), 0);
  refreshed.end(); s.expire(); assert.equal(s.exited(), 1);
});
test('disposal closes connections without scheduling another shutdown', () => {
  const s = setup(); s.connect(); s.connect(); s.tracker.dispose();
  assert.equal(s.timeouts.size, 0); assert.equal(s.intervals.size, 0);
});
test('pagehide closes socket and back/forward cache restore reconnects it', () => {
  const events = new Map(); let opened = 0, closed = 0;
  class Source { constructor(url) { assert.equal(url, '/api/browser-session'); opened++; } close() { closed++; } }
  const stop = trackBrowserLifetime(Source, { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) });
  events.get('pageshow')(); assert.equal(opened, 1);
  events.get('pagehide')(); assert.equal(closed, 1);
  events.get('pageshow')(); assert.equal(opened, 2);
  stop(); assert.equal(closed, 2); assert.equal(events.size, 0);
});
