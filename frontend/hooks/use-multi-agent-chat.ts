import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import axios from "axios"
import { authClient } from "@/lib/auth-client"
import { useHistory } from "@/lib/context/history-context"
import { AgentState, ChatTurn, TurnVersion } from "@/types/chat"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const STORAGE_KEY = "goal_cracker_chat_history"
const STORAGE_KEY_ID = "goal_cracker_chat_id"

export function useMultiAgentChat() {
  const { data: session } = authClient.useSession()
  const { refreshHistory } = useHistory()

  const [history, setHistory] = useState<ChatTurn[]>([])
  const [currentChatId, setCurrentChatId] = useState<number | null>(null)
  
  // Refs for state access inside async functions/effects
  const currentChatIdRef = useRef<number | null>(null)
  const historyRef = useRef<ChatTurn[]>([])
  
  // Cache to store the state of all loaded/streaming chats: Map<chatId, ChatTurn[]>
  const chatsCacheRef = useRef<Map<number, ChatTurn[]>>(new Map())

  const [isChatLoaded, setIsChatLoaded] = useState(false)

  // Map key: `${chatId}:${modelId}` -> AbortController
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const creationLockRef = useRef(false)
  const lastTitleGenLengthRef = useRef<number>(0)

  // Sync Refs
  useEffect(() => {
    currentChatIdRef.current = currentChatId
  }, [currentChatId])

  useEffect(() => {
    historyRef.current = history
    if (currentChatId) {
        chatsCacheRef.current.set(currentChatId, history)
    }
  }, [history, currentChatId])

  const isProcessing = useMemo(() => {
    if (history.length === 0) return false
    const lastTurn = history[history.length - 1]
    return Object.values(lastTurn.agents).some(agent =>
      ['waiting', 'reasoning', 'synthesizing'].includes(agent.status)
    )
  }, [history])

  // --- HELPERS ---

  // Abort streams for all chats EXCEPT the one specified. 
  const stopOtherStreams = useCallback((exceptChatId: number | null) => {
      // We iterate over all active controllers
      abortControllersRef.current.forEach((controller, key) => {
          const keyParts = key.split(':') // Key format: "chatId:modelId"
          const chatIdStr = keyParts[0]
          
          // Convert key's chat ID to number (or null if it's the literal string "null")
          const ctrlChatId = chatIdStr === "null" ? null : Number(chatIdStr)

          // If this controller belongs to a different chat ID, abort it
          if (ctrlChatId !== exceptChatId) {
              controller.abort()
              abortControllersRef.current.delete(key)
          }
      })
  }, [])

  // Stop ALL streams (e.g. logout, manual hard stop, or New Chat)
  const stopEverything = useCallback(() => {
      abortControllersRef.current.forEach(c => c.abort())
      abortControllersRef.current.clear()
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
      }
      creationLockRef.current = false
  }, [])

  // --- PERSISTENCE ---

  const saveToBackend = useCallback(async (chatId: number | null, chatData: ChatTurn[]) => {
    if (!session?.user?.id || chatData.length === 0) return null

    try {
        let title = chatData[0].userMessage.slice(0, 60) || "New Goal"
        const lastTurn = chatData[chatData.length - 1]
        const agentKey = Object.keys(lastTurn.agents)[0]
        const preview = lastTurn.agents[agentKey]?.jsonResult?.steps || []
        
        let savedId = chatId

        if (chatId) {
            // UPDATE (PUT)
            await axios.put(`${API_URL}/goals/${chatId}`, {
                title,
                chat_history: chatData,
                preview
            })
            refreshHistory()
        } else {
            // CREATE (POST)
            if (creationLockRef.current) return null
            creationLockRef.current = true

            try {
                const res = await axios.post(`${API_URL}/goals/${session.user.id}`, {
                    title,
                    chat_history: chatData,
                    preview
                })
                savedId = res.data.id
                
                // Update cache with new ID immediately
                chatsCacheRef.current.set(savedId!, chatData)

                // If we are still on the "new chat" screen (null ID), update the UI to the new ID
                if (currentChatIdRef.current === null) {
                    setCurrentChatId(savedId)
                    localStorage.setItem(STORAGE_KEY_ID, savedId!.toString())
                }
                
                refreshHistory()
            } finally {
                creationLockRef.current = false
            }
        }
        return savedId
    } catch (e) {
        console.error("Auto-save failed", e)
        creationLockRef.current = false
        return null
    }
  }, [session?.user?.id, refreshHistory])

  // --- BACKGROUND SYNC (For Active Chat) ---
  useEffect(() => {
    if (!isChatLoaded) return

    if (history.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    if (currentChatId) localStorage.setItem(STORAGE_KEY_ID, currentChatId.toString())

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    
    saveTimeoutRef.current = setTimeout(() => {
        // Only auto-save if we have content. 
        if (history.length > 0 && session?.user?.id) {
            saveToBackend(currentChatId, history)
        }
    }, 2000)

    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [history, currentChatId, session?.user?.id, isChatLoaded, saveToBackend])

  // --- LOAD & CLEAR ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedHistory = localStorage.getItem(STORAGE_KEY)
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory)
          if (Array.isArray(parsed)) {
              setHistory(parsed)
              lastTitleGenLengthRef.current = parsed.length
          }
        } catch (e) { console.error(e) }
      }
      const savedId = localStorage.getItem(STORAGE_KEY_ID)
      if (savedId) {
          const id = Number(savedId)
          setCurrentChatId(id)
          if(history.length > 0) chatsCacheRef.current.set(id, history)
      }
      setIsChatLoaded(true)
    }
  }, [])

  const loadChatFromHistory = (id: number, fullHistory: ChatTurn[]) => {
      // 1. Save current chat state to cache before switching
      if (currentChatIdRef.current && historyRef.current.length > 0) {
          chatsCacheRef.current.set(currentChatIdRef.current, historyRef.current)
      }

      // CRITICAL: DO NOT STOP STREAMS HERE.
      // This allows background generation to continue when simply navigating history.

      // 2. Switch ID
      setCurrentChatId(id)
      localStorage.setItem(STORAGE_KEY_ID, id.toString())

      // 3. Load Data: Prefer Cache (latest stream state) -> Then API Data
      const cached = chatsCacheRef.current.get(id)
      if (cached) {
          setHistory(cached)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
      } else {
          setHistory(fullHistory)
          chatsCacheRef.current.set(id, fullHistory) 
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fullHistory))
      }
      
      lastTitleGenLengthRef.current = fullHistory.length
  }

  const clearChat = () => {
      // CRITICAL: Terminate all existing reasoning when clicking New Chat
      stopEverything()

      // Save previous state to cache
      if (currentChatIdRef.current) {
          chatsCacheRef.current.set(currentChatIdRef.current, historyRef.current)
      }

      // Reset State
      setHistory([])
      setCurrentChatId(null)
      lastTitleGenLengthRef.current = 0

      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_KEY_ID)
  }

  const resetChatId = () => {
      setCurrentChatId(null)
      creationLockRef.current = false
      lastTitleGenLengthRef.current = 0
      localStorage.removeItem(STORAGE_KEY_ID)
  }

  // --- STREAMING LOGIC ---

  const stopStream = useCallback(() => {
    const currentId = currentChatIdRef.current
    
    // Abort controllers for CURRENT chat only
    abortControllersRef.current.forEach((controller, key) => {
        const keyParts = key.split(':')
        const chatIdStr = keyParts[0]
        const ctrlChatId = chatIdStr === "null" ? null : Number(chatIdStr)
        
        if (ctrlChatId === currentId) {
            controller.abort()
            abortControllersRef.current.delete(key)
        }
    })

    // Update state for active chat
    setHistory(prev => {
        if(prev.length === 0) return prev
        const lastTurnIndex = prev.length - 1
        const lastTurn = { ...prev[lastTurnIndex] }
        const updatedAgents = { ...lastTurn.agents }
        let hasUpdates = false

        Object.keys(updatedAgents).forEach(key => {
            const agent = updatedAgents[key]
            if (['reasoning', 'synthesizing', 'waiting'].includes(agent.status)) {
                updatedAgents[key] = { 
                    ...agent, 
                    status: 'stopped', 
                    thinking: agent.thinking + "\n[Stopped]", 
                    metrics: { ...agent.metrics, endTime: Date.now() } 
                } as AgentState
                hasUpdates = true
            }
        })

        if (!hasUpdates) return prev

        const updatedVersions = [...lastTurn.versions]
        if (updatedVersions[lastTurn.currentVersionIndex]) {
            updatedVersions[lastTurn.currentVersionIndex] = {
                ...updatedVersions[lastTurn.currentVersionIndex],
                agents: updatedAgents
            }
        }

        const newHistory = [...prev]
        newHistory[lastTurnIndex] = { ...lastTurn, agents: updatedAgents, versions: updatedVersions }

        saveToBackend(currentId, newHistory)
        if (currentId) chatsCacheRef.current.set(currentId, newHistory)
        
        return newHistory
    })
  }, [saveToBackend])

  const runStream = async (turnId: string, modelId: string, userMsg: string, context: ChatTurn[], targetVersionIndex: number, signal: AbortSignal, chatId: number | null) => {
    try {
      const messages = [
        ...context.map((t) => {
            const best = Object.values(t.agents).find(a => a.status === 'complete' || a.status === 'stopped')
            return [{ role: "user", content: t.userMessage }, { role: "assistant", content: best?.rawOutput || "" }]
        }).flat(),
        { role: "user", content: userMsg }
      ]

      const res = await fetch(`${API_URL}/stream-goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, model: modelId, user_id: session?.user?.id }),
        signal
      })

      if (!res.body) throw new Error("No Body")
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done || signal.aborted) break
        const chunk = decoder.decode(value, { stream: true })
        acc += chunk

        const updateLogic = (prevHistory: ChatTurn[]): ChatTurn[] => {
            const idx = prevHistory.findIndex(t => t.id === turnId)
            if (idx === -1) return prevHistory 

            const turn = { ...prevHistory[idx] }
            const versionToUpdate = turn.versions[targetVersionIndex]
            if (!versionToUpdate || !versionToUpdate.agents[modelId]) return prevHistory
            
            const currentAgent = versionToUpdate.agents[modelId]
            if (currentAgent.metrics.endTime || currentAgent.status === 'stopped' || currentAgent.status === 'complete') return prevHistory

            let status: AgentState['status'] = currentAgent.status
            let { thinking, jsonResult } = currentAgent

            if (acc.startsWith("Error:")) { status = 'error'; thinking = acc.replace("Error:", "") }
            else {
                const jsonStartIndex = acc.indexOf("{")
                if (jsonStartIndex === -1) { status = 'reasoning'; thinking = acc.replace(/<think>|<\/think>/g, "").trim() }
                else {
                    if (status !== 'error') status = 'synthesizing'
                    thinking = acc.substring(0, jsonStartIndex).replace(/<think>|<\/think>/g, "").trim()
                    const rawJson = acc.substring(jsonStartIndex).replace(/```json/g, "").replace(/```/g, "")
                    if (rawJson.includes("}")) {
                        try {
                            const lastBraceIndex = rawJson.lastIndexOf("}")
                            if(lastBraceIndex !== -1) {
                                const candidate = rawJson.substring(0, lastBraceIndex + 1)
                                const parsed = JSON.parse(candidate)
                                if(parsed.steps || parsed.message) { 
                                    jsonResult = parsed
                                    status = 'complete' 
                                }
                            }
                        } catch {}
                    }
                }
            }
            let newMetrics = { ...currentAgent.metrics }
            if ((status === 'complete' || status === 'error') && !newMetrics.endTime) newMetrics.endTime = Date.now()

            const updatedAgents = { ...versionToUpdate.agents, [modelId]: { ...currentAgent, rawOutput: acc, status, thinking, jsonResult, metrics: newMetrics } }
            const updatedVersions = [...turn.versions]
            updatedVersions[targetVersionIndex] = { ...updatedVersions[targetVersionIndex], agents: updatedAgents }
            turn.versions = updatedVersions
            if (turn.currentVersionIndex === targetVersionIndex) turn.agents = updatedAgents
            
            const newHistory = [...prevHistory]
            newHistory[idx] = turn
            return newHistory
        }

        // 1. Determine which history to update (Cache or Current Ref)
        let activeHistoryForThisChat = chatId ? chatsCacheRef.current.get(chatId) : null
        if (!activeHistoryForThisChat && currentChatIdRef.current === chatId) {
            activeHistoryForThisChat = historyRef.current
        }
        
        if (activeHistoryForThisChat) {
            const updatedHistory = updateLogic(activeHistoryForThisChat)
            
            // Update Cache
            if (chatId) chatsCacheRef.current.set(chatId, updatedHistory)
            
            // If visible, Update State
            if (currentChatIdRef.current === chatId) {
                setHistory(updatedHistory)
            }

            // Background Save triggers occasionally or on completion
            if (acc.length % 100 === 0 || acc.includes("}")) {
                 saveToBackend(chatId, updatedHistory)
            }
        }
      }
    } catch (e: any) {
        // Check for Abort (Explicit Action Interruption)
        // If signal is aborted, it means we explicitly stopped it (either stopEverything or stopOtherStreams)
        if (e.name === 'AbortError' || signal.aborted) {
            
            // Helper to mark agent as stopped in a history array
            const markAsStopped = (prevHistory: ChatTurn[]) => {
                const idx = prevHistory.findIndex(t => t.id === turnId)
                if (idx === -1) return prevHistory
                
                const turn = { ...prevHistory[idx] }
                const version = turn.versions[targetVersionIndex]
                const agent = version?.agents[modelId]
                
                // Only stop if it was running
                if (agent && ['reasoning', 'synthesizing', 'waiting'].includes(agent.status)) {
                    const updatedAgents = { 
                        ...version.agents, 
                        [modelId]: { 
                            ...agent, 
                            status: 'stopped', 
                            thinking: agent.thinking + "\n[Interrupted]", 
                            metrics: { ...agent.metrics, endTime: Date.now() } 
                        } as AgentState
                    }
                    const updatedVersions = [...turn.versions]
                    updatedVersions[targetVersionIndex] = { ...version, agents: updatedAgents }
                    turn.versions = updatedVersions
                    if (turn.currentVersionIndex === targetVersionIndex) turn.agents = updatedAgents
                    
                    const newH = [...prevHistory]
                    newH[idx] = turn
                    return newH
                }
                return prevHistory
            }

            // Apply 'stopped' status to cache and/or active view
            let hist = chatId ? chatsCacheRef.current.get(chatId) : null
            if (!hist && currentChatIdRef.current === chatId) hist = historyRef.current
            
            if (hist) {
                const stoppedHist = markAsStopped(hist)
                if (chatId) chatsCacheRef.current.set(chatId, stoppedHist)
                if (currentChatIdRef.current === chatId) setHistory(stoppedHist)
                saveToBackend(chatId, stoppedHist)
            }
        }
    } finally {
        const controllerKey = `${chatId}:${modelId}`
        // Clean up controller ref
        if (abortControllersRef.current.get(controllerKey)?.signal === signal) {
            abortControllersRef.current.delete(controllerKey)
        }
    }
  }

  // --- ACTIONS ---

  const navigateBranch = useCallback((turnId: string, direction: 'prev' | 'next') => {
    // ACTION TAKEN: Stop streams in ALL OTHER chats (Requirement: single active generation on user action)
    stopOtherStreams(currentChatIdRef.current)

    setHistory(prev => {
      const turnIndex = prev.findIndex(t => t.id === turnId)
      if (turnIndex === -1) return prev
      const newHistory = [...prev]
      const targetTurn = { ...newHistory[turnIndex] }
      const leavingVersionIndex = targetTurn.currentVersionIndex
      const leavingVersion = targetTurn.versions[leavingVersionIndex]
      const updatedLeavingVersion = { ...leavingVersion, userMessage: targetTurn.userMessage, agents: JSON.parse(JSON.stringify(targetTurn.agents)), downstreamHistory: JSON.parse(JSON.stringify(newHistory.slice(turnIndex + 1))) }
      const newVersions = [...targetTurn.versions]
      newVersions[leavingVersionIndex] = updatedLeavingVersion

      let newIndex = direction === 'prev' ? leavingVersionIndex - 1 : leavingVersionIndex + 1
      if (newIndex < 0) newIndex = 0
      if (newIndex >= newVersions.length) newIndex = newVersions.length - 1
      if (newIndex === leavingVersionIndex) return prev

      const enteringVersion = newVersions[newIndex]
      newHistory[turnIndex] = { ...targetTurn, userMessage: enteringVersion.userMessage, agents: JSON.parse(JSON.stringify(enteringVersion.agents)), versions: newVersions, currentVersionIndex: newIndex }
      const restoredFuture = JSON.parse(JSON.stringify(enteringVersion.downstreamHistory || []))
      const finalHistory = [...newHistory.slice(0, turnIndex + 1), ...restoredFuture]
      
      saveToBackend(currentChatIdRef.current, finalHistory)
      if (currentChatIdRef.current) chatsCacheRef.current.set(currentChatIdRef.current, finalHistory)
      
      return finalHistory
    })
  }, [saveToBackend, stopOtherStreams])

  const editMessage = useCallback(async (turnId: string, newText: string, models: string[]) => {
    // Stop current stream (re-generating)
    stopStream() 
    // ACTION TAKEN: Stop streams in ALL OTHER chats
    stopOtherStreams(currentChatIdRef.current)

    let newState: ChatTurn[] = []
    const chatId = currentChatIdRef.current

    setHistory(prev => {
        const turnIndex = prev.findIndex(t => t.id === turnId)
        if (turnIndex === -1) return prev
        const newHistory = [...prev]
        const targetTurn = { ...newHistory[turnIndex] }
        const currentVerIndex = targetTurn.currentVersionIndex
        const currentVersion = targetTurn.versions[currentVerIndex]
        const updatedOldVersion = { ...currentVersion, agents: JSON.parse(JSON.stringify(targetTurn.agents)), downstreamHistory: JSON.parse(JSON.stringify(newHistory.slice(turnIndex + 1))) }
        const newVersions = [...targetTurn.versions]
        newVersions[currentVerIndex] = updatedOldVersion
        const newAgentStates: Record<string, AgentState> = {}
        models.forEach(m => { newAgentStates[m] = { modelId: m, status: 'reasoning', rawOutput: "", thinking: "", jsonResult: null, metrics: { startTime: Date.now(), endTime: null } } })
        const newVersion: TurnVersion = { id: Date.now().toString(), userMessage: newText, agents: newAgentStates, downstreamHistory: [], createdAt: Date.now() }
        newVersions.push(newVersion)
        newHistory[turnIndex] = { ...targetTurn, userMessage: newText, agents: newAgentStates, versions: newVersions, currentVersionIndex: newVersions.length - 1 }
        newState = newHistory.slice(0, turnIndex + 1)
        
        if (chatId) chatsCacheRef.current.set(chatId, newState)
        return newState
    })

    saveToBackend(chatId, newState)

    setTimeout(() => {
        const idx = newState.findIndex(t => t.id === turnId)
        if (idx === -1) return
        const context = newState.slice(0, idx)
        const verIndex = newState[idx].currentVersionIndex
        models.forEach(m => {
            const controller = new AbortController()
            const key = `${chatId}:${m}`
            abortControllersRef.current.set(key, controller)
            runStream(turnId, m, newText, context, verIndex, controller.signal, chatId)
        })
    }, 0)
  }, [stopStream, saveToBackend, stopOtherStreams])

  const switchAgent = useCallback((turnId: string, oldModelId: string, newModelId: string) => {
    const chatId = currentChatIdRef.current
    const oldKey = `${chatId}:${oldModelId}`
    
    // ACTION TAKEN: Stop active stream of this agent AND all other chats
    stopOtherStreams(chatId)

    if (abortControllersRef.current.has(oldKey)) {
        abortControllersRef.current.get(oldKey)?.abort()
        abortControllersRef.current.delete(oldKey)
    }

    let newState: ChatTurn[] = []

    setHistory(prev => {
      const turnIndex = prev.findIndex(t => t.id === turnId)
      if (turnIndex === -1) return prev
      const newHistory = [...prev] 
      const targetTurn = { ...newHistory[turnIndex] }
      const currentVerIndex = targetTurn.currentVersionIndex
      const currentVersion = targetTurn.versions[currentVerIndex]

      const agentsSnapshot = JSON.parse(JSON.stringify(targetTurn.agents))
      if (agentsSnapshot[oldModelId]) agentsSnapshot[oldModelId].status = 'stopped'

      const updatedOldVersion = {
          ...currentVersion,
          agents: agentsSnapshot,
          downstreamHistory: JSON.parse(JSON.stringify(newHistory.slice(turnIndex + 1)))
      }
      const newVersions = [...targetTurn.versions]
      newVersions[currentVerIndex] = updatedOldVersion

      const newAgents = { ...targetTurn.agents }
      delete newAgents[oldModelId]
      newAgents[newModelId] = {
          modelId: newModelId,
          status: 'reasoning',
          rawOutput: "",
          thinking: "",
          jsonResult: null,
          metrics: { startTime: Date.now(), endTime: null }
      }

      const newVersion: TurnVersion = {
          id: Date.now().toString(),
          userMessage: targetTurn.userMessage,
          agents: newAgents,
          downstreamHistory: [],
          createdAt: Date.now()
      }
      newVersions.push(newVersion)

      newHistory[turnIndex] = {
          ...targetTurn,
          agents: newAgents,
          versions: newVersions,
          currentVersionIndex: newVersions.length - 1
      }

      newState = newHistory.slice(0, turnIndex + 1)
      if (chatId) chatsCacheRef.current.set(chatId, newState)
      return newState
    })

    saveToBackend(chatId, newState)

    setTimeout(() => {
        const turnIndex = newState.findIndex(t => t.id === turnId)
        if (turnIndex === -1) return
        const context = newState.slice(0, turnIndex)
        const turn = newState[turnIndex]
        const controller = new AbortController()
        const key = `${chatId}:${newModelId}`
        abortControllersRef.current.set(key, controller)
        runStream(turnId, newModelId, turn.userMessage, context, turn.currentVersionIndex, controller.signal, chatId)
    }, 0)

  }, [saveToBackend, stopOtherStreams])

  const startTurn = async (input: string, models: string[]) => {
    const turnId = Date.now().toString()
    const agents: Record<string, AgentState> = {}
    models.forEach(id => { agents[id] = { modelId: id, status: 'reasoning', rawOutput: "", thinking: "", jsonResult: null, metrics: { startTime: Date.now(), endTime: null } } })
    const initialVersion: TurnVersion = { id: Date.now().toString() + "-v1", userMessage: input, agents: JSON.parse(JSON.stringify(agents)), downstreamHistory: [], createdAt: Date.now() }
    const newTurn: ChatTurn = { id: turnId, userMessage: input, agents, versions: [initialVersion], currentVersionIndex: 0 }

    let activeChatId = currentChatIdRef.current
    
    // ACTION TAKEN: Stop streams in ALL OTHER chats (because we are starting generation in THIS chat)
    // If activeChatId is null (New Chat), this stops all existing ID-based streams.
    stopOtherStreams(activeChatId)

    setHistory(prev => {
        const newState = [...prev, newTurn]
        
        if (activeChatId) chatsCacheRef.current.set(activeChatId, newState)
        
        // Use the Promise returned by saveToBackend to get the valid ID for streams
        saveToBackend(activeChatId, newState).then((savedId) => {
            if (savedId) {
                activeChatId = savedId // Ensure we use the definitive ID from backend
                
                models.forEach(id => {
                    const controller = new AbortController()
                    const key = `${activeChatId}:${id}`
                    abortControllersRef.current.set(key, controller)
                    runStream(turnId, id, input, prev, 0, controller.signal, activeChatId)
                })
            }
        })

        return newState
    })
  }

  return {
      history, isProcessing, startTurn, runStream, setHistory, isChatLoaded,
      stopStream, switchAgent, editMessage, navigateBranch, loadChatFromHistory, clearChat, resetChatId
  }
}