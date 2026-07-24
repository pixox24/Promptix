import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('freeze creates an immutable shadow rule version and audits the actor', async () => {
  const { createAutopublishOperations } = await import(new URL('../dist/lib/autopublish-operations.js', import.meta.url));
  const versions = [{
    id: 'rules-1', version: 4,
    rules: { autopublish: { frozen: false, mode: 'live' } },
  }];
  const audits = [];
  const operations = createAutopublishOperations({
    async activeRules() { return versions.at(-1); },
    async createRules(value) { const next = { id: 'rules-2', version: 5, rules: value.rules }; versions.push(next); return next; },
    async audit(value) { audits.push(value); },
    async overview() { return {}; },
  });
  const result = await operations.freeze({ actorId: 'owner-1', reason: 'incident drill' });
  assert.equal(result.rules.autopublish.frozen, true);
  assert.equal(result.rules.autopublish.mode, 'shadow');
  assert.equal(result.version, 5);
  assert.equal(audits[0].actorId, 'owner-1');
});

test('overview always separates delegated and scheduled metrics', async () => {
  const { createAutopublishOperations } = await import(new URL('../dist/lib/autopublish-operations.js', import.meta.url));
  const operations = createAutopublishOperations({
    async activeRules() { return { version: 1, rules: { autopublish: {} } }; },
    async createRules(value) { return value; }, async audit() {},
    async overview() { return { delegated: 3, scheduledAgent: 2 }; },
  });
  const view = await operations.overview();
  assert.equal(view.triggers.delegated, 3);
  assert.equal(view.triggers.scheduledAgent, 2);
});

test('delegated control creates one immutable rule version without enabling scheduled Agent', async () => {
  const { createAutopublishOperations } = await import(new URL('../dist/lib/autopublish-operations.js', import.meta.url));
  const versions = [{
    id: 'rules-1',
    version: 4,
    rules: {
      autopublish: {
        delegatedEnabled: false,
        scheduledAgentEnabled: false,
        mode: 'shadow',
        frozen: false,
      },
    },
  }];
  const audits = [];
  const operations = createAutopublishOperations({
    async activeRules() { return versions.at(-1); },
    async createRules(value) {
      const next = { id: 'rules-2', version: 5, rules: value.rules };
      versions.push(next);
      return next;
    },
    async audit(value) { audits.push(value); },
    async overview() { return {}; },
  });

  const result = await operations.delegated({
    actorId: 'owner-1',
    reason: 'enable delegated testing',
    enabled: true,
  });

  assert.equal(result.rules.autopublish.delegatedEnabled, true);
  assert.equal(result.rules.autopublish.scheduledAgentEnabled, false);
  assert.equal(result.rules.autopublish.mode, 'shadow');
  assert.equal(result.version, 5);
  assert.equal(versions.length, 2);
  assert.equal(audits.length, 1);
});

test('run creation reads delegated control from the nested governance autopublish rules', async () => {
  const { parseStoredAutopublishRules } = await import(
    new URL('../dist/lib/autopublish-rule-loader.js', import.meta.url)
  );
  const rules = parseStoredAutopublishRules({
    schedule: { enabled: true },
    autopublish: {
      delegatedEnabled: true,
      scheduledAgentEnabled: false,
      mode: 'shadow',
      frozen: false,
    },
  });

  assert.equal(rules.delegatedEnabled, true);
  assert.equal(rules.scheduledAgentEnabled, false);
  assert.equal(rules.mode, 'shadow');
});

test('operations routes expose overview, runs, observations, freeze and mode', async () => {
  const source = await readFile(new URL('../src/routes/autopublish.ts', import.meta.url), 'utf8');
  for (const route of ["get('/overview'", "get('/runs'", "get('/observations'", "post('/freeze'", "post('/mode'", "post('/delegated'"]) {
    assert.ok(source.includes(route), route);
  }
});
