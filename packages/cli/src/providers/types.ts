export interface ChatChunk {
  type: 'assistant' | 'result' | 'system' | 'tool' | 'thinking' | 'error';
  content?: string;
  sessionId?: string;
  toolName?: string;
}

export interface IAssistantChat {
  sendQuery(prompt: string, cwd: string, resumeSessionId?: string): AsyncGenerator<ChatChunk>;
  getType(): string;
}
