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
  // Look for <think> tags first (Standard for many reasoning models)
  const thinkMatch = acc.match(/<think>([\s\S]*?)<\/think>/)
  
  if (thinkMatch) {
      thinking = thinkMatch[1].trim()
  } else {
      // Fallback: If no tags, assume everything before the first "{" is thinking
      // ONLY IF we haven't found JSON yet.
      const jsonStart = acc.indexOf("{")
      if (jsonStart > -1) {
          const preJson = acc.substring(0, jsonStart)
          // Clean up potential markdown code block markers from thinking
          thinking = preJson.replace(/```json/g, "").replace(/```/g, "").replace(/<think>/g, "").trim()
      } else {
          // If no JSON started yet, update thinking if we are in reasoning mode
          if (!jsonResult) {
             thinking = acc.replace(/<think>/g, "").trim()
          }
      }
  }

  // 2. EXTRACT JSON
  const jsonStart = acc.indexOf("{")
  const jsonEnd = acc.lastIndexOf("}")

  if (jsonStart > -1) {
      if (status !== "error") status = "synthesizing"

      // Try to parse partial or full JSON
      let candidate = acc.substring(jsonStart)
      if (jsonEnd > jsonStart) {
          candidate = acc.substring(jsonStart, jsonEnd + 1)
      }

      // Cleanup markdown if present inside the candidate region (rare but possible)
      candidate = candidate.replace(/```json/g, "").replace(/```/g, "").trim()

      try {
          // Check if it looks like a complete object
          if (candidate.endsWith("}")) {
              const parsed = JSON.parse(candidate)
              if (parsed.steps && Array.isArray(parsed.steps)) {
                  jsonResult = parsed
                  // We do NOT set status='complete' here. 
                  // We let runStream handle completion based on the stream ending.
                  // This allows for post-JSON commentary if necessary, 
                  // though mostly we assume JSON is the end.
              }
          }
      } catch (e) {
          // JSON incomplete, continue synthesizing
      }
  }

  // 3. Fallback for "Chatty" Models (No JSON found after long output)
  // Only triggers if NO JSON brackets have been seen yet.
  if (!jsonResult && acc.length > 800 && jsonStart === -1) {
      // If we have a lot of text and no JSON, it might be a failure or a text response.
      // We store it as a message result so the user sees something, 
      // but runStream might still consider it a failure if it strictly validates steps.
      jsonResult = {
          message: acc.replace(/<think>[\s\S]*?<\/think>/, "").trim(),
          steps: [] // Empty steps indicates unstructured response
      }
  }

  const newMetrics = { ...currentAgent.metrics }
  // Only set end time if we are explicitly erroring out here
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

  // Allow updates if we are forcing completion or fixing content
  // Prevent reverting 'complete' status unless it's a forced error/stop
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