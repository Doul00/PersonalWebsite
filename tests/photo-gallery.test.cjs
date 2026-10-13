// Run with: node --test tests/photo-gallery.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let definition;
let confirmed = false;
let drawImageArgs;
const canvas = {
  getContext: () => ({ drawImage(...args) { drawImageArgs = args; } }),
  toBlob: callback => callback({ type: 'image/webp', size: 123 })
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../login/photo-gallery.js'), 'utf8'), {
  window: { confirm: () => confirmed, h() {}, createClass: spec => spec, CMS: { registerFieldType: (_, spec) => { definition = spec; } } },
  document: { createElement: () => canvas },
  createImageBitmap: async () => ({ width: 2400, height: 1600, close() {} }),
  fetch: async () => ({ ok: true, blob: async () => ({ type: 'image/jpeg', name: 'existing.jpg' }) })
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
    getAsset: value => ({ url: value }),
    addFile: async (file, options) => 'blob:' + (options?.name || file.name),
    onChange: photos => {
      // Sveltia caches validation before delivering fresh React props.
      instance.cachedValidation = instance.isValid();
      instance.props = { ...instance.props, value: photos };
    }
  };
  return instance;
}
test('upload completion creates derived covers and clears busy before validation', async () => {
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
  assert.equal(c.props.value[0].thumbnail, 'blob:a-cover.webp');
  assert.equal(drawImageArgs.length, 5, 'thumbnail resizes the whole image instead of cropping it');
  c.remove(1);
  c.remove(0);
  assert.equal(c.cachedValidation, true);
  assert.equal(c.props.value.length, 0);
});
test('picker creates thumbnails, while cancellation and errors reset busy', async () => {
  for (const result of ['picked', 'cancelled', 'failed']) {
    const c = widget([{ image: '/existing.jpg', caption: '' }]);
    c.props.pickFile = async () => {
      if (result === 'failed') throw new Error('Picker failed');
      return result === 'picked' ? [{ value: '/new.jpg', file: { name: 'new.jpg', type: 'image/jpeg' } }] : null;
    };
    const picking = c.choose();
    c.flush();
    await picking;
    c.flush();
    assert.equal(c.state.busy, false);
    assert.equal(c.cachedValidation, true);
    assert.equal(c.props.value.length, result === 'picked' ? 2 : 1);
    if (result === 'picked') assert.equal(c.props.value[1].thumbnail, 'blob:new-cover.webp');
  }
});
test('existing gallery can generate an optimized cover without replacing original', async () => {
  const c = widget([{ image: 'https://photos.example/existing.jpg', caption: 'Keep' }]);
  const optimizing = c.optimizeCover();
  c.flush();
  await optimizing;
  c.flush();
  assert.equal(c.props.value[0].image, 'https://photos.example/existing.jpg');
  assert.equal(c.props.value[0].thumbnail, 'blob:existing-cover.webp');
  assert.equal(c.props.value[0].caption, 'Keep');
  assert.equal(c.cachedValidation, true);
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
test('remove all requires confirmation, retains captions on cancellation and permits saving empty section', () => {
  const c = widget([{ image: '/old.jpg', thumbnail: '/old-cover.webp', caption: 'Keep on cancellation' }]);
  confirmed = false;
  c.removeAll();
  assert.equal(c.props.value[0].caption, 'Keep on cancellation');
  confirmed = true;
  c.removeAll();
  c.flush();
  assert.equal(c.props.value.length, 0);
  assert.equal(c.isValid(), true);
});
