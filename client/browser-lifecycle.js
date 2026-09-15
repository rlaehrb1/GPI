export function trackBrowserLifetime(EventSourceClass = EventSource, target = window) {
  let connection;
  const open = () => {
    if (!connection) connection = new EventSourceClass('/api/browser-session');
  };
  const close = () => { connection?.close(); connection = null; };
  open();
  target.addEventListener('pagehide', close);
  target.addEventListener('pageshow', open);
  return () => {
    target.removeEventListener('pagehide', close);
    target.removeEventListener('pageshow', open);
    close();
  };
}
