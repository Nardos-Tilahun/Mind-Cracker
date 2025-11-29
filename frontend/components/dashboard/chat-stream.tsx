"use client"

import { motion } from "framer-motion"
import { Separator } from "@/components/ui/separator"
import { AgentCard } from "@/components/features/chat/agent-card"
import { ChatMessage } from "@/components/features/chat/chat-message"
import { ChatTurn, Model } from "@/types/chat"
import { cn } from "@/lib/utils"
import React, { useMemo } from "react"

interface ChatStreamProps {
  history: ChatTurn[]
  models: Model[]
  onSwitchAgent: (turnId: string, oldModelId: string, newModelId: string) => void
  onEditMessage: (turnId: string, newText: string, models: string[]) => void
  onNavigateBranch: (turnId: string, direction: 'prev' | 'next') => void
  onStop: () => void
  lastTurnRef?: React.RefObject<HTMLDivElement | null> | null
}

export function ChatStream({
    history,
    models,
    onSwitchAgent,
    onEditMessage,
    onNavigateBranch,
    onStop,
    lastTurnRef
}: ChatStreamProps) {

  // --- SMART SCROLL TARGET LOGIC ---
  // Identify the turn with the MOST RECENT timestamp in its active version.
  const targetTurnId = useMemo(() => {
      if (!history || history.length === 0) return null;
      
      let latestTurnId = history[history.length - 1].id;
      let maxTime = 0;

      history.forEach(turn => {
          const activeVer = turn.versions[turn.currentVersionIndex];
          if (activeVer) {
              // Handle potentially missing timestamps gracefully
              const time = activeVer.createdAt || 0;
              if (time > maxTime) {
                  maxTime = time;
                  latestTurnId = turn.id;
              }
          }
      });

      return latestTurnId;
  }, [history]);

  return (
    <>
      {history.map((turn: ChatTurn) => {
        const agentKeys = Object.keys(turn.agents);
        const isComparison = agentKeys.length > 1;
        const currentModelIds = Object.keys(turn.agents);
        
        // Only attach ref if this is the identified latest turn
        const isTarget = turn.id === targetTurnId;

        return (
          <motion.div
            key={turn.id}
            ref={isTarget && lastTurnRef ? lastTurnRef : null}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 scroll-mt-24"
          >
            <div className="flex justify-end px-2">
               <ChatMessage
                  turn={turn}
                  onEdit={(newText) => onEditMessage(turn.id, newText, currentModelIds)}
                  onNavigate={(dir) => onNavigateBranch(turn.id, dir)}
               />
            </div>

            <div
              className={cn(
                "grid gap-4 sm:gap-6",
                isComparison ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-2 items-start" : "grid-cols-1 max-w-3xl mx-auto"
              )}
            >
              {agentKeys.map((modelId) => {
                const agent = turn.agents[modelId];
                const model = models.find((m) => m.id === agent.modelId);

                return (
                  <motion.div
                    key={agent.modelId}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <AgentCard
                      state={agent}
                      modelName={model?.name || agent.modelId}
                      allModels={models}
                      onSwitch={(newId: string) =>
                        onSwitchAgent(turn.id, agent.modelId, newId)
                      }
                      isLastTurn={isTarget} // Visual cue for last turn
                      activeModelIds={agentKeys}
                      onStop={onStop}
                    />
                  </motion.div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 opacity-20 px-4">
              <Separator className="flex-1" />
              <div className="w-1.5 h-1.5 rounded-full bg-foreground" />
              <Separator className="flex-1" />
            </div>
          </motion.div>
        );
      })}
    </>
  )
}