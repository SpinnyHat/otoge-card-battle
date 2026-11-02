// Copyright guard: card art must be on the allow-list, and no official jacket/logo files may be lying around.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { CARDS } from '../js/cards.js';

const allowed = JSON.parse(fs.readFileSync(new URL('../assets/art/allowed.json', import.meta.url)));
delete allowed._note;
const files = fs.readdirSync(new URL('../assets/art/', import.meta.url)).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f));
for (const f of files) assert.ok(allowed[f], `assets/art/${f} is not in allowed.json — add it only if you have permission to use it`);
for (const c of Object.values(CARDS)) if (c.art) {
  const f = c.art.split('/').pop();
  assert.ok(files.includes(f), `${c.name}: art file ${f} missing`);
  assert.ok(allowed[f], `${c.name}: art ${f} not allow-listed`);
}
const banned = /(logo|jacket|jkt|banner|screenshot)/i;
for (const f of files) assert.ok(!banned.test(f), `suspicious file name ${f}`);
console.log('assets ok:', files.length, 'images, all allow-listed');
