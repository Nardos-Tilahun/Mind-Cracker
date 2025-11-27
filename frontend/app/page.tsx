"use client"

import { useState, useRef, useEffect } from "react"
import axios from "axios"
import { SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ChatStream } from "@/components/dashboard/chat-stream"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ChatInput } from "@/components/features/chat/chat-input"
import { useMultiAgentChat } from "@/hooks/use-multi-agent-chat"
import { Model, ChatTurn } from "@/types/chat"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export default function Dashboard() {
  const {
    history,
    isProcessing,
    startTurn,
    stopStream,
    switchAgent,
    editMessage,
    navigateBranch,
    loadChatFromHistory,
    clearChat,
    resetChatId
  } = useMultiAgentChat()

  const [input, setInput] = useState("")
  const [models, setModels] = useState<Model[]>([])
  // CHANGED: Manage single string ID instead of array
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [sloganKey, setSloganKey] = useState(0)

  const lastTurnRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastScrollKey = useRef<string>("")

  const [hasInteracted, setHasInteracted] = useState(false)
  const isCenterMode = history.length === 0 && !hasInteracted

  useEffect(() => {
    axios.get(`${API_URL}/models`).then((res) => {
        setModels(res.data)
        // Auto-select the first model if none selected
        if (res.data.length > 0 && !selectedModelId) {
          setSelectedModelId(res.data[0].id)
        }
    }).catch(console.error)
  }, [])

  // SCROLL LOGIC
  useEffect(() => {
    if (history.length > 0) {
        setHasInteracted(true)
        const lastTurn = history[history.length - 1]
        const currentKey = `${lastTurn.id}-${lastTurn.currentVersionIndex}`

        if (currentKey !== lastScrollKey.current) {
            lastScrollKey.current = currentKey
            setTimeout(() => {
                lastTurnRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start" 
                })
            }, 150)
        }
    }
  }, [history])

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [])

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 10)

  const handleSubmit = (e: any) => {
    e.preventDefault()
    if (isProcessing) return toast.warning("Please wait for agents to finish.")
    if (!input.trim() || !selectedModelId) return
    setHasInteracted(true)
    // Pass single model as array to keep backend compatibility
    startTurn(input, [selectedModelId])
    setInput("")
    focusInput()
  }

  const handleExampleClick = (text: string) => {
      if (!selectedModelId) {
          toast.error("No models available.")
          return
      }
      setInput(text)
      setHasInteracted(true)
      startTurn(text, [selectedModelId])
      setInput("")
      focusInput()
  }

  const handleHistorySelect = (item: any) => {
    setHasInteracted(true)
    if (item.chat_history && Array.isArray(item.chat_history)) {
        loadChatFromHistory(item.id, item.chat_history)
    } else {
        const restoredTurn: ChatTurn = {
            id: `history-${item.id}`,
            userMessage: item.goal,
            agents: {
                [item.model]: {
                    modelId: item.model,
                    status: "complete",
                    rawOutput: "",
                    thinking: item.thinking || "Restored.",
                    jsonResult: { steps: item.preview },
                    metrics: { startTime: 0, endTime: 0 },
                }
            },
            versions: [{
                id: `history-${item.id}-v1`,
                userMessage: item.goal,
                agents: {},
                downstreamHistory: [],
                createdAt: Date.now()
            }],
            currentVersionIndex: 0
        }
        loadChatFromHistory(item.id, [restoredTurn])
    }
    focusInput()
  }

  const handleNewChat = () => {
    clearChat()
    setInput("")
    setHasInteracted(false)
    setSloganKey(prev => prev + 1)
    focusInput()
  }

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id)
    focusInput()
  }

  const handleSwitchAgent = (turnId: string, oldModelId: string, newModelId: string) => {
    // If switching the active agent, update global selection too
    if (selectedModelId === oldModelId) {
        setSelectedModelId(newModelId)
    }
    switchAgent(turnId, oldModelId, newModelId)
    focusInput()
  }

  const handleEditMessage = (turnId: string, newText: string, models: string[]) => {
    editMessage(turnId, newText, models)
    focusInput()
  }

  const handleNavigateBranch = (turnId: string, direction: 'prev' | 'next') => {
    navigateBranch(turnId, direction)
    focusInput()
  }

  return (
    <>
      <DashboardHeader
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={handleSelectModel}
        onNewChat={handleNewChat}
      />

      <AppSidebar
        onSelectHistory={handleHistorySelect}
        onNewChat={handleNewChat}
        onClearHistory={resetChatId}
        className="top-16! h-[calc(100svh-4rem)]! z-40"
      />

      <SidebarInset className="mt-16 h-[calc(100svh-4rem)] overflow-hidden bg-linear-to-b from-background to-secondary/20 flex flex-col relative w-full">

        <div
            className={cn(
                "absolute left-0 right-0 flex flex-col items-center p-4 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] z-0",
                !isCenterMode
                    ? "opacity-0 -translate-y-20 pointer-events-none top-0"
                    : "opacity-100 top-0 pt-8 justify-start z-10"
            )}
        >
           <EmptyState key={sloganKey} onExampleClick={handleExampleClick} />
        </div>

        <div
            className={cn(
                "flex-1 overflow-y-auto p-4 custom-scrollbar w-full max-w-5xl mx-auto space-y-10 scroll-smooth transition-opacity duration-500",
                !isCenterMode ? "opacity-100 pb-48 pointer-events-auto" : "opacity-0 pb-4 pointer-events-none"
            )}
        >
          {history.length > 0 && (
            <ChatStream
              history={history}
              models={models}
              onSwitchAgent={handleSwitchAgent}
              onEditMessage={handleEditMessage}
              onNavigateBranch={handleNavigateBranch}
              onStop={stopStream}
              lastTurnRef={lastTurnRef}
            />
          )}
          <div className="h-px w-full" />
        </div>

        <div
            className={cn(
                "transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] absolute w-full flex justify-center z-50 pointer-events-none",
                isCenterMode
                    ? "px-4 left-0"
                    : "bottom-0 left-0 px-4 pb-4"
            )}
            style={{
                top: isCenterMode ? 'max(60%, 550px)' : undefined,
                transform: isCenterMode ? 'translateY(-50%)' : undefined,
            }}
        >
            <ChatInput
                ref={inputRef}
                input={input}
                setInput={setInput}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
                activeModelsCount={selectedModelId ? 1 : 0}
                onStop={stopStream}
                isCentered={isCenterMode}
            />
        </div>

      </SidebarInset>
    </>
  )
}