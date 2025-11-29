import { AgentState, ChatTurn, TurnVersion } from "@/types/chat"

export const createNewTurn = (input: string, models: string[], metadata: any = null): ChatTurn => {
  const turnId = Date.now().toString()
  const agents: Record<string, AgentState> = {}

  models.forEach((id) => {
    agents[id] = {
      modelId: id,
      status: "reasoning",
      rawOutput: "",
      thinking: "",
      jsonResult: null,
      metrics: { startTime: Date.now(), endTime: null },
    }
  })

  const initialVersion: TurnVersion = {
    id: turnId + "-v1",
    userMessage: input,
    agents: JSON.parse(JSON.stringify(agents)),
    downstreamHistory: [],
    createdAt: Date.now(),
  }

  return {
    id: turnId,
    userMessage: input,
    agents,
    versions: [initialVersion],
    currentVersionIndex: 0,
    metadata 
  }
}

// CHANGED: Much more robust parsing to strip markdown and isolate JSON
export const parseStreamChunk = (acc: string, currentAgent: AgentState): Partial<AgentState> => {
  let status: AgentState["status"] = currentAgent.status
  let { thinking, jsonResult } = currentAgent

  if (acc.startsWith("Error:")) {
    return { status: "error", thinking: acc.replace("Error:", "").trim() }
  }

  // 1. Extract Thinking
  // We look for content inside <think> tags. 
  const thinkMatch = acc.match(/<think>([\s\S]*?)(?:<\/think>|$)/);
  if (thinkMatch) {
      thinking = thinkMatch[1].trim();
      // If the closing tag isn't there yet, we are definitely reasoning
      if (!acc.includes("</think>")) {
          status = "reasoning";
      }
  }

  // 2. Extract Potential JSON Content
  // We remove the <think> block entirely to find the payload
  let contentOnly = acc.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  
  // Remove markdown code fences if present (e.g. ```json ... ```)
  contentOnly = contentOnly.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/```$/, "");

  // 3. Find JSON Brackets
  const jsonStart = contentOnly.indexOf("{")
  const jsonEnd = contentOnly.lastIndexOf("}")

  if (jsonStart > -1) {
      status = "synthesizing"
      
      // Try to parse the substring between the first { and the last }
      // This handles cases where the AI might add text after the JSON
      const candidate = contentOnly.substring(jsonStart, jsonEnd + 1);

      try {
          // Only attempt parse if it looks complete-ish (ends with })
          if (candidate.endsWith("}")) {
              const parsed = JSON.parse(candidate)
              if (parsed.message || (parsed.steps && Array.isArray(parsed.steps))) {
                  jsonResult = parsed
              }
          }
      } catch (e) { 
          // JSON is incomplete (streaming), just wait for more chunks
      }
  } else if (contentOnly.length > 0 && !jsonResult) {
      // If we have content but no JSON start bracket yet, and we are NOT thinking,
      // it might be pre-amble text. We generally ignore this in favor of waiting for JSON,
      // unless the model failed to output JSON entirely.
  }

  const newMetrics = { ...currentAgent.metrics }
  if (status === "error" && !newMetrics.endTime) {
    newMetrics.endTime = Date.now()
  }

  return { rawOutput: acc, status, thinking, jsonResult, metrics: newMetrics }
}

export const updateHistoryWithChunk = (
  prevHistory: ChatTurn[],
  turnId: string,
  modelId: string,
  targetVersionIndex: number,
  updates: Partial<AgentState>
): ChatTurn[] => {
  const idx = prevHistory.findIndex((t) => t.id === turnId)
  if (idx === -1) return prevHistory

  const turn = { ...prevHistory[idx] }
  const versionToUpdate = turn.versions[targetVersionIndex]
  if (!versionToUpdate || !versionToUpdate.agents[modelId]) return prevHistory

  const currentAgent = versionToUpdate.agents[modelId]

  if (currentAgent.status === "complete" && updates.status !== "complete" && updates.status !== "stopped") {
      return prevHistory
  }

  const updatedAgents = {
    ...versionToUpdate.agents,
    [modelId]: { ...currentAgent, ...updates },
  }

  const updatedVersions = [...turn.versions]
  updatedVersions[targetVersionIndex] = {
    ...updatedVersions[targetVersionIndex],
    agents: updatedAgents,
  }

  turn.versions = updatedVersions
  if (turn.currentVersionIndex === targetVersionIndex) {
    turn.agents = updatedAgents
  }

  const newHistory = [...prevHistory]
  newHistory[idx] = turn
  return newHistory
}

export const stopAgentInHistory = (
  prevHistory: ChatTurn[],
  turnId: string,
  modelId: string,
  targetVersionIndex: number
): ChatTurn[] => {
  const idx = prevHistory.findIndex((t) => t.id === turnId)
  if (idx === -1) return prevHistory

  const turn = { ...prevHistory[idx] }
  const version = turn.versions[targetVersionIndex]
  const agent = version?.agents[modelId]

  if (agent && ["reasoning", "synthesizing", "waiting", "retrying"].includes(agent.status)) {
    const updatedAgents = {
      ...version.agents,
      [modelId]: {
        ...agent,
        status: "stopped" as const,
        thinking: agent.thinking + "\n[Interrupted]",
        metrics: { ...agent.metrics, endTime: Date.now() },
      },
    }

    const updatedVersions = [...turn.versions]
    updatedVersions[targetVersionIndex] = { ...version, agents: updatedAgents }

    turn.versions = updatedVersions
    if (turn.currentVersionIndex === targetVersionIndex) {
        turn.agents = updatedAgents
    }

    const newH = [...prevHistory]
    newH[idx] = turn
    return newH
  }
  return prevHistory
}