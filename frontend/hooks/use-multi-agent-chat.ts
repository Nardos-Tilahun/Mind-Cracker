import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { authClient } from "@/lib/auth-client"
import { useHistory } from "@/lib/context/history-context"
import { AgentState, ChatTurn, TurnVersion } from "@/types/chat"
import { fetchStream } from "@/lib/chat/api"
import { createNewTurn, parseStreamChunk, updateHistoryWithChunk, stopAgentInHistory } from "@/lib/chat/utils"
import { useChatPersistence } from "./use-chat-persistence"
import { toast } from "sonner"

// --- CONFIGURATION ---
// 1. Models to try in order
const FALLBACK_CANDIDATES = [
    "google/gemini-2.5-flash-lite-preview-02-05:free",
    "x-ai/grok-code-fast-1",
    "qwen/qwen3-coder-flash",
    "google/gemini-2.0-flash-exp:free"
]

// 2. Max time (ms) a single model is allowed to run before we kill it
// 60 seconds is generous for reasoning, but stops infinite loops.
const MAX_MODEL_DURATION_MS = 60000; 

const WITTY_ERRORS = [
    "Mission Aborted: The AI council is currently on a coffee break. We tried everything, but the servers are ghosting us.",
    "404 Strategy Not Found: I consulted the digital oracles, and they remain silent. The backend might be napping.",
    "Critical Failure: We ran out of compute juice. It's not you, it's our infrastructure. Please try again in a moment.",
    "The hamsters powering our servers have gone on strike. We are currently negotiating for better pellets.",
    "System Overload: Too much genius, not enough bandwidth. We couldn't crack the goal this time.",
    "I tried 4 different AI brains, and they all shrugged. This goal is tougher than it looks (or the server is down)."
]

export function useMultiAgentChat() {
  const { data: session } = authClient.useSession()
  const { refreshHistory } = useHistory()

  const [history, setHistory] = useState<ChatTurn[]>([])
  const [currentChatId, setCurrentChatId] = useState<number | null>(null)

  const currentChatIdRef = useRef<number | null>(null)
  const historyRef = useRef<ChatTurn[]>([])
  const chatsCacheRef = useRef<Map<number, ChatTurn[]>>(new Map())
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const retryCountRef = useRef<Record<string, number>>({})

  useEffect(() => { currentChatIdRef.current = currentChatId }, [currentChatId])

  useEffect(() => {
    historyRef.current = history
    if (currentChatId) chatsCacheRef.current.set(currentChatId, history)
  }, [history, currentChatId])

  const { saveToBackend, clearLocalState, isChatLoaded } = useChatPersistence(
    history,
    currentChatId,
    setCurrentChatId,
    setHistory,
    chatsCacheRef,
    session?.user?.id,
    refreshHistory
  )

  const isProcessing = useMemo(() => {
    if (history.length === 0) return false
    const lastTurn = history[history.length - 1]
    return Object.values(lastTurn.agents).some(agent =>
      ["waiting", "reasoning", "synthesizing", "retrying"].includes(agent.status)
    )
  }, [history])

  const stopOtherStreams = useCallback((exceptChatId: number | null) => {
    abortControllersRef.current.forEach((controller, key) => {
      const chatIdStr = key.split(":")[0]
      const ctrlChatId = chatIdStr === "null" ? null : Number(chatIdStr)
      if (ctrlChatId !== exceptChatId) {
        controller.abort()
        abortControllersRef.current.delete(key)
      }
    })
  }, [])

  const stopStream = useCallback(() => {
    const currentId = currentChatIdRef.current
    let anythingStopped = false;

    abortControllersRef.current.forEach((controller, key) => {
      const chatIdStr = key.split(":")[0]
      const ctrlChatId = chatIdStr === "null" ? null : Number(chatIdStr)
      
      if (ctrlChatId === currentId) {
        controller.abort()
        abortControllersRef.current.delete(key)
      }
    })

    setHistory(prev => {
      if (prev.length === 0) return prev
      const lastTurn = prev[prev.length - 1]
      const updatedAgents = { ...lastTurn.agents }
      let hasUpdates = false

      Object.keys(updatedAgents).forEach(key => {
        const agent = updatedAgents[key]
        if (["reasoning", "synthesizing", "waiting", "retrying"].includes(agent.status)) {
          updatedAgents[key] = {
            ...agent,
            status: "stopped",
            thinking: agent.thinking + "\n[Session Terminated by User]",
            metrics: { ...agent.metrics, endTime: Date.now() }
          }
          hasUpdates = true
          anythingStopped = true
        }
      })

      if (!hasUpdates) return prev

      const updatedVersions = [...lastTurn.versions]
      updatedVersions[lastTurn.currentVersionIndex] = {
        ...updatedVersions[lastTurn.currentVersionIndex],
        agents: updatedAgents
      }

      const newHistory = [...prev]
      newHistory[prev.length - 1] = { ...lastTurn, agents: updatedAgents, versions: updatedVersions }

      if (currentId && anythingStopped) {
          saveToBackend(currentId, newHistory)
          chatsCacheRef.current.set(currentId, newHistory)
      }
      return newHistory
    })
  }, [saveToBackend])

  // --- REVISED FALLBACK LOGIC ---
  const triggerFallback = useCallback((turnId: string, failedModelId: string, context: ChatTurn[], currentVersionIdx: number, reason: string = "failed") => {
      const chatId = currentChatIdRef.current
      const retryKey = `${turnId}:${currentVersionIdx}` 
      const attempts = retryCountRef.current[retryKey] || 0

      // 1. CHECK IF EXHAUSTED
      if (attempts >= FALLBACK_CANDIDATES.length) {
          const wittyError = WITTY_ERRORS[Math.floor(Math.random() * WITTY_ERRORS.length)];
          
          toast.error("All AI agents failed to respond.")
          
          setHistory(prev => {
             const idx = prev.findIndex(t => t.id === turnId)
             if (idx === -1) return prev
             const turn = { ...prev[idx] }
             const version = { ...turn.versions[currentVersionIdx] }
             const agents = { ...version.agents }
             
             if (agents[failedModelId]) {
                 agents[failedModelId] = {
                     ...agents[failedModelId],
                     status: "error", 
                     thinking: agents[failedModelId].thinking + `\n\n[SYSTEM]: ${reason}. Maximum retries exceeded.`,
                     jsonResult: {
                        message: wittyError,
                        steps: []
                     },
                     metrics: { ...agents[failedModelId].metrics, endTime: Date.now() }
                 }
             }

             version.agents = agents
             turn.versions[currentVersionIdx] = version
             turn.agents = agents
             
             const newState = [...prev]
             newState[idx] = turn
             
             if (chatId) {
                 chatsCacheRef.current.set(chatId, newState)
                 saveToBackend(chatId, newState)
             }
             
             return newState
          })
          return // STOP HERE.
      }

      // 2. PREPARE NEXT CANDIDATE
      const nextModelId = FALLBACK_CANDIDATES[attempts]
      retryCountRef.current[retryKey] = attempts + 1

      // Specific message based on why we are switching
      const switchMessage = reason.includes("Timeout") 
        ? `Agent ${failedModelId} timed out (stuck reasoning). Switching to ${nextModelId}...`
        : `Agent ${failedModelId} produced invalid output. Switching to ${nextModelId}...`

      toast.info(switchMessage)

      setHistory(prev => {
          const idx = prev.findIndex(t => t.id === turnId)
          if (idx === -1) return prev

          const turn = { ...prev[idx] }
          const version = { ...turn.versions[currentVersionIdx] }
          const agents = { ...version.agents }

          delete agents[failedModelId]

          agents[nextModelId] = {
              modelId: nextModelId,
              status: "retrying" as any,
              rawOutput: "",
              thinking: `Previous model (${failedModelId}) ${reason}.\nAttempt ${attempts + 1}/${FALLBACK_CANDIDATES.length}: Handing over context to ${nextModelId}...`,
              jsonResult: null,
              metrics: { startTime: Date.now(), endTime: null }
          }

          version.agents = agents
          turn.versions = [...turn.versions]
          turn.versions[currentVersionIdx] = version
          turn.agents = agents

          const newState = [...prev]
          newState[idx] = turn

          if (chatId) chatsCacheRef.current.set(chatId, newState)

          setTimeout(() => {
             const controller = new AbortController()
             const key = `${chatId}:${nextModelId}`
             abortControllersRef.current.set(key, controller)
             runStream(turnId, nextModelId, turn.userMessage, newState.slice(0, idx), currentVersionIdx, controller.signal, chatId)
          }, 1000)

          return newState
      })

  }, [saveToBackend])

  const runStream = async (
    turnId: string,
    modelId: string,
    userMsg: string,
    context: ChatTurn[],
    targetVersionIndex: number,
    signal: AbortSignal,
    chatId: number | null
  ) => {
    // Start Time for Timeout Calculation
    const startTime = Date.now();

    try {
      const apiMessages = [
        ...context.map(t => {
          const best = Object.values(t.agents).find(a => a.status === "complete" || a.status === "stopped")
          return [{ role: "user", content: t.userMessage }, { role: "assistant", content: best?.rawOutput || "" }]
        }).flat(),
        { role: "user", content: userMsg }
      ]

      const res = await fetchStream(apiMessages, modelId, session?.user?.id, signal)
      
      if (!res.ok || !res.body) {
          throw new Error(`Server returned ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      let hasStarted = false

      while (true) {
        const { done, value } = await reader.read()

        // --- TIMEOUT CHECK ---
        // If the loop runs for too long (even if chunks are arriving), we kill it.
        // This handles "Infinite Reasoning" where the model keeps talking but never answers.
        if (Date.now() - startTime > MAX_MODEL_DURATION_MS) {
            // Abort the reader manually
            await reader.cancel();
            throw new Error("Model Timeout: Reasoning took too long");
        }

        if (done) {
            const activeHistory = (chatId ? chatsCacheRef.current.get(chatId) : null) ||
                                  (currentChatIdRef.current === chatId ? historyRef.current : null)
            
            if (activeHistory) {
                const idx = activeHistory.findIndex(t => t.id === turnId)
                if (idx !== -1) {
                    const currentAgent = activeHistory[idx].versions[targetVersionIndex].agents[modelId]
                    
                    // --- SUCCESS CRITERIA ---
                    if (currentAgent && currentAgent.jsonResult && (currentAgent.jsonResult.steps || currentAgent.jsonResult.message)) {
                        const updatedHistory = updateHistoryWithChunk(activeHistory, turnId, modelId, targetVersionIndex, {
                            status: "complete",
                            metrics: {
                                startTime: currentAgent.metrics.startTime,
                                endTime: Date.now()
                            }
                        })
                        if (chatId) chatsCacheRef.current.set(chatId, updatedHistory)
                        if (currentChatIdRef.current === chatId) setHistory(updatedHistory)
                        saveToBackend(chatId, updatedHistory)
                    } else {
                        // FAILURE CASE: Empty or invalid output
                        console.warn(`Model ${modelId} finished but output was invalid.`)
                        triggerFallback(turnId, modelId, context, targetVersionIndex, "produced invalid output")
                    }
                }
            }
            break
        }

        if (signal.aborted) break

        acc += decoder.decode(value, { stream: true })

        if (!hasStarted && (acc.includes("Error:") || acc.includes("400") || acc.includes("429") || acc.includes("503"))) {
             triggerFallback(turnId, modelId, context, targetVersionIndex, "returned API Error")
             return
        }
        hasStarted = true

        const activeHistory = (chatId ? chatsCacheRef.current.get(chatId) : null) ||
                              (currentChatIdRef.current === chatId ? historyRef.current : null)

        if (activeHistory) {
          const idx = activeHistory.findIndex(t => t.id === turnId)
          if (idx !== -1) {
             const currentAgent = activeHistory[idx].versions[targetVersionIndex].agents[modelId]
             const updates = parseStreamChunk(acc, currentAgent)
             const updatedHistory = updateHistoryWithChunk(activeHistory, turnId, modelId, targetVersionIndex, updates)

             if (chatId) chatsCacheRef.current.set(chatId, updatedHistory)
             if (currentChatIdRef.current === chatId) setHistory(updatedHistory)

             if (acc.length % 200 === 0) {
                saveToBackend(chatId, updatedHistory)
             }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError" && !signal.aborted) {
         console.error("Stream Failed:", e)
         // Differentiate Timeout vs Connection Error
         const reason = e.message.includes("Timeout") ? "timed out" : "connection failed";
         triggerFallback(turnId, modelId, context, targetVersionIndex, reason)
      }
    } finally {
      const controllerKey = `${chatId}:${modelId}`
      if (abortControllersRef.current.get(controllerKey)?.signal === signal) {
        abortControllersRef.current.delete(controllerKey)
      }
    }
  }

  const startTurn = async (input: string, models: string[]) => {
    retryCountRef.current = {}
    const newTurn = createNewTurn(input, models)
    let activeChatId = currentChatIdRef.current

    stopOtherStreams(activeChatId)

    setHistory(prev => {
      const newState = [...prev, newTurn]
      if (activeChatId) chatsCacheRef.current.set(activeChatId, newState)

      saveToBackend(activeChatId, newState).then(savedId => {
        if (savedId) {
          activeChatId = savedId
          chatsCacheRef.current.set(savedId, newState)
        }
      }).catch(err => console.warn("Initial save failed", err))

      models.forEach(id => {
        const controller = new AbortController()
        const key = `${activeChatId || 'temp'}:${id}`
        abortControllersRef.current.set(key, controller)
        runStream(newTurn.id, id, input, prev, 0, controller.signal, activeChatId)
      })

      return newState
    })
  }

  const editMessage = useCallback(async (turnId: string, newText: string, models: string[]) => {
    stopStream()
    stopOtherStreams(currentChatIdRef.current)
    const chatId = currentChatIdRef.current
    retryCountRef.current = {}

    setHistory(prev => {
      const idx = prev.findIndex(t => t.id === turnId)
      if (idx === -1) return prev

      const targetTurn = prev[idx]
      const oldVersion = targetTurn.versions[targetTurn.currentVersionIndex]
      const newAgents: Record<string, AgentState> = {}
      models.forEach(m => {
        newAgents[m] = {
            modelId: m, status: "reasoning", rawOutput: "", thinking: "", jsonResult: null,
            metrics: { startTime: Date.now(), endTime: null }
        }
      })

      const newVersion: TurnVersion = {
        id: Date.now().toString(),
        userMessage: newText,
        agents: newAgents,
        downstreamHistory: [],
        createdAt: Date.now()
      }

      const newVersions = [...targetTurn.versions]
      newVersions[targetTurn.currentVersionIndex] = {
          ...oldVersion,
          downstreamHistory: JSON.parse(JSON.stringify(prev.slice(idx + 1)))
      }
      newVersions.push(newVersion)

      const updatedTurn: ChatTurn = {
          ...targetTurn,
          userMessage: newText,
          agents: newAgents,
          versions: newVersions,
          currentVersionIndex: newVersions.length - 1
      }

      const newState = [...prev.slice(0, idx), updatedTurn]
      if (chatId) chatsCacheRef.current.set(chatId, newState)

      saveToBackend(chatId, newState).then(() => {
          const context = newState.slice(0, idx)
          models.forEach(m => {
              const controller = new AbortController()
              const key = `${chatId}:${m}`
              abortControllersRef.current.set(key, controller)
              runStream(turnId, m, newText, context, newVersions.length - 1, controller.signal, chatId)
          })
      })

      return newState
    })
  }, [stopStream, stopOtherStreams, saveToBackend])

  const navigateBranch = useCallback((turnId: string, direction: 'prev' | 'next') => {
    stopOtherStreams(currentChatIdRef.current)

    setHistory(prev => {
        const idx = prev.findIndex(t => t.id === turnId)
        if (idx === -1) return prev

        const turn = prev[idx]
        let newIndex = direction === 'prev' ? turn.currentVersionIndex - 1 : turn.currentVersionIndex + 1
        if (newIndex < 0 || newIndex >= turn.versions.length) return prev

        const currentVersion = turn.versions[turn.currentVersionIndex]
        const updatedVersions = [...turn.versions]
        updatedVersions[turn.currentVersionIndex] = {
            ...currentVersion,
            downstreamHistory: JSON.parse(JSON.stringify(prev.slice(idx + 1)))
        }

        const nextVersion = updatedVersions[newIndex]
        const restoredHistory = nextVersion.downstreamHistory || []

        const updatedTurn: ChatTurn = {
            ...turn,
            userMessage: nextVersion.userMessage,
            agents: JSON.parse(JSON.stringify(nextVersion.agents)),
            versions: updatedVersions,
            currentVersionIndex: newIndex
        }

        const finalHistory = [...prev.slice(0, idx), updatedTurn, ...restoredHistory]

        if (currentChatIdRef.current) {
            chatsCacheRef.current.set(currentChatIdRef.current, finalHistory)
            saveToBackend(currentChatIdRef.current, finalHistory)
        }

        return finalHistory
    })
  }, [stopOtherStreams, saveToBackend])

  const switchAgent = useCallback((turnId: string, oldModelId: string, newModelId: string) => {
    const chatId = currentChatIdRef.current
    const oldKey = `${chatId}:${oldModelId}`

    stopOtherStreams(chatId)
    if (abortControllersRef.current.has(oldKey)) {
        abortControllersRef.current.get(oldKey)?.abort()
        abortControllersRef.current.delete(oldKey)
    }

    setHistory(prev => {
        const idx = prev.findIndex(t => t.id === turnId)
        if (idx === -1) return prev

        const turn = prev[idx]
        const currentVersion = turn.versions[turn.currentVersionIndex]

        const stoppedAgents = JSON.parse(JSON.stringify(turn.agents))
        if(stoppedAgents[oldModelId]) stoppedAgents[oldModelId].status = "stopped"

        const updatedVersions = [...turn.versions]
        updatedVersions[turn.currentVersionIndex] = {
            ...currentVersion,
            agents: stoppedAgents,
            downstreamHistory: JSON.parse(JSON.stringify(prev.slice(idx + 1)))
        }

        const newAgents = { ...turn.agents }
        delete newAgents[oldModelId]
        newAgents[newModelId] = {
            modelId: newModelId,
            status: "reasoning",
            rawOutput: "",
            thinking: "",
            jsonResult: null,
            metrics: { startTime: Date.now(), endTime: null }
        }

        const newVersion: TurnVersion = {
            id: Date.now().toString(),
            userMessage: turn.userMessage,
            agents: newAgents,
            downstreamHistory: [],
            createdAt: Date.now()
        }
        updatedVersions.push(newVersion)

        const updatedTurn: ChatTurn = {
            ...turn,
            agents: newAgents,
            versions: updatedVersions,
            currentVersionIndex: updatedVersions.length - 1
        }

        const newState = [...prev.slice(0, idx), updatedTurn]

        if (chatId) chatsCacheRef.current.set(chatId, newState)

        saveToBackend(chatId, newState).then(() => {
            const context = newState.slice(0, idx)
            const controller = new AbortController()
            const key = `${chatId}:${newModelId}`
            abortControllersRef.current.set(key, controller)
            runStream(turnId, newModelId, turn.userMessage, context, updatedVersions.length - 1, controller.signal, chatId)
        })

        return newState
    })
  }, [stopOtherStreams, saveToBackend])

  const loadChatFromHistory = (id: number, fullHistory: ChatTurn[]) => {
    if (isProcessing) {
        stopStream()
    }

    setTimeout(() => {
        const latestStateHistory = fullHistory.map(turn => ({
            ...turn,
            currentVersionIndex: turn.versions ? turn.versions.length - 1 : 0
        }))

        if (currentChatIdRef.current && historyRef.current.length > 0) {
            chatsCacheRef.current.set(currentChatIdRef.current, historyRef.current)
        }
        
        setCurrentChatId(id)
        localStorage.setItem("goal_cracker_chat_id", id.toString())

        chatsCacheRef.current.set(id, latestStateHistory)
        setHistory(latestStateHistory)
    }, 0)
  }

  const clearChat = () => {
    stopStream() 

    abortControllersRef.current.forEach(c => c.abort())
    abortControllersRef.current.clear()

    if (currentChatIdRef.current) {
        chatsCacheRef.current.set(currentChatIdRef.current, historyRef.current)
    }
    
    setHistory([])
    setCurrentChatId(null)
    clearLocalState()
  }

  const resetChatId = () => {
    setCurrentChatId(null)
    localStorage.removeItem("goal_cracker_chat_id")
  }

  return {
    history,
    isProcessing,
    startTurn,
    setHistory,
    isChatLoaded,
    stopStream,
    switchAgent,
    editMessage,
    navigateBranch,
    loadChatFromHistory,
    clearChat,
    resetChatId
  }
}