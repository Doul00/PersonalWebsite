// Run with: node --test tests/photo-gallery.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let definition;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../login/photo-gallery.js'), 'utf8'), {
  window: { h() {}, createClass: spec => spec, CMS: { registerFieldType: (_, spec) => { definition = spec; } } }
});
function widget(initial = []) {
  const instance = { ...definition, state: definition.getInitialState() };
  const callbacks = [];
  instance.setState = (state, callback) => callbacks.push(() => {
    Object.assign(instance.state, state);
    callback?.();
  });
  instance.flush = () => { while (callbacks.length) callbacks.shift()(); };
  instance.props = {
    value: initial,
    addFile: async file => 'blob:' + file.name,
    onChange: photos => {
      // Sveltia caches validation before delivering fresh React props.
      instance.cachedValidation = instance.isValid();
      instance.props = { ...instance.props, value: photos };
    }
  };
  return instance;
}
test('upload completion clears busy before caching validation, without another edit', async () => {
  const c = widget();
  const upload = c.upload({ target: { value: '', files: [
    { name: 'a.jpg', type: 'image/jpeg', size: 100 },
    { name: 'b.jpg', type: 'image/jpeg', size: 100 }
  ] } });
  c.flush();
  assert.notEqual(c.isValid(), true);
  await upload;
  c.flush();
  assert.equal(c.cachedValidation, true);
  assert.equal(c.props.value.length, 2);
  c.remove(1);
  c.remove(0);
  assert.notEqual(c.cachedValidation, true);
});
test('picker completion, cancellation and errors reset busy and revalidate', async () => {
  for (const result of ['picked', 'cancelled', 'failed']) {
    const c = widget([{ image: '/existing.jpg', caption: '' }]);
    c.props.pickFile = async () => {
      if (result === 'failed') throw new Error('Picker failed');
      return result === 'picked' ? [{ value: '/new.jpg' }] : null;
    };
    const picking = c.choose();
    c.flush();
    await picking;
    c.flush();
    assert.equal(c.state.busy, false);
    assert.equal(c.cachedValidation, true);
    assert.equal(c.props.value.length, result === 'picked' ? 2 : 1);
  }
});
test('failed upload preserves existing photos and clears cached busy error', async () => {
  const c = widget([{ image: '/existing.jpg', caption: '' }]);
  const uploading = c.upload({ target: { value: '', files: [{ name: 'bad.txt', type: 'text/plain', size: 1 }] } });
  await uploading;
  c.flush();
  assert.equal(c.cachedValidation, true);
  assert.equal(c.props.value.length, 1);
  assert.match(c.state.error, /bad.txt/);
});
