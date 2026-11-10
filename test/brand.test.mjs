import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const asset = name => readFile(new URL(`../public/${name}`, import.meta.url));

test('Film U PNGs preserve alpha and ICO contains the matching favicon sizes', async () => {
  const ico = await asset('favicon.ico');
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const size of [16, 32, 48, 64, 128, 180, 512]) {
    const png = await asset(`icons/film-u-${size}.png`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6, 'RGBA output');
    if (size <= 48) {
      const entry = 6 + [16, 32, 48].indexOf(size) * 16;
      assert.equal(ico[entry], size);
      assert.equal(ico[entry + 1], size);
      assert.equal(ico.readUInt16LE(entry + 6), 32);
      const length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
      assert.deepEqual(ico.subarray(offset, offset + length), png);
    }
  }
});

test('header and favicon declarations reference packaged Film U assets', async () => {
  const window = new Window({ settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  try {
    window.document.write((await asset('index.html')).toString());
    const logo = window.document.querySelector('.brand img');
    assert.equal(logo.getAttribute('src'), '/icons/film-u-64.png');
    assert.equal(logo.getAttribute('alt'), ''); // Adjacent brand text supplies the accessible name.
    assert.equal(logo.width, logo.height);
    assert.match(logo.getAttribute('srcset'), /film-u-128\.png 2x/);
    const links = [...window.document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')];
    assert.equal(links.length, 4);
    for (const link of links) assert.ok((await asset(link.getAttribute('href').slice(1))).length);
  } finally { await window.happyDOM.close(); }
});
