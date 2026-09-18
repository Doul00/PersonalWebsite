const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../login/upload-diagnostics.js'), 'utf8');
function setup(fetch) {
  const nodes = [];
  const document = { createElement() { return {
    style: {}, setAttribute() {}, append(...children) { this.firstChild = children[0]; },
    remove() { nodes.splice(nodes.indexOf(this), 1); }
  }; }, body: { appendChild(node) { nodes.push(node); } } };
  const window = { fetch };
  vm.runInNewContext(source, { window, document, Blob, performance });
  return { window, nodes };
}
const options = { method: 'POST', headers: { Authorization: 'SECRET' }, body: JSON.stringify({ query: 'mutation { createCommitOnBranch }', photo: 'PRIVATE_PHOTO' }) };
test('failed response is preserved and sensitive response content is not displayed', async () => {
  const response = new Response(JSON.stringify({ errors: [{ type: 'FORBIDDEN', message: 'SECRET PRIVATE_PHOTO' }] }), { status: 200 });
  let calls = 0;
  const { window, nodes } = setup(async (url, init) => { calls++; assert.equal(init, options); return response; });
  assert.equal(await window.fetch('https://api.github.com/graphql', options), response);
  assert.equal(calls, 1);
  assert.match(nodes[0].firstChild.textContent, /HTTP 200; FORBIDDEN/);
  assert.doesNotMatch(nodes[0].firstChild.textContent, /SECRET|PRIVATE_PHOTO/);
  assert.equal((await response.json()).errors[0].type, 'FORBIDDEN');
});
test('large successful commits are not modified and other requests pass through', async () => {
  const { window, nodes } = setup(async () => new Response('{"data":{}}'));
  const large = { ...options, body: options.body + ' '.repeat(4 * 1024 * 1024) };
  assert.equal((await window.fetch('https://api.github.com/graphql', large)).status, 200);
  await window.fetch('https://api.github.com/repos/example/repo', options);
  assert.equal(nodes.length, 0);
});
test('network failures are surfaced without retrying the write', async () => {
  const error = new Error('SECRET');
  let calls = 0;
  const { window, nodes } = setup(async () => { calls++; throw error; });
  await assert.rejects(window.fetch('https://api.github.com/graphql', options), e => e === error);
  assert.equal(calls, 1);
  assert.match(nodes[0].firstChild.textContent, /No HTTP response/);
  assert.doesNotMatch(nodes[0].firstChild.textContent, /SECRET/);
});
