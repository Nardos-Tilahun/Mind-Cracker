"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import axios from "axios"
import { authClient } from "@/lib/auth-client"
import { API_URL } from "@/lib/chat/config" // CHANGED: Import shared config

export type HistoryItem = {
  id: number
  goal: string
  model: string
  date: string
  preview: any[]
  thinking?: string | null
  chat_history?: any[]
}

type HistoryContextType = {
  history: HistoryItem[] | null
  isLoading: boolean
  refreshHistory: () => Promise<void>
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined)

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession()
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const refreshHistory = useCallback(async () => {
    if (!session?.user?.id) {
      setHistory([])
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      setIsLoading(true)
      // CHANGED: Use API_URL
      const res = await axios.get(`${API_URL}/history/${session.user.id}`, {
        signal: controller.signal,
        timeout: 10000
      })
      setHistory(res.data)
    } catch (error) {
      if (axios.isCancel(error)) {
        return
      }
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
         console.warn("History fetch timed out.")
      } else {
         console.error("Failed to fetch history", error)
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
      refreshHistory()
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [session?.user?.id, refreshHistory])

  return (
    <HistoryContext.Provider value={{ history, isLoading, refreshHistory }}>
      {children}
    </HistoryContext.Provider>
  )
}

export function useHistory() {
  const context = useContext(HistoryContext)
  if (context === undefined) {
    throw new Error("useHistory must be used within a HistoryProvider")
  }
  return context
}