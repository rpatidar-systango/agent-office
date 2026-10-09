// The floor's Jira board: connecting it (admins) and refreshing it.
import type { JiraClientMsg, JiraState } from '../../../shared/protocol.js';
import type { Client } from '../../office/client.js';
import type { Ctx } from '../../office/context.js';
import { str } from '../../office/input.js';
import { here } from './common.js';
import type { HandlerMap, ViewPieces } from './types.js';

const empty: JiraState = { items: [], config: { configured: false }, fetchedAt: 0, loading: false };

export const jiraView: ViewPieces['jira'] = (_ctx, floor) => floor?.jira.state ?? empty;

const admin = (ctx: Ctx, c: Client, what: string): boolean => {
  if (ctx.meOf(c.accountId).admin) return true;
  ctx.warn(c, `Only an admin can ${what} Jira`);
  return false;
};

export const jiraHandlers = {
  'jira.refresh'(ctx, c) {
    void ctx.floorOf(c)?.jira.refresh();
  },
  'jira.configure'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor || !admin(ctx, c, 'connect')) return;
    const error = floor.jira.configure({ site: str(msg.site, 300), email: str(msg.email, 200), token: str(msg.token, 500), project: str(msg.project, 20) });
    if (error) ctx.sendTo(c, { t: 'jira.issues', state: { ...floor.jira.state, saveError: error } });
  },
  'jira.clear'(ctx, c) {
    const floor = here(ctx, c);
    if (!floor || !admin(ctx, c, 'disconnect')) return;
    floor.jira.clear();
  },
} satisfies HandlerMap<JiraClientMsg>;
