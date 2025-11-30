import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { authClient } from "@/lib/auth-client"
import { useHistory } from "@/lib/context/history-context"
import { AgentState, ChatTurn, TurnVersion } from "@/types/chat"
import { fetchStream } from "@/lib/chat/api"
import { createNewTurn, parseStreamChunk, updateHistoryWithChunk } from "@/lib/chat/utils"
import { useChatPersistence } from "./use-chat-persistence"
import { toast } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"
import axios from "axios"
import { API_URL } from "@/lib/chat/config"

const LAST_USER_KEY = "goal_breaker_last_known_user"

export function useMultiAgentChat() {
  const { data: session, isPending } = authClient.useSession()
  const { refreshHistory } = useHistory()
  const isMobile = useIsMobile()

  const [history, setHistory] = useState<ChatTurn[]>([])
  
  
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)

  const [activeTurnId, setActiveTurnId] = useState<string | null>(null)
  const [pathTipId, setPathTipId] = useState<string | null>(null)

  
  const currentChatIdRef = useRef<string | null>(null)
  const historyRef = useRef<ChatTurn[]>([])
  
  
  const chatsCacheRef = useRef<Map<string, ChatTurn[]>>(new Map())
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())

  const [isAuthLoaded, setIsAuthLoaded] = useState(false)
  const prevUserIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => { currentChatIdRef.current = currentChatId }, [currentChatId])

  useEffect(() => {
    historyRef.current = history
    if (currentChatId) chatsCacheRef.current.set(currentChatId, history)
  }, [history, currentChatId])

  useEffect(() => {
      if (history.length > 0) {
          const tipExists = pathTipId ? history.some(t => t.id === pathTipId) : false
          if (!pathTipId || !tipExists) {
              setPathTipId(history[history.length - 1].id)
          }
      }
  }, [history, pathTipId])

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

  
  const stopOtherStreams = useCallback((exceptChatId: string | null) => {
    abortControllersRef.current.forEach((controller, key) => {
      const chatIdStr = key.split(":")[0]
      if (chatIdStr !== (exceptChatId || "null")) {
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
      if (chatIdStr === (currentId || "null")) {
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

  const handleFailure = (turnId: string, failedModelId: string, errorMsg: string, currentVersionIdx: number) => {
      if (errorMsg.includes("Daily Limit") || errorMsg.includes("overloaded")) {
          console.warn(`[API Limit] Agent ${failedModelId} halted: ${errorMsg}`);
      } else {
          console.error(`[Failure] Agent ${failedModelId} stopped. Reason: ${errorMsg}`);
      }

      if (errorMsg !== "Empty response") toast.error(`Agent Error: ${errorMsg}`);

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
                 thinking: agents[failedModelId].thinking + (errorMsg !== "Empty response" ? `\n\n[FATAL ERROR]: ${errorMsg}` : ""),
                 jsonResult: { message: `Analysis failed or returned no data.`, steps: [] },
                 metrics: { ...agents[failedModelId].metrics, endTime: Date.now() }
             }
         }
         version.agents = agents
         turn.versions[currentVersionIdx] = version
         turn.agents = agents
         const newState = [...prev]
         newState[idx] = turn
         if (currentChatIdRef.current) {
             chatsCacheRef.current.set(currentChatIdRef.current, newState)
             saveToBackend(currentChatIdRef.current, newState)
         }
         return newState
      })
  }

  const runStream = async (turnId: string, modelId: string, userMsg: string, context: ChatTurn[], targetVersionIndex: number, signal: AbortSignal, chatId: string | null) => {
    try {
      const apiMessages = [
        ...context.map(t => {
          const best = Object.values(t.agents).find(a => a.status === "complete" || a.status === "stopped")
          return [{ role: "user", content: t.userMessage }, { role: "assistant", content: best?.rawOutput || "" }]
        }).flat(),
        { role: "user", content: userMsg }
      ]

      const res = await fetchStream(apiMessages, modelId, session?.user?.id, signal)
      if (!res.ok || !res.body) throw new Error(`Server returned ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""
      let hasStarted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
            setHistory(currentHistory => {
                const idx = currentHistory.findIndex(t => t.id === turnId)
                if (idx === -1) return currentHistory
                const targetVersion = currentHistory[idx].versions[targetVersionIndex]
                if (!targetVersion) return currentHistory
                const currentAgent = targetVersion.agents[modelId]
                if (!currentAgent) return currentHistory

                let finalJson = currentAgent.jsonResult
                if (!finalJson && acc.trim().length > 0) {
                    try {
                        const jsonMatch = acc.match(/\{[\s\S]*\}/)
                        if (jsonMatch) finalJson = JSON.parse(jsonMatch[0])
                    } catch (e) { /* ignore */ }
                }
                if (!finalJson) finalJson = { message: acc.trim(), steps: [] }

                if (!finalJson.message && (!finalJson.steps || finalJson.steps.length===0) && acc.trim().length === 0) {
                    setTimeout(() => handleFailure(turnId, modelId, "Empty response", targetVersionIndex), 0)
                    return currentHistory
                }

                const updatedHistory = updateHistoryWithChunk(currentHistory, turnId, modelId, targetVersionIndex, {
                    status: "complete",
                    jsonResult: finalJson,
                    metrics: { startTime: currentAgent.metrics.startTime, endTime: Date.now() }
                })
                const realId = chatId || currentChatIdRef.current;
                if (realId) chatsCacheRef.current.set(realId, updatedHistory)
                saveToBackend(realId, updatedHistory)
                return updatedHistory
            })
            break
        }
        if (signal.aborted) break
        const chunkText = decoder.decode(value, { stream: true })
        acc += chunkText

        if (!hasStarted && acc.startsWith("Error:")) {
             handleFailure(turnId, modelId, acc, targetVersionIndex)
             return
        }
        hasStarted = true

        setHistory(currentHistory => {
            const idx = currentHistory.findIndex(t => t.id === turnId)
            if (idx === -1) return currentHistory
            const updates = parseStreamChunk(acc, currentHistory[idx].versions[targetVersionIndex].agents[modelId])
            const updatedHistory = updateHistoryWithChunk(currentHistory, turnId, modelId, targetVersionIndex, updates)
            const realId = chatId || currentChatIdRef.current;
            if (currentChatIdRef.current === realId) historyRef.current = updatedHistory
            if (realId) chatsCacheRef.current.set(realId, updatedHistory)
            return updatedHistory
        })
      }
    } catch (e: any) {
      if (e.name !== "AbortError" && !signal.aborted) {
         handleFailure(turnId, modelId, "Network Connection Failed", targetVersionIndex)
      }
    } finally {
      const controllerKey = `${chatId || 'null'}:${modelId}`
      if (abortControllersRef.current.get(controllerKey)?.signal === signal) {
        abortControllersRef.current.delete(controllerKey)
      }
    }
  }

  const startTurn = async (input: string, models: string[], explicitMetadata: any = null) => {
    let metadata = explicitMetadata;

    if (!metadata && activeTurnId) {
        const parentTurn = historyRef.current.find(t => t.id === activeTurnId)
        if (parentTurn) {
            metadata = {
                parentTurnId: activeTurnId,
                parentStepNumber: parentTurn.metadata?.parentStepNumber || "1",
                level: (parentTurn.metadata?.level || 0) + 1,
                isConversational: true
            }
        }
    }

    const newTurn = createNewTurn(input, models, metadata)
    let activeChatId = currentChatIdRef.current

    stopOtherStreams(activeChatId)

    setHistory(prev => {
      const newState = [...prev, newTurn]
      if (activeChatId) chatsCacheRef.current.set(activeChatId, newState)

      saveToBackend(activeChatId, newState).then(savedId => {
        if (savedId) {
          activeChatId = savedId
          currentChatIdRef.current = savedId
          setCurrentChatId(savedId)
          chatsCacheRef.current.set(savedId, newState)
        }
      }).catch(err => console.warn("Initial save failed", err))

      let context: ChatTurn[] = []
      if (metadata && metadata.parentTurnId) {
          let currId = metadata.parentTurnId
          while(currId) {
              const p = prev.find(t => t.id === currId)
              if (p) {
                  context.unshift(p)
                  currId = p.metadata?.parentTurnId
              } else {
                  break
              }
          }
      } else {
          context = prev;
      }

      models.forEach(id => {
        const controller = new AbortController()
        const key = `${activeChatId || 'null'}:${id}`
        abortControllersRef.current.set(key, controller)
        runStream(newTurn.id, id, input, context, 0, controller.signal, activeChatId)
      })

      return newState
    })

    setActiveTurnId(newTurn.id)
    setPathTipId(newTurn.id)
  }

  const editMessage = useCallback(async (turnId: string, newText: string, models: string[]) => {
    stopStream()
    stopOtherStreams(currentChatIdRef.current)
    const chatId = currentChatIdRef.current

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
              const key = `${chatId || 'null'}:${m}`
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
    const oldKey = `${chatId || 'null'}:${oldModelId}`

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
            const key = `${chatId || 'null'}:${newModelId}`
            abortControllersRef.current.set(key, controller)
            runStream(turnId, newModelId, turn.userMessage, context, updatedVersions.length - 1, controller.signal, chatId)
        })

        return newState
    })
  }, [stopOtherStreams, saveToBackend])

  const drillDown = useCallback((parentTurnId: string, stepNumber: string, stepTitle: string, modelId: string, stepDescription?: string) => {
    const existingChild = historyRef.current.find(t =>
        t.metadata?.parentTurnId === parentTurnId &&
        t.metadata?.parentStepNumber === stepNumber
    )

    if (existingChild) {
        setActiveTurnId(existingChild.id)

        const isLeaf = !historyRef.current.some(t => t.metadata?.parentTurnId === existingChild.id)
        if (isLeaf) {
            setPathTipId(existingChild.id)
        } else {
            let tip = existingChild.id
            let next = historyRef.current.find(t => t.metadata?.parentTurnId === tip)
            let limit = 0
            while(next && limit < 50) {
                tip = next.id
                next = historyRef.current.find(t => t.metadata?.parentTurnId === tip)
                limit++
            }
            setPathTipId(tip)
        }

        setTimeout(() => {
            const el = document.getElementById(`turn-${existingChild.id}`)
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
        return
    }

    const parentTurn = historyRef.current.find(t => t.id === parentTurnId)
    const parentLevel = parentTurn?.metadata?.level || 0
    const newLevel = parentLevel + 1

    let prompt = `Break down Step ${stepNumber}: "${stepTitle}" into detailed actionable sub-steps.`;
    if (stepDescription) {
        prompt += `\n\nContext for this step:\n"${stepDescription}"`;
    }

    startTurn(prompt, [modelId], {
        parentTurnId,
        parentStepNumber: stepNumber,
        level: newLevel
    })
  }, [startTurn])

  const scrollToParent = useCallback((parentTurnId: string) => {
      setActiveTurnId(parentTurnId)
      setTimeout(() => {
          const el = document.getElementById(`turn-${parentTurnId}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
  }, [])

  
  const loadChatFromHistory = (id: string, fullHistory: ChatTurn[]) => {
    if (isProcessing) stopStream()
    setTimeout(() => {
        const loadedHistory = fullHistory;
        if (currentChatIdRef.current && historyRef.current.length > 0) {
            chatsCacheRef.current.set(currentChatIdRef.current, historyRef.current)
        }
        setCurrentChatId(id)
        localStorage.setItem("goal_cracker_chat_id", id)
        chatsCacheRef.current.set(id, loadedHistory)
        setHistory(loadedHistory)

        if (loadedHistory.length > 0) {
            const lastId = loadedHistory[loadedHistory.length - 1].id
            setActiveTurnId(lastId)
            setPathTipId(lastId)
        }

        setTimeout(() => {
            const hash = window.location.hash;
            if (hash && hash.startsWith("#turn-")) {
                const targetId = hash.substring(1);
                const element = document.getElementById(targetId);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "start" });
                    element.classList.add("ring-2", "ring-primary", "rounded-lg");
                    setTimeout(() => element.classList.remove("ring-2", "ring-primary", "rounded-lg"), 2000);
                }
            }
        }, 600);
    }, 0)
  }

  const clearChat = useCallback(() => {
    stopStream()
    abortControllersRef.current.forEach(c => c.abort())
    abortControllersRef.current.clear()
    setHistory([])
    setCurrentChatId(null)
    setActiveTurnId(null)
    setPathTipId(null)
    clearLocalState()
  }, [stopStream, clearLocalState])

  const resetChatId = () => {
    setCurrentChatId(null)
    localStorage.removeItem("goal_cracker_chat_id")
  }

  const setViewAndPath = (turnId: string | null) => {
      setActiveTurnId(turnId)
  }

  
  const loadGoalById = useCallback(async (id: string) => {
      try {
          const res = await axios.get(`${API_URL}/goals/${id}`)
          if (res.data && res.data.chat_history) {
              loadChatFromHistory(id, res.data.chat_history)
          }
      } catch (e) {
          console.error("Failed to load goal by ID", e)
          toast.error("Could not find that goal.")
      }
  }, [])

  useEffect(() => {
      if (isPending) return
      const currentUserId = session?.user?.id || null
      const storedLastUser = typeof window !== 'undefined' ? localStorage.getItem(LAST_USER_KEY) : null
      if (!isAuthLoaded) {
          prevUserIdRef.current = currentUserId
          setIsAuthLoaded(true)
          if (currentUserId && storedLastUser && currentUserId !== storedLastUser) {
              clearChat()
              localStorage.setItem(LAST_USER_KEY, currentUserId)
          } else if (!currentUserId && storedLastUser) {
              clearChat()
              localStorage.removeItem(LAST_USER_KEY)
          } else if (currentUserId && !storedLastUser) {
              clearChat()
              localStorage.setItem(LAST_USER_KEY, currentUserId)
          }
          return
      }
      if (currentUserId !== prevUserIdRef.current) {
          clearChat()
          prevUserIdRef.current = currentUserId
          if (currentUserId) {
              localStorage.setItem(LAST_USER_KEY, currentUserId)
          } else {
              localStorage.removeItem(LAST_USER_KEY)
          }
      }
  }, [session, isPending, isAuthLoaded, clearChat])

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
    resetChatId,
    drillDown,
    scrollToParent,
    activeTurnId,
    pathTipId,
    setActiveTurnId: setViewAndPath,
    currentChatId,
    loadGoalById
  }
}