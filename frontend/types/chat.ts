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

  // CHANGED: Added metadata for Tree Logic
  metadata?: {
    parentTurnId?: string; // The ID of the turn that spawned this one
    parentStepNumber?: string; // The step number (e.g., "1.3") that spawned this
    level?: number; // Depth level (0, 1, 2...)
  };
}

export type Model = {
  id: string;
  name: string;
  provider: string;
  context_length: number;
}