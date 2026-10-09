import './boards.css';
import './jira.css';
import type { JiraIssue } from '../../shared/protocol';
import type { Net } from '../net';
import { store } from '../state';
import { h, openModal, timeAgo } from './dom';
import { labelChip } from './github/labels';

const TILTS = ['-1.2deg', '0.8deg', '-0.4deg', '1.4deg', '0deg', '-0.9deg'];
const NOTE_COLORS = ['#fff7b0', '#ffd6e0', '#caffbf', '#bde0fe', '#ffe5b4'];
const COLUMNS: { key: JiraIssue['category']; title: string; max?: number }[] = [
  { key: 'todo', title: '📥 To do' },
  { key: 'progress', title: '🚧 In progress' },
  { key: 'done', title: '✅ Done', max: 40 },
];

const byUpdated = (a: JiraIssue, b: JiraIssue) => b.updatedAt.localeCompare(a.updatedAt);

/** The Jira board: To do, In progress and Done, like the issues board. An admin connects it once. */
export function openJiraBoard(net: Net) {
  const body = h('div.body');
  const status = h('span.board-status');
  const refresh = h('button.btn', { type: 'button', title: 'Refresh from Jira', onclick: () => net.send({ t: 'jira.refresh' }) }, '🔄 Refresh');
  const gear = h('button.btn', { type: 'button', title: 'Jira connection', 'aria-label': 'Jira connection' }, '⚙️');
  const close = h('button.btn.close', { type: 'button', 'aria-label': 'Close' }, '✕');
  const el = h('div.modal.board', { role: 'dialog', 'aria-label': 'Jira board' }, h('header', {}, h('h2', {}, '🗂️ Jira'), status, refresh, gear, close), body);

  const form = { site: store.jira.config.site ?? '', email: store.jira.config.email ?? '', token: '', project: store.jira.config.project ?? '' };
  const queries: Record<string, string> = {};
  let formOpen = !store.jira.config.configured;
  let seenError = '';
  /** Set when Connect is clicked, so a saved connection puts the board back up. */
  let saving = false;

  const field = (key: 'site' | 'email' | 'token' | 'project', label: string, placeholder: string, password = false) => {
    const input = h('input', {
      type: password ? 'password' : 'text',
      value: form[key],
      placeholder,
      'aria-label': label,
      'data-focus': key,
      autocomplete: 'off',
      spellcheck: 'false',
    }) as HTMLInputElement;
    input.addEventListener('input', () => (form[key] = input.value));
    return h('label', {}, label, input);
  };

  const setup = () => {
    const admin = store.me.admin;
    const box = h('div.jira-setup');
    if (!admin) {
      box.append(h('h3', {}, 'Jira isn’t connected'), h('p', {}, 'An admin can connect this floor to a Jira Cloud project. The board then shows its issues in To do, In progress and Done.'));
      return box;
    }
    const configured = store.jira.config.configured;
    box.append(
      h('h3', {}, configured ? 'Jira connection' : 'Connect Jira'),
      h('p', {}, 'A Jira Cloud site, the Atlassian account, an API token from id.atlassian.com, and the project key. The token stays on this floor’s machine. Anyone on the floor can read the board.'),
      field('site', 'Site', 'https://your-team.atlassian.net'),
      field('email', 'Email', 'you@company.com'),
      field('token', 'API token', configured ? 'Saved — paste a new one to replace it' : 'API token', true),
      field('project', 'Project key', 'PROJ'),
    );
    if (store.jira.saveError) box.append(h('p.err', {}, store.jira.saveError));
    const save = h('button.btn.primary', {
      type: 'button',
      onclick: () => {
        saving = true;
        net.send({ t: 'jira.configure', site: form.site, email: form.email, token: form.token, project: form.project });
      },
    }, configured ? 'Save' : 'Connect');
    const row = h('div.row', {}, save);
    if (configured) {
      row.prepend(h('button.btn.danger', { type: 'button', onclick: () => net.send({ t: 'jira.clear' }) }, 'Disconnect'));
      row.prepend(h('button.btn', { type: 'button', onclick: () => ((formOpen = false), render()) }, 'Back'));
    }
    box.append(row);
    return box;
  };

  const card = (it: JiraIssue, i: number) => {
    const open = () => window.open(it.url, '_blank', 'noopener');
    return h(
      'li.card',
      {
        style: `--tilt:${TILTS[i % TILTS.length]};background:${NOTE_COLORS[i % NOTE_COLORS.length]}`,
        tabindex: 0,
        onclick: open,
        onkeydown: (e: Event) => {
          if (e instanceof KeyboardEvent && e.key === 'Enter' && e.target === e.currentTarget) open();
        },
      },
      h('div.num', {}, it.key),
      h('div.ttl', {}, it.title),
      h(
        'div.meta',
        {},
        ...[
          it.type,
          it.priority,
          ...it.labels.slice(0, 4).map(labelChip),
          it.assignee ? `👤 ${it.assignee}` : `by ${it.author || 'someone'}`,
          it.comments ? `💬 ${it.comments}` : '',
          it.status,
          timeAgo(it.updatedAt),
        ]
          .filter((m) => m !== '')
          .map((m) => (typeof m === 'string' ? h('span', {}, m) : m)),
      ),
    );
  };

  const column = (key: string, title: string, items: JiraIssue[], max?: number) => {
    const ul = h('ul');
    const count = h('span');
    const name = title.replace(/^\S+ /, '');
    const search = h('input', { type: 'text', value: queries[key] ?? '', placeholder: 'Filter by title…', 'aria-label': `Filter ${name} by title`, 'data-focus': `search:${key}`, spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
    const clear = h('button.col-search-clear', { type: 'button', 'aria-label': 'Clear the title filter', title: 'Clear' }, '✕');
    const section = h('section.column');
    const fill = () => {
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      const matching = words.length ? items.filter((it) => words.every((w) => it.title.toLowerCase().includes(w) || it.key.toLowerCase().includes(w))) : items;
      const shown = matching.slice(0, max);
      ul.replaceChildren(...shown.map(card));
      if (!shown.length) ul.append(h('li.empty', {}, words.length ? `No titles match “${search.value.trim()}”` : 'Nothing here'));
      count.textContent = words.length ? `${shown.length} / ${items.slice(0, max).length}` : String(shown.length);
      clear.classList.toggle('hidden', !search.value);
      section.classList.toggle('filtered', words.length > 0);
    };
    search.addEventListener('input', () => {
      queries[key] = search.value;
      ul.scrollTop = 0;
      fill();
    });
    clear.addEventListener('click', () => {
      search.value = queries[key] = '';
      fill();
      search.focus();
    });
    section.append(h('h4', { style: 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px' }, h('span', {}, title), h('span.col-count', {}, count)), h('div.col-search', {}, search, clear), ul);
    fill();
    return section;
  };

  const render = () => {
    const st = store.jira;
    if (st.saveError && st.saveError !== seenError) formOpen = true;
    seenError = st.saveError ?? '';
    if (st.saveError) saving = false;
    else if (saving && st.config.configured) {
      saving = false;
      formOpen = false;
    }
    const showForm = formOpen || !st.config.configured;
    status.textContent = st.loading ? 'Refreshing…' : st.error && st.items.length ? st.error : st.fetchedAt && st.config.configured ? `Updated ${timeAgo(st.fetchedAt)}` : '';
    refresh.classList.toggle('hidden', !st.config.configured);
    gear.classList.toggle('hidden', !st.config.configured || !store.me.admin || showForm);
    const scrolled = [...body.querySelectorAll('.column > ul')].map((ul) => ul.scrollTop);
    const active = document.activeElement;
    const focused = active && body.contains(active) ? active.getAttribute('data-focus') : null;
    const caret = active instanceof HTMLInputElement ? ([active.selectionStart, active.selectionEnd] as const) : null;
    body.replaceChildren();
    if (showForm) body.append(setup());
    else if (st.error && !st.items.length) body.append(h('div.board-error', {}, `Couldn't load from Jira: ${st.error}`, h('br'), h('small', {}, 'Check the site, the account and the API token under ⚙️.')));
    else for (const col of COLUMNS) body.append(column(col.key, col.title, st.items.filter((it) => it.category === col.key).sort(byUpdated), col.max));
    body.querySelectorAll('.column > ul').forEach((ul, i) => (ul.scrollTop = scrolled[i] ?? 0));
    const again = focused === null ? undefined : [...body.querySelectorAll<HTMLElement>('[data-focus]')].find((b) => b.dataset.focus === focused);
    again?.focus();
    if (caret && again instanceof HTMLInputElement) again.setSelectionRange(caret[0], caret[1]);
  };

  gear.addEventListener('click', () => {
    formOpen = true;
    render();
  });
  const unsub = store.on('jira', render);
  const me = store.on('me', render);
  const timer = setInterval(() => {
    const st = store.jira;
    if (!formOpen && st.config.configured) status.textContent = st.loading ? 'Refreshing…' : st.fetchedAt ? `Updated ${timeAgo(st.fetchedAt)}` : '';
  }, 15000);
  const modal = openModal(el, {
    doing: '🗂️ at the Jira board',
    onClose: () => {
      unsub();
      me();
      clearInterval(timer);
    },
  });
  close.addEventListener('click', () => modal.close());
  render();
}
