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
    return { status: "error", thinking: acc.replace("Error:", "").trim() }
  }

  // --- PARSING LOGIC FOR THINKING TAGS ---
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/;
  const thinkMatch = acc.match(thinkRegex);

  // If we found <think> tags, extract the content
  if (thinkMatch) {
      thinking = thinkMatch[1].trim();
      
      // If we are still inside the open tag, we are "reasoning"
      if (!acc.includes("</think>")) {
          status = "reasoning";
      }
  }

  // Remove the <think> block to isolate the JSON/Message part
  const contentOnly = acc.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // --- PARSING LOGIC FOR JSON ---
  const jsonStart = contentOnly.indexOf("{")
  const jsonEnd = contentOnly.lastIndexOf("}")

  if (jsonStart > -1) {
      // If we passed the thinking stage and see JSON brackets
      status = "synthesizing"

      const candidate = contentOnly.substring(jsonStart, jsonEnd + 1)
      const cleanCandidate = candidate
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()

      try {
          if (cleanCandidate.endsWith("}")) {
              const parsed = JSON.parse(cleanCandidate)
              if (parsed.message || (parsed.steps && Array.isArray(parsed.steps))) {
                  jsonResult = parsed
              }
          }
      } catch (e) {
          // JSON streaming...
      }
  } 
  // If no JSON yet, but we have content outside <think>, it might be the intro text
  else if (contentOnly.length > 0 && !jsonResult) {
      // status = "synthesizing" 
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