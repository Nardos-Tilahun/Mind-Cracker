export type AgentState = {
  modelId: string;
  status: 'waiting' | 'reasoning' | 'synthesizing' | 'complete' | 'error' | 'stopped';
  rawOutput: string;
  thinking: string; // The internal monologue
  jsonResult: any;  // The final structured data
  metrics: { startTime: number; endTime: number | null };
}

// New: A snapshot of a specific version of a turn (Thread Branch)
export type TurnVersion = {
  id: string;
  userMessage: string;
  agents: Record<string, AgentState>; // The AI response state for this specific version
  downstreamHistory: ChatTurn[];      // The conversation thread that followed this version
  createdAt: number;
}

export type ChatTurn = {
  id: string;
  userMessage: string; // The currently displayed user message
  agents: Record<string, AgentState>; // The currently displayed agent states
  
  // Versioning Control
  versions: TurnVersion[];
  currentVersionIndex: number;
}

export type Model = {
  id: string;
  name: string;
  provider: string;
  context_length: number;
}