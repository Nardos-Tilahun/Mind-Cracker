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
import { API_URL } from "@/lib/chat/config"

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
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [sloganKey, setSloganKey] = useState(0)

  // Refs
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [hasInteracted, setHasInteracted] = useState(false)
  const isCenterMode = history.length === 0 && !hasInteracted

  useEffect(() => {
    axios.get(`${API_URL}/models`).then((res) => {
        setModels(res.data)
        if (res.data.length > 0 && !selectedModelId) {
          setSelectedModelId(res.data[0].id)
        }
    }).catch(console.error)
  }, [])

  const handleScroll = () => {
      if (!scrollViewportRef.current) return
      const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100
      shouldAutoScrollRef.current = isAtBottom
  }

  useEffect(() => {
      if (isProcessing && shouldAutoScrollRef.current) {
          bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" })
      }
  }, [history, isProcessing])

  useEffect(() => {
      if (history.length > 0 && isProcessing) {
          shouldAutoScrollRef.current = true
          bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" })
          setHasInteracted(true)
      }
  }, [history.length])

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
    if (isProcessing) stopStream()

    setHasInteracted(true)
    if (item.chat_history && Array.isArray(item.chat_history)) {
        loadChatFromHistory(item.id, item.chat_history)
        setTimeout(() => {
            shouldAutoScrollRef.current = true
            bottomAnchorRef.current?.scrollIntoView({ behavior: "auto", block: "end" })
        }, 50)
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
    if (isProcessing) stopStream()
    clearChat()
    setInput("")
    setHasInteracted(false)
    setSloganKey(prev => prev + 1)
    focusInput()
  }

  const handleLogout = () => {
    if (isProcessing) {
        stopStream()
    }
  }

  const handleSelectModel = (id: string) => {
    setSelectedModelId(id)
    focusInput()
  }

  const handleSwitchAgent = (turnId: string, oldModelId: string, newModelId: string) => {
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
        onLogout={handleLogout}
      />

      <AppSidebar
        onSelectHistory={handleHistorySelect}
        onNewChat={handleNewChat}
        onClearHistory={resetChatId}
        className="top-16! h-[calc(100svh-4rem)]! z-40"
      />

      {/*
          MAIN CONTENT AREA
      */}
      <SidebarInset className="mt-16 h-[calc(100svh-4rem)] overflow-hidden bg-linear-to-b from-background to-secondary/10 flex flex-col relative w-full">

        {/*
           1. CENTER MODE (New Chat)
           - This remains absolute and handles its own layout.
        */}
        <div
            className={cn(
                "absolute inset-0 z-10 overflow-y-auto custom-scrollbar transition-opacity duration-500",
                !isCenterMode ? "opacity-0 pointer-events-none" : "opacity-100"
            )}
        >
            <div className="min-h-full w-full max-w-3xl mx-auto flex flex-col items-center justify-start pt-10 pb-10 px-4 md:pt-20">
                <div className="w-full mb-8 shrink-0">
                    <EmptyState key={sloganKey} onExampleClick={handleExampleClick} />
                </div>
                <div className="w-full max-w-2xl shrink-0 animate-in slide-in-from-bottom-4 duration-700 fade-in fill-mode-forwards">
                    <ChatInput
                        ref={isCenterMode ? inputRef : null}
                        input={input}
                        setInput={setInput}
                        onSubmit={handleSubmit}
                        isProcessing={isProcessing}
                        activeModelsCount={selectedModelId ? 1 : 0}
                        onStop={stopStream}
                        isCentered={true} 
                    />
                </div>
            </div>
        </div>

        {/*
           2. CHAT MODE (Active Conversation)
           - CHANGED: This container is now w-full h-full (full width/height).
           - The scrollbar attaches to THIS element (window edge).
           - The CONTENT inside is centered via a wrapper div.
        */}
        <div
            ref={scrollViewportRef}
            onScroll={handleScroll}
            className={cn(
                "flex-1 overflow-y-auto custom-scrollbar w-full h-full transition-opacity duration-500",
                !isCenterMode ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
        >
          {/* Inner Wrapper for Centering Content */}
          <div className="max-w-5xl mx-auto p-4 space-y-10 pb-36 min-h-full">
            {history.length > 0 && (
                <ChatStream
                history={history}
                models={models}
                onSwitchAgent={handleSwitchAgent}
                onEditMessage={handleEditMessage}
                onNavigateBranch={handleNavigateBranch}
                onStop={stopStream}
                />
            )}
            {/* Bottom Anchor */}
            <div ref={bottomAnchorRef} className="h-4 w-full" />
          </div>
        </div>

        {/* Fixed Input for Chat Mode */}
        <div
            className={cn(
                "absolute bottom-0 left-0 right-0 w-full flex justify-center z-50 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]",
                !isCenterMode ? "translate-y-0 opacity-100 px-4 pb-4" : "translate-y-20 opacity-0 pointer-events-none"
            )}
        >
            <ChatInput
                ref={!isCenterMode ? inputRef : null}
                input={input}
                setInput={setInput}
                onSubmit={handleSubmit}
                isProcessing={isProcessing}
                activeModelsCount={selectedModelId ? 1 : 0}
                onStop={stopStream}
                isCentered={false} 
            />
        </div>

      </SidebarInset>
    </>
  )
}