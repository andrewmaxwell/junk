import { validEndpoint, trustedReplyOrigin } from './model.js';

// Apps Script's HTML service supplies a confirmed reply through postMessage.
// A regular form POST works across origins without relying on opaque no-cors fetches.
export function request(endpoint, action, payload = {}) {
  if (!validEndpoint(endpoint)) return Promise.reject(new Error('Add your Google Apps Script web app URL in Settings.'));
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const iframe = document.createElement('iframe');
    iframe.name = `coffee-${requestId}`;
    iframe.title = 'Google Sheets connection';
    iframe.className = 'bridge-frame';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = endpoint;
    form.target = iframe.name;
    form.hidden = true;
    const fields = { requestId, parentOrigin: location.origin, action, payload: JSON.stringify(payload) };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      form.append(input);
    }
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      iframe.remove(); form.remove();
    };
    const receive = event => {
      const data = event.data;
      if (!trustedReplyOrigin(event.origin) || !data || data.channel !== 'coffee-log-v1' || data.requestId !== requestId) return;
      // The sender lives inside Google's nested iframe, so event.source is not
      // the outer frame. A unique per-request nonce binds this reply instead.
      cleanup();
      if (data.ok) resolve(data.result);
      else {
        const error = new Error(data.error || 'Google Sheets could not save the drink.');
        error.definitive = data.definitive === true;
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Google Sheets did not confirm the request. Check your connection and the web app deployment.'));
    }, 30000);
    window.addEventListener('message', receive);
    document.body.append(iframe, form);
    try { form.submit(); } catch (error) { cleanup(); reject(error); }
  });
}
