import { useState, useEffect, useRef, useCallback } from "react"
import { ChatTurn } from "@/types/chat"
import { saveGoalToBackend, updateGoalInBackend } from "@/lib/chat/api"
import { STORAGE_KEY, STORAGE_KEY_ID } from "@/lib/chat/config"

export function useChatPersistence(
  history: ChatTurn[],
  currentChatId: string | null, // CHANGED: string | null
  setCurrentChatId: (id: string | null) => void, // CHANGED: string | null
  setHistory: (h: ChatTurn[]) => void,
  chatsCacheRef: React.RefObject<Map<string, ChatTurn[]>>, 
  userId?: string,
  refreshHistory?: () => void
) {
  const [isChatLoaded, setIsChatLoaded] = useState(false)
  const creationLockRef = useRef(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const saveToBackend = useCallback(async (chatId: string | null, chatData: ChatTurn[]) => {
    if (!userId || chatData.length === 0) return null

    try {
      const title = chatData[0].userMessage.slice(0, 60) || "New Goal"
      const lastTurn = chatData[chatData.length - 1]
      const agentKey = Object.keys(lastTurn.agents)[0]
      const preview = lastTurn.agents[agentKey]?.jsonResult?.steps || []

      if (chatId) {
        await updateGoalInBackend(chatId, title, chatData, preview)
        refreshHistory?.()
        return chatId
      } else {
        if (creationLockRef.current) return null
        creationLockRef.current = true
        try {
          const newId = await saveGoalToBackend(userId, title, chatData, preview)
          chatsCacheRef.current.set(newId, chatData)
          if (localStorage.getItem(STORAGE_KEY_ID) === null) {
             setCurrentChatId(newId)
             localStorage.setItem(STORAGE_KEY_ID, newId)
          }
          refreshHistory?.()
          return newId
        } finally {
          creationLockRef.current = false
        }
      }
    } catch (e) {
      console.error("Autosave failed", e)
      creationLockRef.current = false
      return null
    }
  }, [userId, refreshHistory, setCurrentChatId, chatsCacheRef])

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedHistory = localStorage.getItem(STORAGE_KEY)
      const savedId = localStorage.getItem(STORAGE_KEY_ID)

      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory)
          if (Array.isArray(parsed)) setHistory(parsed)
        } catch {}
      }

      if (savedId) {
        setCurrentChatId(savedId)
      }
      setIsChatLoaded(true)
    }
  }, [setHistory, setCurrentChatId])

  useEffect(() => {
    if (!isChatLoaded) return

    if (history.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    if (currentChatId) localStorage.setItem(STORAGE_KEY_ID, currentChatId)

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(() => {
      if (history.length > 0 && userId) {
        saveToBackend(currentChatId, history)
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [history, currentChatId, userId, isChatLoaded, saveToBackend])

  const clearLocalState = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_KEY_ID)
    creationLockRef.current = false
  }

  return { saveToBackend, clearLocalState, isChatLoaded }
}