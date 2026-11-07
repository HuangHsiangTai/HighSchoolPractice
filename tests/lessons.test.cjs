'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const manifest = require('./lessons.json');

const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
// Existing lessons predate the full interaction contract. New lessons belong in full.
const legacyBasic = [
  'grade_11/biology/高二第一次段考/高二第一次段考_互動解題.html',
  'grade_11/math/高二第一次段考/高二數學第一次段考_互動解題.html',
  'grade_11/math/段考2週考1/週考1_互動解題.html',
  'grade_11/physics/高二第一次段考/高二物理第一次段考_互動解題.html'
];
let browser;

async function discover(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const location = path.join(dir, entry.name);
    if (entry.isDirectory() && (entry.name.startsWith('.') || ['node_modules', 'test-results', 'playwright-report', '_site'].includes(entry.name))) return [];
    if (entry.isDirectory()) return discover(location);
    return entry.isFile() && entry.name.endsWith('_互動解題.html') ? [path.relative(root, location).split(path.sep).join('/')] : [];
  }));
  return files.flat();
}

function classified() {
  return [...manifest.basic, ...manifest.full.map(lesson => lesson.path)];
}

before(async () => { browser = await chromium.launch(); });
after(async () => { if (browser) await browser.close(); });

async function withPage(name, file, run) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const requests = [];
  const url = pathToFileURL(path.join(root, file)).href;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const target = request.url();
    if (target !== url && !target.startsWith('data:') && !target.startsWith('blob:')) requests.push(target);
  });
  await page.route(/^https?:/, route => route.abort());
  try {
    await page.goto(url, { waitUntil: 'load' });
    await run(page);
    assert.deepEqual(errors, [], `JavaScript errors: ${file}`);
    assert.deepEqual(requests, [], `External resource requests: ${file}`);
  } catch (error) {
    await fs.mkdir(results, { recursive: true });
    const artifact = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    await page.screenshot({ path: path.join(results, `${artifact}.png`), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(results, `${artifact}.txt`), `${error.stack}\n\nPage errors: ${JSON.stringify(errors)}\nRequests: ${JSON.stringify(requests)}\n`);
    throw error;
  } finally {
    await page.close();
  }
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'horizontal overflow');
}

async function checkReferences(page) {
  const broken = await page.locator('[aria-controls]').evaluateAll(elements => elements.flatMap(el =>
    el.getAttribute('aria-controls').split(/\s+/).filter(id => id && !document.getElementById(id))));
  assert.deepEqual(broken, [], 'aria-controls references must exist');
}

async function checkRenderedFormulas(page) {
  const raw = await page.locator('article[data-qid]').evaluateAll(elements => elements.flatMap(el =>
    el.textContent.split(/[，。；]/).filter(fragment => /(?:\w|\))\s*\^\s*(?:\(|[\w√−-])/.test(fragment))));
  assert.deepEqual(raw, [], 'unrendered exponent notation');
}

function panel(page, id) { return page.locator('article[data-qid]').filter({ has: page.locator(`form[data-qid="${id}"]`) }); }
function nav(page, id) { return page.locator(`button[data-qid="${id}"]`).first(); }
function action(question, name) { return question.locator(`[data-action="${name}"]`); }

async function selectAnswer(question, data, answer) {
  if (data.type === 'numeric' || data.type === 'text') {
    await question.locator(`input[type="${data.type === 'numeric' ? 'number' : 'text'}"]`).fill(answer);
  } else {
    for (const input of await question.locator('input[name="choice"]').all()) {
      const checked = answer.includes(await input.getAttribute('value'));
      if (await input.getAttribute('type') === 'radio') { if (checked) await input.check(); }
      else await input.setChecked(checked);
    }
  }
}

async function expectOutcome(question, expected) {
  await action(question, 'submit-practice').click();
  assert.equal(await question.locator('.feedback').getAttribute('data-state'), expected);
  assert.equal(await question.locator('.practice-solution').isVisible(), true);
}

async function checkFull(page, lesson) {
  const ids = lesson.questions.map(question => question.id);
  assert.equal(await page.locator('article[data-qid]').count(), ids.length);
  assert.equal(await page.locator('button[data-qid]').count(), ids.length);
  await checkReferences(page);
  await checkRenderedFormulas(page);

  for (const id of ids) {
    await nav(page, id).click();
    const question = panel(page, id);
    assert(await question.isVisible());
    assert(await question.locator('.original-answer').isVisible());
    assert.equal(await question.locator('.practice-solution').isVisible(), false);
    assert.equal(await question.locator('.solution-steps .step:visible').count(), 1);
  }

  await nav(page, ids[0]).focus();
  await page.keyboard.press('Enter');
  assert(await panel(page, ids[0]).isVisible(), 'keyboard navigation selects a question');

  const first = panel(page, ids[0]);
  await nav(page, ids[0]).click();
  if (await first.locator('.solution-steps .step').count() > 1) {
    await action(first, 'next-step').click();
    assert.equal(await first.locator('.solution-steps .step:visible').count(), 2);
    if (ids.length > 1) {
      await nav(page, ids[1]).click();
      await nav(page, ids[0]).click();
      assert.equal(await first.locator('.solution-steps .step:visible').count(), 2);
    }
    await action(first, 'prev-step').click();
    assert.equal(await first.locator('.solution-steps .step:visible').count(), 1);
  }
  await action(first, 'show-all').click();
  assert.equal(await first.locator('.solution-steps .step:visible').count(), await first.locator('.solution-steps .step').count());

  for (let index = 0; index < lesson.questions.length; index++) {
    const data = lesson.questions[index];
    const question = panel(page, data.id);
    await nav(page, data.id).click();
    if (data.type === 'numeric') {
      assert((await question.locator('.unit').textContent()).includes(data.unit));
      assert((await question.locator('.grading-hint').textContent()).includes(data.tolerance));
    }
    await action(question, 'submit-practice').click();
    assert.equal(await question.locator('.feedback').getAttribute('data-state'), 'empty');
    assert.equal(await question.locator('.practice-solution').isVisible(), false);
    for (const attempt of [data.wrong, ...(data.partial ? [data.partial] : [])]) {
      await selectAnswer(question, data, attempt);
      await expectOutcome(question, 'wrong');
      await action(question, 'retry-practice').click();
      assert.equal(await question.locator('.practice-solution').isVisible(), false);
      assert.equal(await question.locator('.feedback').textContent(), '');
    }
    await selectAnswer(question, data, data.correct);
    await expectOutcome(question, 'correct');
    assert.equal(await page.locator('#completion-count').textContent(), String(index + 1));
    if (ids.length > 1) {
      await nav(page, ids[(index + 1) % ids.length]).click();
      await nav(page, data.id).click();
    }
    assert(await question.locator('.practice-solution').isVisible());
    if (data.type === 'numeric' || data.type === 'text') {
      assert.equal(await question.locator(`input[type="${data.type === 'numeric' ? 'number' : 'text'}"]`).inputValue(), data.correct);
    } else {
      const selected = await question.locator('input[name="choice"]:checked').evaluateAll(inputs => inputs.map(input => input.value).sort());
      assert.deepEqual(selected, [...data.correct].sort());
    }
    await action(question, 'retry-practice').click();
    assert.equal(await page.locator('#completion-count').textContent(), String(index));
    assert.equal(await question.locator('.practice-solution').isVisible(), false);
    if (data.type === 'numeric' || data.type === 'text') {
      assert.equal(await question.locator(`input[type="${data.type === 'numeric' ? 'number' : 'text'}"]`).inputValue(), '');
    } else assert.equal(await question.locator('input[name="choice"]:checked').count(), 0);
    await selectAnswer(question, data, data.correct);
    await expectOutcome(question, 'correct');
  }

  assert(await page.locator('#next-question').isDisabled());
  if (ids.length > 1) {
    await page.locator('#prev-question').click();
    assert(await panel(page, ids[ids.length - 2]).isVisible());
    await page.locator('#next-question').click();
    assert(await panel(page, ids[ids.length - 1]).isVisible());
  } else assert(await page.locator('#prev-question').isDisabled());
  await nav(page, ids[0]).click();
  await page.locator('#reset-question').click();
  assert.equal(await first.locator('.solution-steps .step:visible').count(), 1);
  assert.equal(await first.locator('.practice-solution').isVisible(), false);
  assert.equal(await page.locator('#completion-count').textContent(), String(ids.length - 1));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ids) {
    await nav(page, id).click();
    await action(panel(page, id), 'show-all').click();
    await panel(page, id).locator('details').evaluateAll(elements => elements.forEach(element => { element.open = true; }));
    await noOverflow(page);
  }
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('article[data-qid]:visible').count(), ids.length);
  assert.equal(await page.locator('.practice-solution:visible').count(), ids.length);
  assert.equal(await page.locator('.solution-steps .step:visible').count(), await page.locator('.solution-steps .step').count());
  assert.equal(await page.locator('button:visible').count(), 0, 'print must hide operation buttons');
}

test('every lesson is classified exactly once', async () => {
  const all = classified();
  assert.deepEqual([...manifest.basic].sort(), [...legacyBasic].sort(), 'new lessons must use full interaction tests');
  assert.equal(new Set(all).size, all.length, 'duplicate lesson classification');
  assert.deepEqual((await discover(root)).sort(), all.sort(), 'add a full test fixture for each new lesson');
  for (const lesson of manifest.full) {
    assert(lesson.questions.length >= 1, `${lesson.path} needs at least one question`);
    assert.equal(new Set(lesson.questions.map(question => question.id)).size, lesson.questions.length);
    for (const question of lesson.questions) {
      assert(['numeric', 'text', 'single_choice', 'multiple_choice'].includes(question.type), `unsupported practice type: ${question.type}`);
      assert(question.correct != null && question.wrong != null, `${question.id} needs independently checked correct and wrong inputs`);
      if (question.type === 'numeric') assert(question.unit != null && question.tolerance != null, `${question.id} needs a unit and tolerance`);
      if (question.type === 'multiple_choice') assert(question.partial?.length, `${question.id} needs a partial answer`);
    }
  }
});

for (const [index, file] of classified().entries()) {
  test(`offline and responsive: ${file}`, async () => withPage(`basic-${index}`, file, async page => {
    assert((await page.locator('body').innerText()).trim().length > 0, 'lesson body is empty');
    await noOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(page);
  }));
}

for (const [index, lesson] of manifest.full.entries()) {
  test(`complete interactions: ${lesson.path}`, async () => withPage(`full-${index}`, lesson.path, page => checkFull(page, lesson)));
}

// These controlled failures verify the assertions themselves without modifying lesson files.
test('guards detect broken references, unrendered exponents and incorrect grading', async () => {
  const lesson = manifest.full[0];
  await withPage('guard-regressions', lesson.path, async page => {
    await page.locator('button[data-qid]').first().evaluate(el => el.setAttribute('aria-controls', 'missing-target'));
    await assert.rejects(checkReferences(page), /aria-controls/);
    await page.locator('button[data-qid]').first().evaluate(el => el.setAttribute('aria-controls', 'panel-system-3'));
    await page.locator('article[data-qid]').first().evaluate(el => el.insertAdjacentText('beforeend', ' x^y'));
    await assert.rejects(checkRenderedFormulas(page), /unrendered exponent/);
    const question = panel(page, lesson.questions[0].id);
    await selectAnswer(question, lesson.questions[0], lesson.questions[0].wrong);
    await question.locator('form').evaluate(form => form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopPropagation();
      form.querySelector('.feedback').dataset.state = 'correct';
      form.querySelector('.practice-solution').hidden = false;
    }, { capture: true, once: true }));
    await assert.rejects(expectOutcome(question, 'wrong'), /correct/);
  });
});
