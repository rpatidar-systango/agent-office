// This floor's Jira board. An admin connects a Jira Cloud site, an Atlassian account and a project
// key; the API token is kept in .agent-office/jira.json and never sent back to a browser.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { JiraColumn, JiraIssue, JiraState } from '../shared/protocol.js';

const LABEL_COLORS = ['#d73a4a', '#0075ca', '#e4e669', '#cfd3d7', '#a2eeef', '#7057ff', '#008672', '#bfd4f2'];
/** Three pages is enough for a board; a project with more still shows the most recently updated. */
const PAGES = 3;
const PAGE = 100;
const TIMEOUT_MS = 20_000;

export interface JiraSaved {
  site: string;
  email: string;
  token: string;
  project: string;
}

export interface JiraSetup {
  site: string;
  email: string;
  token: string;
  project: string;
}

export function labelColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 33 + name.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length]!;
}

/** Jira's status category: new and anything else are To do, indeterminate is In progress, done is Done. */
export function columnOf(categoryKey: string): JiraColumn {
  if (categoryKey === 'done') return 'done';
  if (categoryKey === 'indeterminate') return 'progress';
  return 'todo';
}

/** An https origin with no user, path, query or hash, and not an IP address. */
export function jiraSite(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return;
  if (url.pathname !== '/' && url.pathname !== '') return;
  if (!url.hostname.includes('.') || url.hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return;
  return url.origin;
}

const PROJECT_RE = /^[A-Z][A-Z0-9]{1,9}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Checks a connection. A blank token keeps the saved one when the site and email are unchanged.
 * Returns the reason it was refused.
 */
export function checkJiraSetup(input: JiraSetup, previous?: JiraSaved): JiraSaved | string {
  const site = jiraSite(input.site);
  if (!site) return 'The site should look like https://your-team.atlassian.net';
  const email = input.email.trim();
  if (!EMAIL_RE.test(email) || email.length > 200) return 'Enter the email of the Atlassian account';
  const project = input.project.trim().toUpperCase();
  if (!PROJECT_RE.test(project)) return 'A project key looks like PROJ';
  const token = input.token.trim() || (previous && previous.site === site && previous.email === email ? previous.token : '');
  if (token.length < 8 || token.length > 500 || /[\r\n]/.test(token)) return 'Paste an API token from id.atlassian.com';
  return { site, email, token, project };
}

export function jiraPublic(saved?: JiraSaved): JiraState['config'] {
  if (!saved) return { configured: false };
  return { configured: true, site: saved.site, email: saved.email, project: saved.project };
}

function text(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** The issues in one search page. A row without a key is skipped. */
export function issuesFrom(site: string, payload: unknown): JiraIssue[] {
  const issues = payload && typeof payload === 'object' && Array.isArray((payload as { issues?: unknown }).issues) ? (payload as { issues: unknown[] }).issues : [];
  const out: JiraIssue[] = [];
  for (const raw of issues) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as { key?: unknown; fields?: Record<string, unknown> };
    const key = text(row.key);
    if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) continue;
    const fields = row.fields ?? {};
    const status = fields.status && typeof fields.status === 'object' ? (fields.status as { name?: unknown; statusCategory?: { key?: unknown } }) : {};
    const names = Array.isArray(fields.labels) ? fields.labels.filter((l): l is string => typeof l === 'string' && l.length > 0 && l.length <= 80).slice(0, 12) : [];
    const person = (v: unknown) => (v && typeof v === 'object' && typeof (v as { displayName?: unknown }).displayName === 'string' ? (v as { displayName: string }).displayName : '');
    const named = (v: unknown) => (v && typeof v === 'object' && typeof (v as { name?: unknown }).name === 'string' ? (v as { name: string }).name : '');
    const comment = fields.comment && typeof fields.comment === 'object' ? Number((fields.comment as { total?: unknown }).total) : 0;
    out.push({
      key,
      title: text(fields.summary).slice(0, 300) || key,
      status: text(status.name) || 'To do',
      category: columnOf(text(status.statusCategory?.key)),
      url: `${site}/browse/${key}`,
      author: person(fields.reporter),
      assignee: person(fields.assignee),
      labels: names.map((name) => ({ name, color: labelColor(name) })),
      type: named(fields.issuetype),
      priority: named(fields.priority),
      createdAt: text(fields.created),
      updatedAt: text(fields.updated),
      comments: Number.isFinite(comment) ? comment : 0,
    });
  }
  return out;
}

function readSaved(file: string): JiraSaved | undefined {
  if (!existsSync(file)) return;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<JiraSaved>;
    const checked = checkJiraSetup({ site: raw.site ?? '', email: raw.email ?? '', token: raw.token ?? '', project: raw.project ?? '' });
    return typeof checked === 'string' ? undefined : checked;
  } catch {
    return;
  }
}

async function jiraError(res: Response, token: string): Promise<string> {
  if (res.status === 401 || res.status === 403) return 'Jira refused that email and API token';
  if (res.status === 404) return 'This site has no Jira Cloud search API (rest/api/3/search/jql)';
  if (res.status === 429) return 'Jira is rate limiting the office; try Refresh in a moment';
  let detail = '';
  try {
    const body = (await res.json()) as { errorMessages?: unknown; message?: unknown };
    if (Array.isArray(body.errorMessages)) detail = body.errorMessages.filter((m): m is string => typeof m === 'string').join(' ');
    else if (typeof body.message === 'string') detail = body.message;
  } catch {
    detail = '';
  }
  const msg = (detail ? `Jira said: ${detail}` : `Jira returned ${res.status}`).slice(0, 300);
  return token ? msg.split(token).join('…') : msg;
}

/** Every issue the board shows, newest updates first, from Jira Cloud's search. */
export async function fetchJiraIssues(saved: JiraSaved, fetchImpl: typeof fetch): Promise<JiraIssue[]> {
  const auth = Buffer.from(`${saved.email}:${saved.token}`).toString('base64');
  const items: JiraIssue[] = [];
  let pageToken = '';
  for (let page = 0; page < PAGES; page++) {
    const res = await fetchImpl(`${saved.site}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = ${saved.project} ORDER BY updated DESC`,
        maxResults: PAGE,
        fields: ['summary', 'status', 'assignee', 'reporter', 'labels', 'updated', 'created', 'comment', 'issuetype', 'priority'],
        ...(pageToken ? { nextPageToken: pageToken } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(await jiraError(res, saved.token));
    const payload = (await res.json()) as { nextPageToken?: unknown; isLast?: unknown };
    items.push(...issuesFrom(saved.site, payload));
    const next = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : '';
    if (!next || payload.isLast === true) break;
    pageToken = next;
  }
  return items;
}

function said(err: unknown, token: string): string {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) return "Jira didn't answer";
  const message = err instanceof Error ? err.message : 'Could not reach Jira';
  return token ? message.split(token).join('…') : message;
}

/** One floor's Jira connection and the issues it last read. */
export class JiraBoard {
  state: JiraState;
  private saved?: JiraSaved;
  private listing?: Promise<void>;
  private file: string;

  constructor(
    dir: string,
    private onState: (state: JiraState) => void,
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.file = path.join(dir, '.agent-office', 'jira.json');
    this.saved = readSaved(this.file);
    this.state = { items: [], config: jiraPublic(this.saved), fetchedAt: 0, loading: false };
  }

  get configured(): boolean {
    return !!this.saved;
  }

  refresh(): Promise<void> {
    if (!this.saved) {
      this.publish({ items: [], config: { configured: false }, fetchedAt: Date.now(), loading: false });
      return Promise.resolve();
    }
    if (this.listing) return this.listing;
    const run = this.load().finally(() => {
      if (this.listing === run) this.listing = undefined;
    });
    this.listing = run;
    return run;
  }

  /** Saves a connection and reads the board. Returns why it was refused. */
  configure(input: JiraSetup): string | undefined {
    const checked = checkJiraSetup(input, this.saved);
    if (typeof checked === 'string') return checked;
    this.saved = checked;
    this.listing = undefined;
    mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, `${JSON.stringify(checked)}\n`, { mode: 0o600 });
    this.publish({ ...this.state, config: jiraPublic(checked), saveError: undefined, error: undefined });
    void this.refresh();
    return undefined;
  }

  clear() {
    this.saved = undefined;
    this.listing = undefined;
    if (existsSync(this.file)) rmSync(this.file);
    this.publish({ items: [], config: { configured: false }, fetchedAt: Date.now(), loading: false });
  }

  private async load() {
    const saved = this.saved;
    if (!saved) return;
    this.publish({ ...this.state, config: jiraPublic(saved), loading: true, error: undefined, saveError: undefined });
    try {
      const items = await fetchJiraIssues(saved, this.fetchImpl);
      if (this.saved !== saved) return;
      this.publish({ items, config: jiraPublic(saved), fetchedAt: Date.now(), loading: false });
    } catch (err) {
      if (this.saved !== saved) return;
      this.publish({ ...this.state, loading: false, error: said(err, saved.token), fetchedAt: Date.now() });
    }
  }

  private publish(state: JiraState) {
    this.state = state;
    this.onState(state);
  }
}
