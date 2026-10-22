const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadCart(storage) {
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/cart.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const context = { exports: {}, require, Event, window: { localStorage: storage, dispatchEvent() {} } };
  vm.runInNewContext(source, context);
  return context.exports;
}

test('cart keeps additions, limits and removals when browser storage is blocked', () => {
  const cart = loadCart({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(cart.addToCart('SF001', '2026-11-05', 2), true);
  assert.equal(cart.addToCart('SF002', undefined, 2), true);
  assert.equal(cart.addToCart('SF003', undefined, 2), false);
  assert.equal(cart.readCart().itemIds.join(','), 'SF001,SF002');
  assert.equal(cart.readCart().pickupDate, '2026-11-05');
  cart.removeFromCart('SF001');
  assert.equal(cart.readCart().itemIds.join(','), 'SF002');
});

test('cart retains a new selection when reads work but storage writes fail', () => {
  const cart = loadCart({ getItem() { return null; }, setItem() { throw new Error('quota'); } });
  cart.addToCart('SF001');
  assert.equal(cart.readCart().itemIds.join(','), 'SF001');
  cart.readCart().itemIds.push('SF002');
  assert.equal(cart.readCart().itemIds.join(','), 'SF001');
});

test('stored duplicate dress IDs do not inflate the selection', () => {
  const cart = loadCart({ getItem() { return JSON.stringify({ itemIds: ['SF001', 'SF001'], days: 3 }); } });
  assert.equal(cart.readCart().itemIds.join(','), 'SF001');
});
