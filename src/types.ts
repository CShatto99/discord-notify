export type FetchImpl = typeof fetch;

export interface DiscordEmbedField {
  name: string;
  value: string;
}

export interface DiscordEmbed {
  title: string;
  url?: string;
  description?: string;
  fields?: DiscordEmbedField[];
  timestamp?: string;
}

export interface DiscordMessage {
  username: string;
  content?: string;
  allowed_mentions?: {
    parse: Array<'everyone'>;
  };
  embeds: DiscordEmbed[];
}

export type NotifierChanges = Record<string, unknown[]>;

export interface Notifier<State, Changes extends NotifierChanges> {
  id: string;
  name: string;
  schedule: string;
  timezone: string;
  snapshotFile: string;
  getCurrentState(options?: { fetchImpl?: FetchImpl | undefined }): Promise<State>;
  compare(previousState: State, currentState: State): Changes;
  buildDiscordMessage(options: {
    changes: Changes;
    currentState: State;
    previousState: State;
  }): DiscordMessage;
}

export type RunNotifierResult<State, Changes extends NotifierChanges> =
  | {
      status: 'baseline-created';
      notifierId: string;
      currentState: State;
    }
  | {
      status: 'unchanged';
      notifierId: string;
      currentState: State;
      changes: Changes;
    }
  | ({
      status: 'changed';
      notifierId: string;
      currentState: State;
      changes: Changes;
    } & Changes);

export interface FailedNotifierResult {
  status: 'failed';
  notifierId: string;
  error: unknown;
}
