import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JiraBoard, checkJiraSetup, issuesFrom, jiraSite } from '../src/server/jira.js';

const site = 'https://acme.atlassian.net';
const token = 'super-secret-token';

test('a Jira site is an https origin, nothing else', () => {
  assert.equal(jiraSite('https://acme.atlassian.net'), site);
  assert.equal(jiraSite('https://acme.atlassian.net/'), site);
  assert.equal(jiraSite('http://acme.atlassian.net'), undefined);
  assert.equal(jiraSite('https://user:pass@acme.atlassian.net'), undefined);
  assert.equal(jiraSite('https://acme.atlassian.net/jira'), undefined);
  assert.equal(jiraSite('https://169.254.169.254'), undefined);
  assert.equal(jiraSite('https://localhost'), undefined);
});

test('a blank token keeps the saved one when the site and email stay the same', () => {
  const saved = { site, email: 'a@b.co', token, project: 'PROJ' };
  assert.equal(typeof checkJiraSetup({ site, email: 'a@b.co', token: '', project: 'ops' }, saved), 'object');
  const next = checkJiraSetup({ site, email: 'a@b.co', token: '', project: 'ops' }, saved);
  assert.equal(typeof next === 'string' ? next : next.token, token);
  assert.equal(typeof next === 'string' ? '' : next.project, 'OPS');
  assert.equal(typeof checkJiraSetup({ site, email: 'new@b.co', token: '', project: 'OPS' }, saved), 'string');
  assert.equal(typeof checkJiraSetup({ site: 'http://nope', email: 'a@b.co', token, project: 'PROJ' }), 'string');
});

test('search rows land in To do, In progress and Done', () => {
  const issues = issuesFrom(site, {
    issues: [
      { key: 'PROJ-1', fields: { summary: 'Write it', status: { name: 'To Do', statusCategory: { key: 'new' } }, labels: ['bug'], reporter: { displayName: 'Ada' } } },
      { key: 'PROJ-2', fields: { summary: 'Doing it', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } }, assignee: { displayName: 'Grace' }, comment: { total: 3 } } },
      { key: 'PROJ-3', fields: { summary: 'Shipped', status: { name: 'Done', statusCategory: { key: 'done' } } } },
      { key: 'not a key', fields: { summary: 'skip' } },
    ],
  });
  assert.deepEqual(issues.map((i) => [i.key, i.category, i.url]), [
    ['PROJ-1', 'todo', `${site}/browse/PROJ-1`],
    ['PROJ-2', 'progress', `${site}/browse/PROJ-2`],
    ['PROJ-3', 'done', `${site}/browse/PROJ-3`],
  ]);
  assert.equal(issues[0]!.labels[0]!.name, 'bug');
  assert.equal(issues[0]!.author, 'Ada');
  assert.equal(issues[1]!.assignee, 'Grace');
  assert.equal(issues[1]!.comments, 3);
});

test('connecting saves the token on disk and the page never hears it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-jira-'));
  const seen: { state: unknown }[] = [];
  let body = '';
  const fetchImpl: typeof fetch = async (_url, init) => {
    body = String(init?.body ?? '');
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    assert.equal(Buffer.from(auth.replace(/^Basic /, ''), 'base64').toString(), `a@b.co:${token}`);
    return new Response(JSON.stringify({ issues: [{ key: 'PROJ-9', fields: { summary: 'On the board', status: { name: 'To Do', statusCategory: { key: 'new' } } } }], isLast: true }), { status: 200 });
  };
  try {
    const board = new JiraBoard(dir, (state) => seen.push({ state }), fetchImpl);
    assert.equal(board.configured, false);
    assert.equal(board.configure({ site, email: 'a@b.co', token, project: 'proj' }), undefined);
    await board.refresh();
    const file = readFileSync(path.join(dir, '.agent-office', 'jira.json'), 'utf8');
    assert.equal(file.includes(token), true);
    const published = JSON.stringify(seen);
    assert.equal(published.includes(token), false);
    assert.equal(board.state.items[0]?.key, 'PROJ-9');
    assert.equal(body.includes('project = PROJ'), true);
    board.clear();
    assert.equal(board.configured, false);
    assert.equal(board.state.items.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a refusal names the status and never the token', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-jira-'));
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ errorMessages: [`nope ${token}`] }), { status: 400 });
  try {
    const board = new JiraBoard(dir, () => {}, fetchImpl);
    board.configure({ site, email: 'a@b.co', token, project: 'PROJ' });
    await board.refresh();
    assert.match(board.state.error ?? '', /nope/);
    assert.equal((board.state.error ?? '').includes(token), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
