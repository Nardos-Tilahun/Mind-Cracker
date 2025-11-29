"use client"

import * as React from "react"
import { FolderOpen, Home, Eye } from "lucide-react"
import { cn, cleanGoalTitle } from "@/lib/utils" 
import { ChatTurn } from "@/types/chat"
import { useMemo, useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { MindMapNavigation } from "./mind-map-navigation"
import { ChevronRight } from "lucide-react" 
import { Badge } from "@/components/ui/badge"
import { GitBranch } from "lucide-react"

interface BreadcrumbsProps {
    history: ChatTurn[]
    activeTurnId: string | null
    pathTipId: string | null
    onNavigate: (turnId: string | null) => void
    onDrillDown: (parentTurnId: string, stepNumber: string, stepTitle: string, modelId: string, stepDescription?: string) => void
}

export function Breadcrumbs({ history, activeTurnId, pathTipId, onNavigate, onDrillDown }: BreadcrumbsProps) {
    const breadcrumbPath = useMemo(() => {
        const targetId = pathTipId || activeTurnId
        if (!targetId || history.length === 0) return []
        const path: ChatTurn[] = []
        let currentId: string | undefined = targetId
        let iterations = 0
        while (currentId && iterations < 100) {
            const turn = history.find(t => t.id === currentId)
            if (!turn) break
            path.unshift(turn)
            currentId = turn.metadata?.parentTurnId
            iterations++
        }
        return path
    }, [history, pathTipId, activeTurnId])

    return (
        <TooltipProvider delayDuration={100}>
            <div className="sticky top-0 z-30 w-full bg-background/95 backdrop-blur-xl border-b border-border/40 px-3 py-2 flex flex-wrap items-center gap-x-1 gap-y-2 transition-all">

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => onNavigate(null)}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider transition-all shrink-0",
                                !activeTurnId
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-primary/20"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-muted/20"
                            )}
                        >
                            <Home className="w-3.5 h-3.5" />
                            GOAL
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        Back to Root
                    </TooltipContent>
                </Tooltip>

                <MindMapTrigger
                    history={history}
                    parentId={undefined}
                    onNavigate={onNavigate}
                    onDrillDown={onDrillDown}
                    activeTurnId={activeTurnId}
                />

                {breadcrumbPath.map((turn, index) => {
                    const isActive = turn.id === activeTurnId
                    const rawMsg = cleanGoalTitle(turn.userMessage);
                    const displayTitle = turn.metadata?.parentStepNumber
                        ? `Step ${turn.metadata.parentStepNumber}`
                        : rawMsg.length > 15 ? rawMsg.substring(0, 15) + "..." : rawMsg

                    return (
                        <React.Fragment key={turn.id}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => onNavigate(turn.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all max-w-[140px] sm:max-w-[200px] shrink-0 border",
                                            isActive
                                                ? "bg-primary/10 text-primary border-primary/20 cursor-default shadow-sm ring-1 ring-primary/10"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-muted/10 border-transparent truncate"
                                        )}
                                    >
                                        {isActive ? <Eye className="w-3 h-3 shrink-0 animate-pulse" /> : <FolderOpen className="w-3 h-3 shrink-0 opacity-70" />}
                                        <span className="truncate">{displayTitle}</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[300px]">
                                    {cleanGoalTitle(turn.userMessage)}
                                </TooltipContent>
                            </Tooltip>

                            <MindMapTrigger
                                history={history}
                                parentId={turn.id}
                                onNavigate={onNavigate}
                                onDrillDown={onDrillDown}
                                activeTurnId={activeTurnId}
                            />
                        </React.Fragment>
                    )
                })}
            </div>
        </TooltipProvider>
    )
}

function MindMapTrigger({
    history,
    parentId,
    onNavigate,
    onDrillDown,
    activeTurnId
}: {
    history: ChatTurn[],
    parentId: string | undefined,
    onNavigate: (id: string) => void,
    onDrillDown: (pid: string, num: string, title: string, model: string, desc?: string) => void,
    activeTurnId: string | null
}) {
    const [isOpen, setIsOpen] = useState(false);
    
    const childrenCount = history.filter(t => t.metadata?.parentTurnId === parentId).length
    const parentTurn = history.find(t => t.id === parentId);
    const hasPlan = parentTurn ? Object.values(parentTurn.agents).some(a => a.jsonResult?.steps?.length > 0) : false;

    if (childrenCount === 0 && !hasPlan && parentId !== undefined) return null

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button className="p-0.5 rounded-md hover:bg-muted/50 transition-colors focus:outline-none group shrink-0 active:scale-95 data-[state=open]:bg-primary/10">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors group-data-[state=open]:rotate-90 duration-200" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                className="w-auto p-0 border-none bg-transparent shadow-none" // REMOVED DEFAULT STYLES
                onOpenAutoFocus={(e) => e.preventDefault()} // Prevents focus stealing
            >
                <MindMapNavigation
                    history={history}
                    rootParentId={parentId}
                    onNavigate={onNavigate}
                    onDrillDown={onDrillDown}
                    activeTurnId={activeTurnId}
                    onClose={() => setIsOpen(false)} // PASS CLOSE HANDLER
                />
            </PopoverContent>
        </Popover>
    )
}