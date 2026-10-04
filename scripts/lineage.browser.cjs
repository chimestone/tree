'use strict';

// Manual browser regression: load real page functions with isolated DAG data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/main\(\);\s*$/, '');
    await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g, ''));
    await page.evaluate(() => {
      window.d3 = { interpolateRgbBasis: () => () => '' };
      document.getElementById('loading').classList.add('hidden');
    });
    await page.addScriptTag({ content: script });
    async function fixture(names, edges, selectedId) {
      await page.evaluate(({ names, edges, selectedId }) => {
        const persons = names.map((name, i) => ({ id: i + 1, name, avatar: '', description: '', category: '' }));
        const relationships = edges.map(([master_id, disciple_id], i) => ({ id: i + 1, master_id, disciple_id }));
        const data = processData(persons, relationships);
        S.nodeMap = data.nodeMap;
        S.mastersMap = data.mastersMap;
        S.childrenMap = data.childrenMap;
        // Keep the real click handler; isolate camera movement from this test.
        selectAndFocus = node => { window.focusedPersonId = node.id; showInfoPanel(node); };
        window.focusedPersonId = null;
        showInfoPanel(S.nodeMap.get(selectedId));
      }, { names, edges, selectedId });
    }
    const ancestors = page.locator('#info-content .info-section').nth(0);
    const masters = page.locator('#info-content .info-section').nth(1);
    const disciples = page.locator('#info-content .info-section').nth(2);
    async function expectAncestors(names) {
      assert.equal(await ancestors.locator('h3').textContent(), `历代师承（${names.length}人）`);
      assert.deepEqual(await ancestors.locator('[data-id]').allTextContents(), names);
      assert.equal((await ancestors.textContent()).includes('←'), false);
      assert.equal((await ancestors.textContent()).includes('→'), false);
    }

    await fixture(['A', 'B', 'C'], [[1, 2], [2, 3]], 3);
    await expectAncestors(['A', 'B']);
    assert.deepEqual(await masters.locator('[data-id]').allTextContents(), ['B']);

    await fixture(['A', 'B', 'C', 'D'], [[1, 3], [2, 3], [3, 4]], 3);
    await expectAncestors(['A', 'B']);
    assert.deepEqual(await masters.locator('[data-id]').allTextContents(), ['A', 'B']);
    assert.deepEqual(await disciples.locator('[data-id]').allTextContents(), ['D']);

    await fixture(['祖师', '师傅甲', '师傅乙', '<徒弟>'], [[1, 2], [1, 3], [2, 4], [3, 4]], 4);
    await expectAncestors(['祖师', '师傅甲', '师傅乙']);
    assert.equal(await ancestors.locator('[data-id="1"]').count(), 1, 'common ancestor must appear only once');
    assert.equal(await page.locator('#info-content > h2').textContent(), '<徒弟>');
    await ancestors.locator('[data-id="1"]').click();
    assert.equal(await page.evaluate(() => window.focusedPersonId), 1);
    assert.equal(await page.locator('#info-content > h2').textContent(), '祖师');
    await expectAncestors([]);
    assert.match(await ancestors.textContent(), /本人为祖师/);
    assert.deepEqual(await disciples.locator('[data-id]').allTextContents(), ['师傅甲', '师傅乙']);
    console.log('PASS: lineage list shows no invented edges; chain, multiple masters, shared ancestors, root and click targets are correct.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
