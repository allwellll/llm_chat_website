import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const input=readFileSync(new URL('../src/components/ChatInput.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/index.css',import.meta.url),'utf8');
test('mobile composer keeps a compact single row and a labeled search switch',()=>{
 assert.ok(input.includes('composer-toolbar'));
 assert.ok(input.includes('composer-search-label'));
 assert.ok(input.includes('aria-label="网页检索"'));
 assert.match(css,/\.composer-toolbar\s*\{[^}]*flex-wrap:\s*nowrap/s);
 assert.match(css,/\.composer-search-label\s*\{[^}]*display:\s*none/s);
});
