import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { authClient } from "@/lib/auth-client"
import { useHistory } from "@/lib/context/history-context"
import { AgentState, ChatTurn, TurnVersion } from "@/types/chat"
import { fetchStream } from "@/lib/chat/api"
import { createNewTurn, parseStreamChunk, updateHistoryWithChunk, stopAgentInHistory } from "@/lib/chat/utils"
import { useChatPersistence } from "./use-chat-persistence"
import { toast } from "sonner"

// --- SAFE FALLBACKS (UPDATED LIST) ---
// If the user's selected model fails, we iterate through these.
const FALLBACK_CANDIDATES = [
    "google/gemini-2.0-flash-lite-preview-02-05:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-exp:free",
    "deepseek/deepseek-r1-distill-llama-70b:free",
    "qwen/qwen-2.5-coder-32b-instruct:free",
    "nvidia/llama-3.1-nemotron-70b-instruct:free"
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

  // --- FALLBACK LOGIC ---
  const triggerFallback = useCallback((turnId: string, failedModelId: string, context: ChatTurn[], currentVersionIdx: number, reason: string = "failed") => {
      console.log(`[Fallback] Triggered for ${failedModelId}. Reason: ${reason}`);

      const chatId = currentChatIdRef.current
      constqhKey = `${turnId}:${currentVersionIdx}`
      const attempts = retryCountRef.current[qhKey] || 0

      // If we've tried too many times, give up
      if (attempts >= FALLBACK_CANDIDATES.length + 1) {
          console.error("[Fallback] All candidates exhausted.");
          toast.error("All AI agents failed. Servers might be overloaded.")
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
                     thinking: agents[failedModelId].thinking + `\n\n[SYSTEM]: ${reason}.\nExhausted all free backups. Try again later.`,
                     jsonResult: { message: "System Exhausted: Please try again later.", steps: [] },
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
          return
      }

      // Pick next model
      let nextModelId = FALLBACK_CANDIDATES[attempts]
      
      // If the fallback candidate IS the one that just failed, skip to the next
      if (nextModelId === failedModelId) {
          retryCountRef.current[qhKey] = attempts + 1
          nextModelId = FALLBACK_CANDIDATES[attempts + 1]
          if (!nextModelId) {
             // If we ran out after skipping
             retryCountRef.current[qhKey] = 999 
             triggerFallback(turnId, failedModelId, context, currentVersionIdx, reason)
             return
          }
      }

      retryCountRef.current[qhKey] = (retryCountRef.current[qhKey] || 0) + 1

      console.log(`[Fallback] Switching to next candidate: ${nextModelId}`);
      toast.warning(`Agent ${failedModelId} ${reason}. Switching to ${nextModelId}...`, {
          duration: 4000
      })

      setHistory(prev => {
          const idx = prev.findIndex(t => t.id === turnId)
          if (idx === -1) return prev

          const turn = { ...prev[idx] }
          const version = { ...turn.versions[currentVersionIdx] }
          const agents = { ...version.agents }

          // Remove the failed one
          delete agents[failedModelId]

          // Add the new one
          agents[nextModelId] = {
              modelId: nextModelId,
              status: "retrying" as any,
              rawOutput: "",
              thinking: `Previous agent (${failedModelId}) ${reason}.\n\nHanding off to ${nextModelId}...`,
              jsonR