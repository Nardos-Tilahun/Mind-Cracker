"use client"

import * as React from "react"
import { FolderOpen, Home, Eye, ChevronRight } from "lucide-react"
import { cn, cleanGoalTitle } from "@/lib/utils"
import { ChatTurn } from "@/types/chat"
import { useMemo, useState, useRef } from "react"
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
import { useIsTouch } from "@/hooks/use-mobile"

interface BreadcrumbsProps {
    history: ChatTurn[]
    activeTurnId: string | null
    pathTipId: string | null
    onNavigate: (turnId: string | null) => void
    onDrillDown: (parentTurnId: string, stepNumber: string, stepTitle: string, modelId: string, stepDescription?: string) => void
}

export function Breadcrumbs({ history, activeTurnId, pathTipId, onNavigate, onDrillDown }: BreadcrumbsProps) {
    const isTouch = useIsTouch()
    
    const lastTapRef = useRef<{[key: string]: number}>({})
    const [openTooltips, setOpenTooltips] = useState<{[key: string]: boolean}>({})
    const tooltipTimerRef = useRef<{[key: string]: NodeJS.Timeout}>({})

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

    const handleTouchEnd = (e: React.TouchEvent, id: string | null) => {
        if (!isTouch) return

        e.preventDefault()
        e.stopPropagation()
        
        const key = id || 'root'
        const now = Date.now()
        const lastTime = lastTapRef.current[key] || 0
        const timeDiff = now - lastTime
        const isCurrentlyOpen = openTooltips[key]

        // Clear any pending timer
        if (tooltipTimerRef.current[key]) {
            clearTimeout(tooltipTimerRef.current[key])
            delete tooltipTimerRef.current[key]
        }

        // If tooltip is open, close it immediately
        if (isCurrentlyOpen) {
            setOpenTooltips(prev => {
                const updated = { ...prev }
                updated[key] = false
                return updated
            })
            lastTapRef.current[key] = 0
            return
        }

        // Check for double-tap (tooltip is closed)
        if (timeDiff > 0 && timeDiff < 400) {
            onNavigate(id)
            lastTapRef.current[key] = 0
            return
        }

        // Single tap - schedule tooltip open
        lastTapRef.current[key] = now
        tooltipTimerRef.current[key] = setTimeout(() => {
            setOpenTooltips(prev => {
                const newState: {[key: string]: boolean} = {}
                Object.keys(prev).forEach(k => newState[k] = false)
                newState[key] = true
                return newState
            })
            delete tooltipTimerRef.current[key]
        }, 400)
    }

    const handleClick = (e: React.MouseEvent, id: string | null) => {
        if (isTouch) {
            e.preventDefault()
            e.stopPropagation()
            return
        }
        onNavigate(id)
    }

    const handleTooltipOpenChange = (key: string, open: boolean) => {
        if (!isTouch) return
        
        if (!open) {
            if (tooltipTimerRef.current[key]) {
                clearTimeout(tooltipTimerRef.current[key])
                delete tooltipTimerRef.current[key]
            }
            setOpenTooltips(prev => ({ ...prev, [key]: false }))
            lastTapRef.current[key] = 0
        }
    }

    React.useEffect(() => {
        return () => {
            Object.values(tooltipTimerRef.current).forEach(timer => clearTimeout(timer))
        }
    }, [])

    return (
        <TooltipProvider delayDuration={isTouch ? 0 : 100}>
            <div className="sticky top-0 z-30 w-full bg-background/95 backdrop-blur-xl border-b border-border/40 px-3 py-2 flex flex-wrap items-center gap-x-1 gap-y-2 transition-all">

                <Tooltip 
                    open={isTouch ? openTooltips['root'] : undefined}
                    onOpenChange={(open) => handleTooltipOpenChange('root', open)}
                >
                    <TooltipTrigger asChild>
                        <button
                            onClick={(e) => handleClick(e, null)}
                            onTouchEnd={(e) => handleTouchEnd(e, null)}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider transition-all shrink-0 select-none touch-manipulation",
                                !activeTurnId
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-primary/20"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-muted/20",
                                isTouch && openTooltips['root'] && "ring-2 ring-green-500"
                            )}
                        >
                            <Home className="w-3.5 h-3.5" />
                            GOAL
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                        <div className="text-xs">
                            {isTouch ? "Tap: show • Tap outside: close • Double-tap: go" : "Back to Root"}
                        </div>
                    </TooltipContent>
                </Tooltip>

                <MindMapTrigger
                    history={history}
                    parentId={undefined}
                    onNavigate={onNavigate}
                    onDrillDown={onDrillDown}
                    activeTurnId={activeTurnId}
                />

                {breadcrumbPath.map((turn) => {
                    const isActive = turn.id === activeTurnId
                    const rawMsg = cleanGoalTitle(turn.userMessage);
                    const displayTitle = turn.metadata?.parentStepNumber
                        ? `Step ${turn.metadata.parentStepNumber}`
                        : rawMsg.length > 15 ? rawMsg.substring(0, 15) + "..." : rawMsg
                    const tooltipKey = turn.id

                    return (
                        <React.Fragment key={turn.id}>
                            <Tooltip
                                open={isTouch ? openTooltips[tooltipKey] : undefined}
                                onOpenChange={(open) => handleTooltipOpenChange(tooltipKey, open)}
                            >
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={(e) => handleClick(e, turn.id)}
                                        onTouchEnd={(e) => handleTouchEnd(e, turn.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all max-w-[140px] sm:max-w-[200px] shrink-0 border select-none touch-manipulation",
                                            isActive
                                                ? "bg-primary/10 text-primary border-primary/20 cursor-default shadow-sm ring-1 ring-primary/10"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50 bg-muted/10 border-transparent truncate",
                                            isTouch && openTooltips[tooltipKey] && "ring-2 ring-green-500"
                                        )}
                                    >
                                        {isActive ? <Eye className="w-3 h-3 shrink-0 animate-pulse" /> : <FolderOpen className="w-3 h-3 shrink-0 opacity-70" />}
                                        <span className="truncate">{displayTitle}</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-[300px]">
                                    <div className="flex flex-col gap-1">
                                        <span className="font-semibold">{turn.metadata?.parentStepNumber ? `Step ${turn.metadata.parentStepNumber}` : "Conversation"}</span>
                                        <span className="opacity-90">{cleanGoalTitle(turn.userMessage)}</span>
                                        {isTouch && (
                                            <div className="text-[10px] text-muted-foreground mt-1.5 border-t border-white/10 pt-1.5 font-mono">
                                                Tap: show • Double-tap: navigate
                                            </div>
                                        )}
                                    </div>
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
                <button className="p-0.5 rounded-md hover:bg-muted/50 transition-colors focus:outline-none group shrink-0 active:scale-95 data-[state=open]:bg-primary/10 touch-manipulation">
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors group-data-[state=open]:rotate-90 duration-200" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                className="w-auto p-0 border-none bg-transparent shadow-none"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                <MindMapNavigation
                    history={history}
                    rootParentId={parentId}
                    onNavigate={onNavigate}
                    onDrillDown={onDrillDown}
                    activeTurnId={activeTurnId}
                    onClose={() => setIsOpen(false)}
                />
            </PopoverContent>
        </Popover>
    )
}