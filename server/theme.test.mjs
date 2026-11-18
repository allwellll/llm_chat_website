import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../tailwind.config.js';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('shared Tailwind surfaces and opacity utilities resolve theme variables', async () => {
  const result = await postcss([tailwind({ ...config, content: [{ raw: 'bg-claude-bg bg-claude-sidebar bg-claude-card bg-claude-input border-claude-border text-claude-text-primary bg-claude-bg/95 bg-claude-card/80' }] })]).process('@tailwind utilities;', { from: undefined });
  for (const variable of ['bg-primary', 'bg-secondary', 'bg-card', 'bg-input', 'border-color', 'text-primary']) {
    assert.ok(result.css.includes(`var(--${variable})`), `generated utilities must use --${variable}`);
  }
  assert.match(result.css, /var\(--bg-primary\)\s*\/\s*0\.95/);
  assert.match(result.css, /var\(--bg-card\)\s*\/\s*0\.8/);
});

test('main chat, sidebar and every settings tab do not bypass theme with dark neutral literals', () => {
  const files = ['src/App.tsx', ...['Sidebar', 'LandingView', 'ChatInput', 'ChatMessage', 'ActiveChatHeader', 'CustomizeModal', 'SearchModal', 'AddContentDropdown', 'ModelSelectorDropdown', 'ArtifactViewer'].map(x => `src/components/${x}.tsx`), ...['General', 'Account', 'Billing', 'Capabilities', 'Code', 'Memory', 'Privacy', 'TimeFocus'].map(x => `src/components/settings/Settings${x}.tsx`)];
  assert.match(read('src/components/Sidebar.tsx'), /w-\[270px\] bg-claude-sidebar/);
  for (const file of files) {
    const literals = [...read(file).matchAll(/(?:bg|text|border|placeholder|from|via)-\[#([\da-f]{6})\]/gi)].filter(([, hex]) => {
      const rgb = hex.match(/../g).map(x => parseInt(x, 16));
      return Math.max(...rgb) - Math.min(...rgb) < 32;
    });
    assert.equal(literals.length, 0, `${file} still hardcodes neutral colors: ${literals.map(x => x[0]).join(', ')}`);
  }
});

function mountTheme(theme, systemDark = false) {
  const classes = new Set(['dark']);
  const listeners = new Set();
  const effects = [];
  const media = { matches: systemDark, addEventListener: (type, fn) => listeners.add(fn), removeEventListener: (type, fn) => listeners.delete(fn) };
  const react = { createContext: () => ({ Provider: 'provider' }), createElement: () => null, useContext: () => null, useState: init => [typeof init === 'function' ? init() : init, () => {}], useEffect: fn => effects.push(fn) };
  const module = { exports: {} };
  const source = ts.transpileModule(read('src/context/SettingsContext.tsx'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name === 'react' ? react : { loadSettings: () => ({ theme }), saveSettings: () => {}, DEFAULT_SETTINGS: { theme: 'dark' } }, document: { documentElement: { classList: { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, enabled) => enabled ? classes.add(x) : classes.delete(x) }, style: {} } }, window: { matchMedia: () => media } });
  module.exports.SettingsProvider({ children: null });
  const cleanup = effects.map(fn => fn()).filter(x => typeof x === 'function');
  return { classes, listeners, change(dark) { media.matches = dark; for (const fn of listeners) fn({ matches: dark }); }, unmount() { cleanup.forEach(fn => fn()); } };
}

test('system appearance follows initial and dynamic OS preference, cleaning up its listener', () => {
  const mounted = mountTheme('system', false);
  assert.ok(mounted.classes.has('light'), 'system light preference must not resolve to dark');
  mounted.change(true);
  assert.deepEqual([...mounted.classes], ['dark']);
  mounted.change(false);
  assert.deepEqual([...mounted.classes], ['light']);
  assert.equal(mounted.listeners.size, 1);
  mounted.unmount();
  assert.equal(mounted.listeners.size, 0);
});

test('explicit appearance ignores OS changes and dark remains the stored default', () => {
  for (const theme of ['light', 'dark']) {
    const mounted = mountTheme(theme, theme !== 'dark');
    mounted.change(theme === 'dark');
    assert.deepEqual([...mounted.classes], [theme]);
    assert.equal(mounted.listeners.size, 0);
  }
  assert.match(read('src/services/storage.ts'), /theme:\s*'dark'/);
});

test('markdown code and quote surfaces use the same theme tokens', () => {
  const css = read('src/index.css');
  for (const selector of ['.claude-prose', '.claude-prose pre', '.claude-prose blockquote']) {
    const body = css.slice(css.indexOf(selector + ' {')).split('}')[0];
    assert.match(body, /var\(--/);
  }
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /color-scheme:\s*light/);
});
