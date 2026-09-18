/* Adapter for the pinned Sveltia CMS GitHub commit request.
 * Upload each unchanged base64 file separately, then publish one atomic commit.
 * Uses only the CMS-provided credentials, at the same GitHub API origin.
 */
(function () {
  'use strict';
  const send = window.fetch.bind(window);
  const api = 'https://api.github.com/repos/Doul00/PersonalWebsite/git/';
  let active = false;
  let notice;
  function progress(message) {
    if (!notice) {
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px;background:#18334a;color:white;font:14px/1.5 system-ui;text-align:center';
      document.body.appendChild(notice);
    }
    notice.textContent = message;
  }
  const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const fail = message => json({ errors: [{ type: 'UPLOAD_FAILED', message }] });
  const safePath = path => typeof path === 'string' && /^(assets\/photos\/|_photo_sections\/)/.test(path) &&
    !path.split('/').some(part => !part || part === '.' || part === '..') && !/[\\\x00-\x1f]/.test(path);
  window.fetch = async function (url, init) {
    if (String(url) !== 'https://api.github.com/graphql' || init?.method !== 'POST' || typeof init.body !== 'string') return send(url, init);
    let request;
    try { request = JSON.parse(init.body); } catch (_) { return send(url, init); }
    const input = request.variables?.input;
    if (!request.query?.includes('createCommitOnBranch') || input?.branch?.repositoryNameWithOwner !== 'Doul00/PersonalWebsite' ||
        input.branch.branchName !== 'master') return send(url, init);
    const additions = input.fileChanges?.additions ?? [];
    const deletions = input.fileChanges?.deletions ?? [];
    // Only handle this site's photo content. Leave other CMS operations alone.
    if (!Array.isArray(additions) || !Array.isArray(deletions) || ![...additions, ...deletions].every(file => safePath(file.path))) return send(url, init);
    if (!/^[0-9a-f]{40}$/i.test(input.expectedHeadOid) || !additions.every(file => typeof file.contents === 'string')) return fail('Invalid photo save request. Reload the editor after preserving your draft.');
    if (active) return fail('Another upload is already running. Wait for it to finish.');
    active = true;
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('Content-Type', 'application/json');
    let stage = 'Checking the current version';
    async function rest(path, method = 'GET', body) {
      let response;
      try {
        response = await send(api + path, { method, headers, cache: 'no-store', redirect: 'error', signal: init.signal,
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      } catch (_) {
        throw new Error(stage + ': connection failed. Keep the editor open. Check whether the save reached GitHub before retrying.');
      }
      if (!response.ok) throw new Error(stage + ': GitHub returned HTTP ' + response.status + '. No automatic retry was attempted.');
      return response.json();
    }
    try {
      progress(stage);
      const head = await rest('ref/heads/master');
      if (head.object.sha !== input.expectedHeadOid) throw new Error('The repository changed since this save started. Keep your draft and try saving again.');
      const parent = await rest('commits/' + input.expectedHeadOid);
      if (!parent.tree?.sha) throw new Error('Could not read the existing repository tree. Nothing was published.');
      const entries = new Map(deletions.map(file => [file.path, { path: file.path, mode: '100644', type: 'blob', sha: null }]));
      const aliases = {};
      for (let i = 0; i < additions.length; i++) {
        stage = 'Uploading file ' + (i + 1) + ' of ' + additions.length;
        progress(stage + ' — keep this tab open');
        const file = additions[i];
        const blob = await rest('blobs', 'POST', { content: file.contents, encoding: 'base64' });
        if (!blob.sha) throw new Error(stage + ': GitHub did not return a file ID. Nothing was published.');
        entries.set(file.path, { path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
        aliases['file_' + i] = { oid: blob.sha };
      }
      stage = 'Preparing the gallery commit';
      progress(stage);
      const tree = await rest('trees', 'POST', { base_tree: parent.tree.sha, tree: [...entries.values()] });
      const commit = await rest('commits', 'POST', { tree: tree.sha, parents: [input.expectedHeadOid],
        message: [input.message.headline, input.message.body].filter(Boolean).join('\n\n') });
      stage = 'Publishing the gallery';
      progress(stage);
      // The parent is fixed. A concurrent update makes this non-fast-forward,
      // so GitHub rejects it instead of overwriting anyone else's changes.
      await rest('refs/heads/master', 'PATCH', { sha: commit.sha, force: false });
      return json({ data: { createCommitOnBranch: { commit: {
        oid: commit.sha, committedDate: commit.committer.date, ...aliases
      } } } });
    } catch (error) {
      // GraphQL-shaped error keeps the CMS draft open and avoids its HTTP 502
      // retry of a potentially already-published write. Never fall back/repost.
      return fail(error.message);
    } finally {
      active = false;
      notice?.remove();
      notice = undefined;
    }
  };
})();
