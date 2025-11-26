"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  X,
  Check,
  GitCompare,
  Bot,
} from "lucide-react"
import { Model } from "@/types/chat"
import { cn } from "@/lib/utils"

interface ModelSelectorProps {
  models: Model[]
  selectedModels: string[]
  onToggle: (id: string) => void
}

export function ModelSelector({ models, selectedModels, onToggle }: ModelSelectorProps) {
  const isMax = selectedModels.length >= 2
  const isComparison = selectedModels.length === 2

  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-background/40 p-1 sm:p-1.5 sm:pr-3 rounded-full border border-border/50 backdrop-blur-md shadow-sm transition-all hover:bg-background/60 hover:border-border/80 max-w-[60vw] sm:max-w-none">

      {/* TRIGGER BUTTON */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "rounded-full h-8 px-2 sm:px-3 gap-2 transition-all shrink-0",
              isComparison
                ? "bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 hover:text-indigo-600"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
          >
            {isComparison ? <GitCompare className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            <span className="text-xs font-semibold hidden sm:inline">
              {isComparison ? "Compare" : "Single Agent"}
            </span>
            {!isMax && <Plus className="w-3 h-3 sm:ml-1 opacity-70" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px] p-2 z-[100]">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {isComparison
              ? "Max agents selected (2). Remove one to change."
              : "Select up to 2 models to enable comparison."}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            {models.map((m) => {
              const isSelected = selectedModels.includes(m.id)
              const isDisabled = isMax && !isSelected

              return (
                <DropdownMenuItem
                  key={m.id}
                  disabled={isDisabled}
                  onClick={(e) => {
                    e.preventDefault()
                    onToggle(m.id)
                  }}
                  className={cn(
                    "flex items-center justify-between gap-2 p-2.5 mb-1 rounded-md cursor-pointer transition-colors",
                    isSelected ? "bg-primary/10 text-primary focus:bg-primary/15" : "focus:bg-muted"
                  )}
                >
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    <span className="font-medium text-xs truncate">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                       {m.provider}
                    </span>
                  </div>
                  {isSelected && (
                    <motion.div layoutId="check">
                      <Check className="w-3.5 h-3.5" />
                    </motion.div>
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* SELECTED CHIPS */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mask-linear-fade">
        <AnimatePresence mode="popLayout">
          {selectedModels.map((id) => {
            const model = models.find((m) => m.id === id)
            return (
              <motion.div
                key={id}
                layout
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <Badge
                  variant="outline"
                  className="h-7 pl-2 pr-1.5 gap-1.5 bg-background/50 backdrop-blur-sm border-border/60 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all group cursor-default whitespace-nowrap"
                >
                  <span className="max-w-[80px] sm:max-w-[100px] truncate font-medium text-[10px]">
                    {model?.name || "Loading..."}
                  </span>
                  <button
                    onClick={() => onToggle(id)}
                    className="rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                  >
                    <X className="w-3 h-3 opacity-50 group-hover:opacity-100" />
                  </button>
                </Badge>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}