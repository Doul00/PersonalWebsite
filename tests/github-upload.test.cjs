const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../login/github-upload.js'), 'utf8');
const parent = 'a'.repeat(40), treeSha = 'b'.repeat(40), commitSha = 'c'.repeat(40);
function body(additions, deletions = []) {
  return JSON.stringify({ query: 'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid committedDate file_0: file(path: "assets/photos/0.jpg") { oid } } } }', variables: { input: {
    branch: { repositoryNameWithOwner: 'Doul00/PersonalWebsite', branchName: 'master' },
    expectedHeadOid: parent, fileChanges: { additions, deletions }, message: { headline: 'Save photos' }
  } } });
}
function setup({ failure, conflict = false, conflictOnPublish = false, losePublishResponse = false } = {}) {
  const calls = [], uploaded = [], progress = [];
  let tree, commit, published = false, inFlight = 0, maxConcurrent = 0;
  const window = { fetch: async (url, init) => {
    calls.push({ url, init, size: init.body?.length ?? 0 });
    assert.equal(new Headers(init.headers).get('Authorization'), 'token test-only');
    inFlight++; maxConcurrent = Math.max(maxConcurrent, inFlight);
    await new Promise(resolve => setTimeout(resolve, 1));
    inFlight--;
    const payload = init.body ? JSON.parse(init.body) : undefined;
    const endpoint = url.split('/git/')[1];
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
    if (!endpoint) return json({ untouched: true });
    if (endpoint === 'ref/heads/master') return json({ object: { sha: conflict ? 'd'.repeat(40) : parent } });
    if (endpoint === 'commits/' + parent) return json({ tree: { sha: treeSha } });
    if (endpoint === 'blobs') {
      if (uploaded.length === failure) return json({ message: 'fail' }, 413);
      assert.equal(payload.encoding, 'base64');
      uploaded.push(payload.content);
      return json({ sha: crypto.createHash('sha1').update(payload.content).digest('hex') }, 201);
    }
    if (endpoint === 'trees') { tree = payload; return json({ sha: 'e'.repeat(40) }, 201); }
    if (endpoint === 'commits') { commit = payload; return json({ sha: commitSha, committer: { date: '2026-09-18T00:00:00Z' } }, 201); }
    if (endpoint === 'refs/heads/master') {
      assert.equal(payload.force, false);
      if (conflictOnPublish) return json({ message: 'Not a fast forward' }, 422);
      published = true;
      if (losePublishResponse) throw new TypeError('Network failed');
      return json({ object: { sha: commitSha } });
    }
    throw new Error('Unexpected endpoint: ' + endpoint);
  } };
  const document = { createElement: () => ({ style: {}, setAttribute() {}, remove() {},
    set textContent(value) { progress.push(value); } }), body: { appendChild() {} } };
  vm.runInNewContext(source, { window, document, Response, Headers });
  return { window, calls, uploaded, progress, inspect: () => ({ tree, commit, published, maxConcurrent }) };
}
async function save(env, payload) {
  const response = await env.window.fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { Authorization: 'token test-only' }, body: payload
  });
  return response.json();
}
test('56 MB batch becomes sequential 4 MB requests and one atomic publication', async () => {
  const env = setup();
  const additions = Array.from({ length: 14 }, (_, i) => ({ path: `assets/photos/${i}.jpg`, contents: Buffer.alloc(3 * 1024 * 1024, i).toString('base64') }));
  additions.push({ path: '_photo_sections/example.md', contents: Buffer.from('---\ntitle: Example\n---').toString('base64') });
  const payload = body(additions);
  assert(payload.length > 56 * 1024 * 1024);
  const result = await save(env, payload);
  assert.equal(result.data.createCommitOnBranch.commit.oid, commitSha);
  assert.equal(env.uploaded.length, additions.length);
  additions.forEach((file, i) => assert.equal(env.uploaded[i], file.contents));
  assert(Math.max(...env.calls.map(call => call.size)) < 4 * 1024 * 1024 + 100);
  assert(env.calls.every(call => !call.url.endsWith('/graphql')));
  const state = env.inspect();
  assert.equal(state.maxConcurrent, 1);
  assert.equal(state.tree.base_tree, treeSha);
  assert.equal(state.commit.parents[0], parent);
  assert.equal(env.calls.filter(call => call.init.method === 'PATCH').length, 1);
  assert.equal(Object.keys(result.data.createCommitOnBranch.commit).filter(key => key.startsWith('file_')).length, additions.length);
});
test('standalone 3 MB asset uses the same smaller-file transport', async () => {
  const env = setup();
  const result = await save(env, body([{ path: 'assets/photos/single.jpg', contents: Buffer.alloc(3 * 1024 * 1024).toString('base64') }]));
  assert.equal(result.data.createCommitOnBranch.commit.oid, commitSha);
  assert.equal(env.uploaded.length, 1);
});
test('failed file does not publish, retry, or fall back to the oversized request', async () => {
  const env = setup({ failure: 1 });
  const result = await save(env, body([0, 1, 2].map(i => ({ path: `assets/photos/${i}.jpg`, contents: 'YQ==' }))));
  assert.match(result.errors[0].message, /file 2 of 3.*HTTP 413/);
  assert.equal(env.calls.filter(call => call.url.endsWith('/blobs')).length, 2);
  assert.equal(env.inspect().published, false);
  assert.equal(env.inspect().tree, undefined);
});
test('stale head stops before uploading or overwriting changes', async () => {
  const env = setup({ conflict: true });
  const result = await save(env, body([{ path: 'assets/photos/1.jpg', contents: 'YQ==' }]));
  assert.match(result.errors[0].message, /repository changed/);
  assert.equal(env.calls.length, 1);
});
test('lost publish response is reported without duplicate publication', async () => {
  const env = setup({ losePublishResponse: true });
  const result = await save(env, body([{ path: 'assets/photos/1.jpg', contents: 'YQ==' }]));
  assert.match(result.errors[0].message, /Check whether the save reached GitHub/);
  assert.equal(env.calls.filter(call => call.init.method === 'PATCH').length, 1);
});
test('concurrent update during upload is rejected without force or rebase', async () => {
  const env = setup({ conflictOnPublish: true });
  const result = await save(env, body([{ path: 'assets/photos/1.jpg', contents: 'YQ==' }]));
  assert.match(result.errors[0].message, /Publishing the gallery.*HTTP 422/);
  assert.equal(env.inspect().published, false);
  assert.equal(env.calls.filter(call => call.init.method === 'PATCH').length, 1);
});
test('deletions and replacements share the original base tree', async () => {
  const env = setup();
  await save(env, body([{ path: 'assets/photos/new.jpg', contents: 'YQ==' }], [{ path: 'assets/photos/old.jpg' }]));
  assert.equal(env.inspect().tree.tree.find(file => file.path === 'assets/photos/old.jpg').sha, null);
  assert.equal(env.inspect().tree.base_tree, treeSha);
});
test('unrelated API calls and repository mutations are left untouched', async () => {
  const env = setup();
  const payload = body([{ path: 'assets/photos/1.jpg', contents: 'YQ==' }]).replace('Doul00/PersonalWebsite', 'other/repo');
  assert.equal((await save(env, payload)).untouched, true);
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].url, 'https://api.github.com/graphql');
});
