"use client"

import { useState, useEffect } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { BrainCircuit } from "lucide-react"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ModelSelector } from "@/components/features/chat/model-selector"
import { AuthModal } from "@/components/auth-modal"
import { UserNav } from "@/components/dashboard/user-nav"
import { Model } from "@/types/chat"
import { authClient } from "@/lib/auth-client"
import { motion, AnimatePresence } from "framer-motion"

interface DashboardHeaderProps {
  models: Model[]
  selectedModels: string[]
  onToggleModel: (id: string) => void
  onNewChat: () => void
}

export function DashboardHeader({
  models,
  selectedModels,
  onToggleModel,
  onNewChat,
}: DashboardHeaderProps) {
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [authTab, setAuthTab] = useState<"login" | "register">("login")

  const { data: session, isPending } = authClient.useSession()

  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    if (!isPending) {
        setHasInitialized(true)
    }
  }, [isPending])

  const openAuth = (tab: "login" | "register") => {
    setAuthTab(tab)
    setIsAuthOpen(true)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-60 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-xl px-2.5 shadow-sm transition-all">
      <SidebarTrigger className="text-muted-foreground hover:text-primary transition-colors shrink-0" />

      <div className="flex-1 flex items-center justify-end overflow-hidden">

        {/* BRANDING */}
        <div
          onClick={onNewChat}
          className="flex items-center gap-2 font-bold text-sm text-foreground shrink-0 cursor-pointer hover:opacity-80 transition-opacity select-none mr-auto"
          role="button"
          tabIndex={0}
        >
          <div className="p-1 rounded-md bg-primary/10">
            <BrainCircuit className="w-5 h-5 text-primary fill-current/10" />
          </div>
          <span className="hidden md:block tracking-tight">Mind Cracker</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 ml-auto">
          <ModelSelector
            models={models}
            selectedModels={selectedModels}
            onToggle={onToggleModel}
          />

          {!session && (
            <div>
              <ModeToggle />
            </div>
          )}

          <div className="flex items-center gap-2 border-l pl-4 ml-2 border-border/50 justify-end">
            <AnimatePresence mode="wait">
              {isPending || (!session && !hasInitialized) ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex gap-2"
                >
                  <Skeleton className="h-8 w-16 rounded-md" />
                </motion.div>
              ) : session ? (
                <motion.div
                  key="user"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <UserNav user={session.user} />
                </motion.div>
              ) : (
                <motion.div
                  key="auth-buttons"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  // CHANGED: "flex" -> "hidden md:flex"
                  // This hides the button on small screens and shows it as flex on medium+ screens
                  className="hidden md:flex items-center gap-2"
                >
                  <Button
                    size="sm"
                    onClick={() => openAuth("login")}
                    className="h-8 text-xs font-semibold"
                  >
                    Sign In
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <AuthModal
        open={isAuthOpen}
        onOpenChange={setIsAuthOpen}
        defaultTab={authTab}
      />
    </header>
  )
}