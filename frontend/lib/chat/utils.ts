import { AgentState, ChatTurn, TurnVersion } from "@/types/chat"

export const createNewTurn = (input: string, models: string[]): ChatTurn => {
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
  }
}

export const parseStreamChunk = (acc: string, currentAgent: AgentState): Partial<AgentState> => {
  let status: AgentState["status"] = currentAgent.status
  let { thinking, jsonResult } = currentAgent

  if (acc.startsWith("Error:")) {
    return { status: "error", thinking: acc.replace("Error:", "") }
  }

  // 1. EXTRACT THINKING
  // Look for <think> tags first
  const thinkMatch = acc.match(/<think>([\s\S]*?)<\/think>/)
  if (thinkMatch) {
      thinking = thinkMatch[1].trim()
  } else {
      // Fallback: If no tags, assume everything before the first "{" is thinking
      const jsonStart = acc.indexOf("{")
      if (jsonStart > -1) {
          thinking = acc.substring(0, jsonStart).replace(/<think>/g, "").trim()
      } else {
          // If no JSON started yet, update thinking if looking for it
          if (!jsonResult) thinking = acc.replace(/<think>/g, "").trim()
      }
  }

  // 2. EXTRACT JSON
  // Look for the JSON object structure
  const jsonStart = acc.indexOf("{")
  const jsonEnd = acc.lastIndexOf("}")
  
  if (jsonStart > -1) {
      if (status !== "error") status = "synthesizing"
      
      // Try to parse partial or full JSON
      let candidate = acc.substring(jsonStart)
      if (jsonEnd > jsonStart) {
          candidate = acc.substring(jsonStart, jsonEnd + 1)
      }

      // Cleanup markdown if present
      candidate = candidate.replace(/```json/g, "").replace(/```/g, "").trim()

      try {
          // Check if it looks like a complete object
          if (candidate.endsWith("}")) {
              const parsed = JSON.parse(candidate)
              if (parsed.steps && Array.isArray(parsed.steps)) {
                  jsonResult = parsed
                  status = "complete"
              }
          }
      } catch (e) {
          // JSON incomplete, continue synthesizing
      }
  }

  // 3. Fallback for "Chatty" Models (No JSON found after long output)
  if (!jsonResult && acc.length > 500 && jsonStart === -1) {
      if (status !== 'complete') {
          jsonResult = {
              message: acc.replace(/<think>[\s\S]*?<\/think>/, "").trim(),
              steps: []
          }
          status = "complete" 
      }
  }

  const newMetrics = { ...currentAgent.metrics }
  if ((status === "complete" || status === "error") && !newMetrics.endTime) {
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

  // Allow updates if we are forcing completion or fixing content
  if (currentAgent.status === "complete" && updates.status !== "complete") {
      // Don't revert status, but allow metric/text updates
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