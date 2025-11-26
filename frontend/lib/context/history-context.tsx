"use client"

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react"
import axios, { isCancel } from "axios"
import { authClient } from "@/lib/auth-client"
import { API_URL } from "@/lib/chat/config"

// Define the shape of a history item based on backend response
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
  
  // Keep track of the active request to cancel it if necessary
  const abortControllerRef = useRef<AbortController | null>(null)

  const refreshHistory = useCallback(async () => {
    if (!session?.user?.id) {
      setHistory([])
      return
    }

    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new controller
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      setIsLoading(true)
      const res = await axios.get(`${API_URL}/history/${session.user.id}`, {
        signal: controller.signal,
        // Optional: Set a reasonable timeout (e.g. 10s) to prevent hanging
        timeout: 10000 
      })
      setHistory(res.data)
    } catch (error) {
      // Ignore errors caused by cancellation
      if (axios.isCancel(error)) {
        return
      }
      // Log other errors
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
         console.warn("History fetch timed out.")
      } else {
         console.error("Failed to fetch history", error)
      }
    } finally {
      // Only turn off loading if this was the active request
      if (abortControllerRef.current === controller) {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [session?.user?.id])

  // Initial fetch when session becomes available
  useEffect(() => {
    if (session?.user?.id) {
      refreshHistory()
    }
    
    // Cleanup on unmount
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