'use strict';

// Manual browser regression using a temporary database, never real accounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { createService } = require('../server');
const express = require('express');

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shitu-account-browser-'));
  const service = createService({ databaseFile: path.join(directory, 'database.json'), secret: 'browser-test-secret', initialAdminUsername: 'browser-admin', initialAdminPassword: 'old-password' });
  service.initialize();
  const prefix = process.env.APP_PREFIX || '';
  const app = express();
  app.use(prefix || '/', service.app);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/login.html`);
    await page.locator('#username').fill('browser-admin');
    await page.locator('#password').fill('old-password');
    await page.locator('#login-form button').click();
    await page.waitForURL('**/admin.html');
    await page.waitForFunction(() => document.querySelector('#admin-subtitle').textContent.includes('browser-admin'));
    const oldToken = await page.evaluate(() => localStorage.getItem(window.GraphApi.TOKEN_KEY));
    assert.ok(oldToken);

    // A different browser context represents another logged-in device.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`${base}/login.html`);
    await otherPage.evaluate(token => localStorage.setItem(window.GraphApi.TOKEN_KEY, token), oldToken);
    await otherPage.goto(`${base}/admin.html`);
    await otherPage.waitForFunction(() => document.querySelector('#admin-subtitle').textContent.includes('browser-admin'));

    await page.locator('#account-password').fill('new-password');
    await page.locator('#account-form button[type=submit]').click();
    await page.waitForURL('**/login.html?**passwordChanged=1');
    assert.equal(await page.evaluate(() => localStorage.getItem(window.GraphApi.TOKEN_KEY)), null);
    assert.match(await page.locator('#login-message').textContent(), /密码已更新/);
    await otherPage.reload();
    await otherPage.waitForURL('**/login.html?**');
    assert.equal(await otherPage.evaluate(() => localStorage.getItem(window.GraphApi.TOKEN_KEY)), null);

    await page.locator('#username').fill('browser-admin');
    await page.locator('#password').fill('old-password');
    await page.locator('#login-form button').click();
    await page.waitForFunction(() => document.querySelector('#login-message').textContent.includes('用户名或密码错误'));
    await page.locator('#password').fill('new-password');
    await page.locator('#login-form button').click();
    await page.waitForURL('**/admin.html');
    await page.waitForFunction(() => document.querySelector('#admin-subtitle').textContent.includes('browser-admin'));
    assert.notEqual(await page.evaluate(() => localStorage.getItem(window.GraphApi.TOKEN_KEY)), oldToken);
    const fallback = `${prefix}/admin.html`;
    for (const unsafe of ['https://example.invalid/', '//example.invalid/', '/\\example.invalid/', 'javascript:alert(1)']) {
      assert.equal(await page.evaluate(value => window.GraphApi.safeNext(value), unsafe), fallback);
    }
    if (prefix) assert.equal(await page.evaluate(() => window.GraphApi.safeNext('/other/admin.html')), fallback);
    console.log('PASS: password change signs out current and other devices; old password fails, new password restores access.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    // Remove only known files in the explicitly allocated test directory.
    for (const name of ['database.json', 'database.last-good.backup.json']) {
      const file = path.join(directory, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(directory);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
