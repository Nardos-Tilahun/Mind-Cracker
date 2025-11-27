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

  // 1. Handle Critical API Errors immediately
  if (acc.startsWith("Error:") || acc.includes("503 Service Unavailable")) {
    return { status: "error", thinking: acc.replace("Error:", "").trim() }
  }

  // --- ROBUST PARSING LOGIC ---

  // 2. Extract Thinking (Reasoning)
  // We use a regex that captures everything inside <think> tags.
  // The (?:<\/think>|$) handles cases where the closing tag hasn't arrived yet (streaming).
  const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/
  const thinkMatch = acc.match(thinkRegex)
  
  if (thinkMatch) {
      thinking = thinkMatch[1].trim()
  } else if (!jsonResult) {
      // Fallback: If no tags found yet, but we are in the early stage and text is accumulating,
      // it might be thinking if it hasn't started a JSON object yet.
      // However, we strictly prefer tags.
      const jsonStart = acc.indexOf("{")
      if (jsonStart === -1 && acc.length < 50) {
          // Very short start, likely thinking
          thinking = acc.trim()
      }
  }

  // 3. Isolate the "Actual Content" (The JSON or Final Answer)
  // We effectively delete the <think> block from the accumulator to process the rest.
  let contentOnly = acc.replace(/<think>[\s\S]*?<\/think>/g, "").trim() // Remove complete tags
  contentOnly = contentOnly.replace(/<think>[\s\S]*/, "").trim() // Remove incomplete open tag content

  // 4. Extract and Parse JSON from the Content Only
  // We look for the *last* valid JSON object or the widest one if nested.
  // Simple heuristic: Find first '{' and last '}'
  const jsonStart = contentOnly.indexOf("{")
  const jsonEnd = contentOnly.lastIndexOf("}")

  if (jsonStart > -1) {
      if (status !== "error") status = "synthesizing"

      // Attempt to extract the JSON string
      let candidate = contentOnly.substring(jsonStart)
      if (jsonEnd > jsonStart) {
          candidate = contentOnly.substring(jsonStart, jsonEnd + 1)
      }

      // Clean Markdown Code Blocks (Common issue with Gemini/DeepSeek)
      candidate = candidate
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()

      try {
          // Only accept it if it looks like a complete object (ends with })
          // We wrap in try/catch because during streaming, it will fail often until complete.
          if (candidate.endsWith("}")) {
              const parsed = JSON.parse(candidate)
              
              // Validate structure (must have steps or message)
              if ((parsed.steps && Array.isArray(parsed.steps)) || parsed.message) {
                  jsonResult = parsed
                  // Note: We don't force 'complete' here; we let the stream 'done' signal handle that
                  // unless we are sure it's valid.
              }
          }
      } catch (e) {
          // JSON incomplete, continue synthesizing (streaming JSON)
      }
  }

  // 5. Fallback for "Chatty" Models or Failed JSON (The exact issue you screenshotted)
  // If we have a lot of content (e.g. > 100 chars), NO valid JSON found yet, 
  // AND the content seems to be just text (no starting brackets), treat it as the final message.
  if (!jsonResult && contentOnly.length > 100 && jsonStart === -1) {
      // We assume the model failed to output JSON and is just talking.
      // We wrap the text in our structure so the UI doesn't break or show raw tags.
      jsonResult = {
          message: contentOnly, // This ensures clean text without <think> tags
          steps: [] 
      }
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