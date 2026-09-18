/* Observe CMS commit requests without changing/retrying them or storing credentials.
 * Only numeric request metadata and allowlisted error categories reach the UI.
 */
(function () {
  'use strict';
  const originalFetch = window.fetch.bind(window);
  let notice;
  function show(text) {
    if (!notice) {
      notice = document.createElement('aside');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483647;background:#fff;color:#222;border:1px solid #777;border-radius:8px;padding:12px;font:14px/1.5 system-ui;box-shadow:0 2px 12px #0003';
      const label = document.createElement('p');
      label.style.margin = '0 0 8px';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = 'Dismiss';
      close.onclick = () => { notice.remove(); notice = undefined; };
      notice.append(label, close);
      document.body.appendChild(notice);
    }
    notice.firstChild.textContent = text;
  }
  window.fetch = async function (input, init) {
    // Deliberately ignore Request objects and all non-commit calls. The pinned
    // CMS calls fetch with a URL and a serialized JSON body for these writes.
    if (String(input) !== 'https://api.github.com/graphql' || init?.method !== 'POST' ||
        typeof init.body !== 'string' || !init.body.includes('createCommitOnBranch')) {
      return originalFetch(input, init);
    }
    const size = (new Blob([init.body]).size / 1048576).toFixed(2);
    const start = performance.now();
    const details = () => `${size} MB request; ${Math.round((performance.now() - start) / 1000)} seconds`;
    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      show(`Upload connection failed (${details()}). No HTTP response was received. Keep this tab open; a failed response does not prove the save failed. Check the repository before retrying. Share this notice for diagnosis.`);
      throw error;
    }
    // Consume only a clone, leaving the exact original response for the CMS.
    try {
      let data;
      try { data = await response.clone().json(); } catch (_) { /* Non-JSON server error. */ }
      if (!response.ok || data?.errors?.length) {
        const known = ['FORBIDDEN', 'UNAUTHORIZED', 'RATE_LIMITED', 'UNPROCESSABLE', 'NOT_FOUND', 'INTERNAL', 'SERVICE_UNAVAILABLE'];
        const categories = [...new Set((Array.isArray(data?.errors) ? data.errors : [])
          .map(error => error?.type).filter(type => known.includes(type)))];
        const category = categories.length ? `; ${categories.join(', ')}` : data?.errors?.length ? '; GraphQL error' : '';
        const hint = response.status === 413 ? 'The request was rejected as too large.'
          : response.status === 401 || response.status === 403 ? 'GitHub rejected access or applied a rate limit.'
          : response.status >= 500 ? 'The server could not complete the request.'
          : 'Keep this tab open and share this notice for diagnosis.';
        show(`Upload failed: HTTP ${response.status}${category} (${details()}). ${hint}`);
      } else if (notice) {
        notice.remove();
        notice = undefined;
      }
    } catch (_) { /* Diagnostics must never change the save result. */ }
    return response;
  };
})();
