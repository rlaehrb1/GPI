// An open connection represents a tab, including background/minimized tabs.
// A grace period lets navigation, refresh and EventSource reconnects settle.
export function createBrowserLifecycle(onLastTabClosed, {
  graceMs = 10000, timers = globalThis
} = {}) {
  const clients = new Set();
  let pending = null;
  let disposed = false;
  function attach(response) {
    if (disposed) { response.end(); return; }
    if (pending !== null) timers.clearTimeout(pending);
    pending = null;
    clients.add(response);
    response.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    response.write('retry: 1000\ndata: connected\n\n');
    const ping = timers.setInterval(() => response.write(': keepalive\n\n'), 15000);
    response.once('close', () => {
      timers.clearInterval(ping);
      clients.delete(response);
      if (!disposed && clients.size === 0) {
        pending = timers.setTimeout(() => {
          pending = null;
          if (!disposed && clients.size === 0) onLastTabClosed();
        }, graceMs);
      }
    });
  }
  function dispose() {
    disposed = true;
    if (pending !== null) timers.clearTimeout(pending);
    for (const response of clients) response.end();
    clients.clear();
  }
  return { attach, dispose };
}
