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
    status = "error"
    thinking = acc.replace("Error:", "")
  } else {
    const jsonStartIndex = acc.indexOf("{")
    if (jsonStartIndex === -1) {
      status = "reasoning"
      thinking = acc.replace(/<think>|<\/think>/g, "").trim()
    } else {
      if (status !== "error") status = "synthesizing"
      thinking = acc.substring(0, jsonStartIndex).replace(/<think>|<\/think>/g, "").trim()
      const rawJson = acc.substring(jsonStartIndex).replace(/```json/g, "").replace(/```/g, "")
      
      if (rawJson.includes("}")) {
        try {
          const lastBraceIndex = rawJson.lastIndexOf("}")
          if (lastBraceIndex !== -1) {
            const candidate = rawJson.substring(0, lastBraceIndex + 1)
            const parsed = JSON.parse(candidate)
            if (parsed.steps || parsed.message) {
              jsonResult = parsed
              status = "complete"
            }
          }
        } catch {}
      }
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
  
  if (currentAgent.status === "complete" || currentAgent.status === "stopped") {
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

  if (agent && ["reasoning", "synthesizing", "waiting"].includes(agent.status)) {
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