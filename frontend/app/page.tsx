"use client"

import { useState, useRef, useEffect, useMemo, Suspense } from "react"
import axios from "axios"
import { useSearchParams, useRouter } from "next/navigation"
import { SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ChatStream } from "@/components/dashboard/chat-stream"
import { EmptyState } from "@/components/dashboard/empty-state"
import { ChatInput } from "@/components/features/chat/chat-input"
import { Breadcrumbs } from "@/components/features/chat/breadcrumbs"
import { useMultiAgentChat } from "@/hooks/use-multi-agent-chat"
import { useFaviconSpinner } from "@/hooks/use-favicon-spinner"
import { useIsMobile } from "@/hooks/use-mobile"
import { Model, ChatTurn } from "@/types/chat"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { API_URL } from "@/lib/chat/config"

function SearchParamHandler({ loadGoal }: { loadGoal: (id: number) => void }) {
    const searchParams = useSearchParams()
    const loadedRef = useRef(false)

    useEffect(() => {
        const idStr = searchParams.get("chatId")
        if (idStr && !loadedRef.current) {
            const id = parseInt(idStr, 10)
            if (!isNaN(id)) {
                loadGoal(id)
                loadedRef.current = true
            }
        }
    }, [searchParams, loadGoal])

    return null
}

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
    resetChatId,
    drillDown,
    scrollToParent,
    activeTurnId,
    pathTipId,
    setActiveTurnId,
    currentChatId, 
    loadGoalById
  } = useMultiAgentChat()

  useFaviconSpinner(isProcessing)
  const isMobile = useIsMobile()
  const router = useRouter()

  const [input, setInput] = useState("")
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)

  const [sloganKey, setSloganKey] = useState(0)

  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)
  const lastTurnStartRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [hasInteracted, setHasInteracted] = useState(false)

  const visibleHistory = history;
  const isCenterMode = history.length === 0 && !hasInteracted

  useEffect(() => {
      if (currentChatId) {
          const url = new URL(window.location.href)
          url.searchParams.set("chatId", currentChatId.toString())
          window.history.replaceState({}, "", url)
      } else {
          const url = new URL(window.location.href)
          url.searchParams.delete("chatId")
          window.history.replaceState({}, "", url)
      }
  }, [currentChatId])

  useEffect(() => {
      if (history.length === 0 && hasInteracted) {
          setHasInteracted(false)
          setSloganKey(prev => prev + 1)
      }
  }, [history, hasInteracted])

  useEffect(() => {
    axios.get(`${API_URL}/models`).then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
            setModels(res.data)
            if (!selectedModelId) setSelectedModelId(res.data[0].id)
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
    if (!isMobile) {
        const timer = setTimeout(() => inputRef.current?.focus(), 50)
        return () => clearTimeout(timer)
    }
  }, [isMobile])

  const focusInput = () => {
    if (isMobile) return
    setTimeout(() => inputRef.current?.focus(), 10)
  }

  const handleSubmit = (e: any) => {
    e.preventDefault()
    if (isProcessing) return toast.warning("Wait for agents.")
    if (!input.trim() || !selectedModelId) return
    setHasInteracted(true)
    shouldAutoScrollRef.current = true
    startTurn(input, [selectedModelId])
    setInput("")
    focusInput()
  }

  const handleExampleClick = (text: string) => {
      if (!selectedModelId) { toast.error("Loading models..."); return }
      setInput(text)
      setHasInteracted(true)
      shouldAutoScrollRef.current = true
      startTurn(text, [selectedModelId])
      setInput("")
      focusInput()
  }

  const handleHistorySelect = (item: any) => {
    if (isProcessing) stopStream()
    setHasInteracted(true)
    const restore = (hist: any) => {
        if (Array.isArray(hist)) loadChatFromHistory(item.id, hist)
    }
    restore(item.chat_history)
    focusInput()
  }

  const handleNewChat = () => {
    if (isProcessing) stopStream()
    clearChat()
    setInput("")
    focusInput()
  }

  const handleLogout = () => {
    if (isProcessing) {
        stopStream()
    }
    clearChat()
    setHasInteracted(false)
    setSloganKey(prev => prev + 1)
  }

  return (
    <Suspense fallback={null}>
      <SearchParamHandler loadGoal={loadGoalById} />
      <DashboardHeader
        models={models}
        selectedModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
        onNewChat={handleNewChat}
        onLogout={handleLogout}
      />

      <AppSidebar
        onSelectHistory={handleHistorySelect}
        onNewChat={handleNewChat}
        onClearHistory={resetChatId}
        className="top-16! h-[calc(100svh-4rem)]! z-40"
      />

      <SidebarInset className="mt-16 h-[calc(100svh-4rem)] overflow-hidden bg-linear-to-b from-background to-secondary/10 flex flex-col relative w-full">

        {!isCenterMode && (
            <Breadcrumbs
                history={history}
                activeTurnId={activeTurnId}
                pathTipId={pathTipId}
                onNavigate={(id) => {
                    if (id) {
                        scrollToParent(id)
                    } else {
                        scrollViewportRef.current?.scrollTo({ top: 0, behavior: 'smooth'})
                        setActiveTurnId(null)
                    }
                }}
                onDrillDown={drillDown} // <-- PASSED HERE
            />
        )}

        <div className={cn("absolute inset-0 z-10 overflow-y-auto custom-scrollbar transition-opacity duration-500 overscroll-y-auto touch-pan-y", !isCenterMode ? "opacity-0 pointer-events-none" : "opacity-100")}>
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

        <div
            ref={scrollViewportRef}
            onScroll={handleScroll}
            className={cn("flex-1 overflow-y-auto custom-scrollbar w-full h-full transition-opacity duration-500 overscroll-y-auto touch-pan-y", !isCenterMode ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}
            style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="max-w-5xl mx-auto p-4 space-y-10 min-h-full">
            {visibleHistory.length > 0 && (
                <ChatStream
                    history={visibleHistory}
                    models={models}
                    onSwitchAgent={switchAgent}
                    onEditMessage={editMessage}
                    onNavigateBranch={navigateBranch}
                    onStop={stopStream}
                    lastTurnRef={lastTurnStartRef}
                    onDrillDown={drillDown}
                    onScrollToParent={scrollToParent}
                    chatId={currentChatId} 
                />
            )}
            <div ref={bottomAnchorRef} className="h-4 w-full" />
          </div>
        </div>

        <div className={cn("absolute bottom-0 left-0 right-0 w-full flex justify-center z-50 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]", !isCenterMode ? "translate-y-0 opacity-100 px-4 pb-4" : "translate-y-20 opacity-0 pointer-events-none")}>
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
    </Suspense>
  )
}