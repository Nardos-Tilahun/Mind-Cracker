"use client"

import React, { createContext, useContext, useState, useCallback, useEffect } from "react"
import axios from "axios"
import { authClient } from "@/lib/auth-client"

// Updated Type Definition to match new backend
export type HistoryItem = {
  id: number
  goal: string
  model: string
  date: string
  preview: any[]
  thinking?: string | null
  chat_history?: any[] // Full tree
}

type HistoryContextType = {
  history: HistoryItem[] | null
  isLoading: boolean
  refreshHistory: () => Promise<void>
}

const HistoryContext = createContext<HistoryContextType | undefined>(undefined)

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = authClient.useSession()
  const [history, setHistory] = useState<HistoryItem[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const refreshHistory = useCallback(async () => {
    if (!session?.user?.id) {
        setHistory([])
        return
    }

    try {
      const res = await axios.get(`${API_URL}/history/${session.user.id}`)
      setHistory(res.data)
    } catch (error) {
      console.error("Failed to fetch history", error)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (session?.user?.id) {
        setIsLoading(true)
        refreshHistory().finally(() => setIsLoading(false))
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