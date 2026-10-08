import type { JiraState } from '../../../shared/protocol';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** This floor's Jira issues, and whether a project is connected. */
    jira: JiraState;
  }
  interface Topics {
    jira: true;
  }
}

const empty = (): JiraState => ({ items: [], config: { configured: false }, fetchedAt: 0, loading: false });

export const jira: Slice = {
  init(s) {
    s.jira = empty();
  },
  on: {
    'jira.issues'(s, m) {
      s.jira = m.state;
      return ['jira'];
    },
  },
  enter(s, v) {
    s.jira = v.jira;
    return ['jira'];
  },
};
