'use strict';

// Run manually: node scripts/avatar.browser.cjs, with Playwright available.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
// This loads the actual page functions in an isolated browser, without the API
// or CDN. No production database or external image server is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    let imageRequests = 0;
    await page.route('https://avatar.test/**', route => {
      imageRequests += 1;
      if (route.request().url().includes('/good')) {
        return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
      }
      return route.abort();
    });
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/main\(\);\s*$/, '');
    const isolatedHtml = html.replace(/<script[\s\S]*?<\/script>/g, '');
    await page.setContent(isolatedHtml);
    await page.evaluate(() => { window.d3 = { interpolateRgbBasis: () => () => '' }; window.avatarInjected = false; });
    await page.addScriptTag({ content: script });
    async function show(avatar, name = '张三') {
      await page.evaluate(({ avatar, name }) => {
        showInfoPanel({ id: 1, name, avatar, generation: 0, subtreeSize: 0, discipleCount: 0 });
      }, { avatar, name });
    }
    for (const avatar of ['', 'javascript:window.avatarInjected=true', 'data:text/html,test', 'file:///tmp/avatar.png', '/relative.png', 'x" onerror="window.avatarInjected=true']) {
      await show(avatar, '<');
      assert.equal(await page.locator('#info-content > .avatar-large').evaluate(el => el.tagName), 'DIV');
      assert.equal(await page.locator('#info-content > .avatar-large').textContent(), '<');
    }
    assert.equal(imageRequests, 0, 'invalid legacy avatars must not request an image');

    await show('https://avatar.test/good.png', 'A" onload="window.avatarInjected=true');
    await page.waitForFunction(() => document.querySelector('#info-content > img')?.naturalWidth > 0);
    assert.equal(await page.locator('#info-content > img').getAttribute('alt'), 'A" onload="window.avatarInjected=true');
    assert.equal(await page.locator('#info-content > img').getAttribute('onload'), null);

    await show('https://avatar.test/good.png?x=" onerror="window.avatarInjected=true');
    await page.waitForFunction(() => document.querySelector('#info-content > img')?.naturalWidth > 0);
    assert.equal(await page.locator('#info-content > img').getAttribute('onerror'), null);
    assert.equal(await page.evaluate(() => window.avatarInjected), false);

    await show('https://avatar.test/broken.png', '😀测试');
    await page.waitForFunction(() => document.querySelector('#info-content > .avatar-large')?.tagName === 'DIV');
    assert.equal(await page.locator('#info-content > .avatar-large').textContent(), '😀');
    console.log('PASS: actual detail DOM rejects injection; valid, empty, invalid and failed avatars render safely.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
