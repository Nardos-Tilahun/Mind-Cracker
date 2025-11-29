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
  onDrillDown: (parentTurnId: string, stepNumber: string, stepTitle: string, modelId: string, stepDescription?: string) => void
  onScrollToParent: (parentTurnId: string) => void
  chatId: number | null
}

export function ChatStream({
    history,
    models,
    onSwitchAgent,
    onEditMessage,
    onNavigateBranch,
    onStop,
    lastTurnRef,
    onDrillDown,
    onScrollToParent,
    chatId
}: ChatStreamProps) {

  const targetTurnId = useMemo(() => {
      if (!history || history.length === 0) return null;

      let latestTurnId = history[history.length - 1].id;
      let maxTime = 0;

      history.forEach(turn => {
          const activeVer = turn.versions[turn.currentVersionIndex];
          if (activeVer) {
              const time = activeVer.createdAt || 0;
              if (time > maxTime) {
                  maxTime = time;
                  latestTurnId = turn.id;
              }
          }
      });

      return latestTurnId;
  }, [history]);

  const hasChildren = (turnId: string, stepNumber: string) => {
      return history.some(t =>
          t.metadata?.parentTurnId === turnId &&
          t.metadata?.parentStepNumber?.toString() === stepNumber.toString()
      )
  }

  return (
    <>
      {history.map((turn: ChatTurn) => {
        const agentKeys = Object.keys(turn.agents);
        const isComparison = agentKeys.length > 1;
        const currentModelIds = Object.keys(turn.agents);

        const isTarget = turn.id === targetTurnId;

        return (
          <motion.div
            key={turn.id}
            id={`turn-${turn.id}`}
            ref={isTarget && lastTurnRef ? lastTurnRef : null}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 "
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
                      turnId={turn.id}
                      metadata={turn.metadata}
                      modelName={model?.name || agent.modelId}
                      allModels={models}
                      onSwitch={(newId: string) =>
                        onSwitchAgent(turn.id, agent.modelId, newId)
                      }
                      isLastTurn={isTarget}
                      activeModelIds={agentKeys}
                      onStop={onStop}
                      onDrillDown={(stepNum, title, desc) => onDrillDown(turn.id, stepNum, title, agent.modelId, desc)}
                      onScrollToParent={() => turn.metadata?.parentTurnId && onScrollToParent(turn.metadata.parentTurnId)}
                      checkHasChildren={(stepNum) => hasChildren(turn.id, stepNum)}
                      chatId={chatId}
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