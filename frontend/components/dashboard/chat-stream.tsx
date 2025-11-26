"use client"

import { motion } from "framer-motion"
import { Separator } from "@/components/ui/separator"
import { AgentCard } from "@/components/features/chat/agent-card"
import { ChatMessage } from "@/components/features/chat/chat-message"
import { ChatTurn, Model } from "@/types/chat"
import { cn } from "@/lib/utils"
import React from "react"

interface ChatStreamProps {
  history: ChatTurn[]
  models: Model[]
  onSwitchAgent: (turnId: string, oldModelId: string, newModelId: string) => void
  onEditMessage: (turnId: string, newText: string, models: string[]) => void
  onNavigateBranch: (turnId: string, direction: 'prev' | 'next') => void
  onStop: () => void
  lastTurnRef: React.RefObject<HTMLDivElement | null>
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
  return (
    <>
      {history.map((turn: ChatTurn, index: number) => {
        const agentKeys = Object.keys(turn.agents);
        const isComparison = agentKeys.length > 1;
        const isLastTurn = index === history.length - 1;
        const currentModelIds = Object.keys(turn.agents);

        return (
          <motion.div
            key={turn.id}
            // Attach ref if it's the last turn
            ref={isLastTurn ? lastTurnRef : null} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            // scroll-mt-32 ensures enough margin so the header doesn't cover the content
            className="space-y-8 scroll-mt-32" 
          >
            {/* Interactive User Message */}
            <div className="flex justify-end px-2">
               <ChatMessage 
                  turn={turn}
                  onEdit={(newText) => onEditMessage(turn.id, newText, currentModelIds)}
                  onNavigate={(dir) => onNavigateBranch(turn.id, dir)}
               />
            </div>

            {/* Agents Grid */}
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
                      isLastTurn={isLastTurn}
                      activeModelIds={agentKeys}
                      onStop={onStop}
                    />
                  </motion.div>
                );
              })}
            </div>

            {/* Separator */}
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