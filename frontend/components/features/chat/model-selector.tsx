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
import { Check, Bot, ChevronDown } from "lucide-react"
import { Model } from "@/types/chat"
import { cn } from "@/lib/utils"

interface ModelSelectorProps {
  models: Model[]
  selectedModelId: string | null
  onSelect: (id: string) => void
}

export function ModelSelector({ models, selectedModelId, onSelect }: ModelSelectorProps) {
  const selectedModel = models.find((m) => m.id === selectedModelId)

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full h-9 px-3 gap-2 border-border/60 bg-background/50 backdrop-blur-sm hover:bg-accent/50 transition-all"
          >
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium max-w-[120px] truncate hidden sm:inline-block">
              {selectedModel?.name || "Select Model"}
            </span>
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[280px] p-2 z-100">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Select an AI Agent
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            {models.map((m) => {
              const isSelected = selectedModelId === m.id

              return (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => onSelect(m.id)}
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
    </div>
  )
}