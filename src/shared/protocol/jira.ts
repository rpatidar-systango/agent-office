// This floor's Jira board: a Cloud project's issues, read with an API token kept on the machine.

export type JiraColumn = 'todo' | 'progress' | 'done';

export interface JiraLabel {
  name: string;
  /** A CSS color ("#d73a4a"). Jira's own labels have no color, so the office picks one. */
  color: string;
}

export interface JiraIssue {
  /** PROJ-123 */
  key: string;
  title: string;
  /** The status's name on the board ("In Progress"). */
  status: string;
  /** Which column it sits in, from Jira's status category. */
  category: JiraColumn;
  url: string;
  author: string;
  assignee: string;
  labels: JiraLabel[];
  type: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  comments: number;
}

/** What the page is allowed to know. The API token stays on the machine. */
export interface JiraConfig {
  configured: boolean;
  site?: string;
  email?: string;
  project?: string;
}

export interface JiraState {
  items: JiraIssue[];
  config: JiraConfig;
  error?: string;
  /** Why the last attempt to connect was refused, for the person who tried. */
  saveError?: string;
  fetchedAt: number;
  loading: boolean;
}

export type JiraClientMsg =
  | { t: 'jira.refresh' }
  | { t: 'jira.configure'; site: string; email: string; token: string; project: string }
  | { t: 'jira.clear' };

export type JiraServerMsg = { t: 'jira.issues'; state: JiraState };
