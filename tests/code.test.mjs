// @verifies CONTRACT.md section 2 (show code format) against the shared vectors
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALPHABET, checkChar, normaliseCode, displayCode, generateCode, isValidCode } from '../functions/_lib/code.js';

const vectors = JSON.parse(await readFile(new URL('./fixtures/code-vectors.json', import.meta.url), 'utf8'));

test('alphabet matches the contract', () => {
  assert.equal(ALPHABET, vectors.alphabet);
  assert.equal(ALPHABET.length, 31);
});

for (const v of vectors.valid) {
  test(`valid ${v.code}`, () => {
    assert.equal(normaliseCode(v.code), v.code);
    assert.equal(displayCode(v.code), v.display);
    assert.equal(normaliseCode(v.display), v.code);
    assert.equal(checkChar(v.code.slice(0, 7)), v.code[7]);
  });
}

for (const v of vectors.normalise) {
  test(`normalise ${JSON.stringify(v.input)}`, () => {
    assert.equal(normaliseCode(v.input), v.code);
  });
}

for (const v of vectors.invalid) {
  test(`invalid ${JSON.stringify(v.input)} (${v.reason})`, () => {
    assert.equal(normaliseCode(v.input), null);
    assert.equal(isValidCode(v.input), false);
  });
}

test('URL form takes the last path component and ignores query and hash', () => {
  assert.equal(normaliseCode('https://break-a-leg.app/show/7q4m-xn98/?utm=1#x'), '7Q4MXN98');
  assert.equal(normaliseCode('https://break-a-leg.app/show/'), null);
});

test('non-string and odd unicode input is rejected, not coerced', () => {
  assert.equal(normaliseCode(undefined), null);
  assert.equal(normaliseCode(null), null);
  assert.equal(normaliseCode(12345678), null);
  assert.equal(normaliseCode('7Q4MXN9ß8'), '7Q4MXN98'); // non-ASCII is dropped, not upper-cased into letters
});

test('generated codes are valid, well spread and different', () => {
  const seen = new Set();
  const letters = new Set();
  for (let i = 0; i < 500; i++) {
    const c = generateCode();
    assert.equal(c.length, 8);
    assert.equal(normaliseCode(c), c);
    seen.add(c);
    for (const ch of c.slice(0, 7)) letters.add(ch);
  }
  assert.ok(seen.size > 495);
  assert.equal(letters.size, 31, 'every alphabet letter shows up in 3500 draws');
});

test('generateCode uses the randomness source it is given and rejects biased bytes', () => {
  let calls = 0;
  const fake = (buf) => { calls++; buf.fill(255); if (calls > 1) buf.fill(0); return buf; }; // 255 is rejected, 0 is '2'
  const c = generateCode(fake);
  assert.equal(c.slice(0, 7), '2222222');
  assert.equal(c, '22222222');
  assert.equal(calls, 2);
});
