"use client"

import * as React from "react"
import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    ChevronRight, ChevronLeft, AlignLeft, MousePointerClick, GitCommitHorizontal, 
    CircleDashed, Lock, Network, ArrowRight, ZoomIn, ZoomOut, RotateCcw, 
    Move, CornerDownRight, Grid3x3, Square, Target, MapPin, MessageSquare, X 
} from "lucide-react"
import { cn, cleanGoalTitle } from "@/lib/utils"
import { ChatTurn } from "@/types/chat"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useIsTouch } from "@/hooks/use-mobile"

interface MindMapProps {
    history: ChatTurn[]
    rootParentId?: string | undefined
    onNavigate: (turnId: string) => void
    onDrillDown: (parentTurnId: string, stepNumber: string, stepTitle: string, modelId: string, stepDescription?: string) => void
    activeTurnId: string | null
    onClose: () => void 
}

type TreeNode = {
    id: string
    type: 'real' | 'virtual'
    label: string
    title: string
    description?: string
    children: TreeNode[]
    turnId?: string
    parentId?: string
    isExpandedDefault?: boolean
    modelId?: string
    stepNumber?: string
}

// --- TREE BUILDER ---
const buildHybridTree = (history: ChatTurn[], parentId: string | undefined): TreeNode[] => {
    const realChildrenTurns = history.filter(t => t.metadata?.parentTurnId === parentId);

    if (!parentId) {
        return realChildrenTurns.map(turn => ({
            id: turn.id,
            type: 'real',
            label: turn.metadata?.parentStepNumber ? `Step ${turn.metadata.parentStepNumber}` : "Goal",
            title: turn.userMessage,
            description: "Root Strategy",
            children: buildHybridTree(history, turn.id),
            turnId: turn.id,
            isExpandedDefault: true
        }));
    }

    const parentTurn = history.find(t => t.id === parentId);
    if (!parentTurn) return [];

    const agentKey = Object.keys(parentTurn.agents)[0];
    const agent = parentTurn.agents[agentKey];
    const plannedSteps = agent?.jsonResult?.steps || [];

    const nodes: TreeNode[] = plannedSteps.map((step: any, index: number) => {
        const stepIndex = index + 1;
        const parentLabel = parentTurn.metadata?.parentStepNumber; 
        const expectedStepLabel = parentLabel ? `${parentLabel}.${stepIndex}` : `${stepIndex}`;
        const matchingRealTurn = realChildrenTurns.find(t => t.metadata?.parentStepNumber === expectedStepLabel);

        if (matchingRealTurn) {
            return {
                id: matchingRealTurn.id,
                type: 'real',
                label: `Step ${expectedStepLabel}`,
                title: step.step || matchingRealTurn.userMessage,
                description: step.description,
                children: buildHybridTree(history, matchingRealTurn.id),
                turnId: matchingRealTurn.id,
                parentId: parentId,
                isExpandedDefault: false,
                modelId: agentKey,
                stepNumber: expectedStepLabel
            };
        } else {
            return {
                id: `virtual-${parentId}-${index}`,
                type: 'virtual',
                label: `Step ${expectedStepLabel}`,
                title: step.step,
                description: step.description,
                children: [],
                parentId: parentId,
                isExpandedDefault: false,
                modelId: agentKey,
                stepNumber: expectedStepLabel
            };
        }
    });

    const orphans = realChildrenTurns.filter(t => !nodes.some(n => n.turnId === t.id));
    orphans.forEach(t => {
        nodes.push({
            id: t.id,
            type: 'real',
            label: "Chat",
            title: t.userMessage,
            children: buildHybridTree(history, t.id),
            turnId: t.id,
            parentId: parentId,
            isExpandedDefault: false
        });
    });

    return nodes;
}

export function MindMapNavigation({ history, rootParentId, onNavigate, onDrillDown, activeTurnId, onClose }: MindMapProps) {
    const treeData = useMemo(() => buildHybridTree(history, rootParentId), [history, rootParentId])
    const parentTurn = useMemo(() => history.find(t => t.id === rootParentId), [history, rootParentId]);
    
    const headerInfo = useMemo(() => {
        if (!rootParentId) {
            return {
                icon: <Target className="w-4 h-4" />,
                badge: "Goal",
                title: "Main Strategy",
                subtitle: "Root Overview"
            };
        }
        if (parentTurn) {
            const stepNum = parentTurn.metadata?.parentStepNumber;
            const isConversational = !stepNum; 
            return {
                icon: isConversational ? <MessageSquare className="w-4 h-4" /> : <MapPin className="w-4 h-4" />,
                badge: stepNum ? `Step ${stepNum}` : "Branch", 
                title: stepNum ? "Step Breakdown" : "Conversation",
                subtitle: cleanGoalTitle(parentTurn.userMessage)
            };
        }
        return { icon: <Network className="w-4 h-4" />, badge: "Map", title: "Explorer", subtitle: "" };
    }, [rootParentId, parentTurn]);

    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [showGrid, setShowGrid] = useState(true); 
    
    // Centralized Tooltip State
    const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const lastPinchDistRef = useRef<number | null>(null);

    if (treeData.length === 0) {
        return <div className="p-3 text-xs text-muted-foreground italic text-center min-w-[150px]">No structure found.</div>
    }

    // --- HANDLERS ---
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); const delta = e.deltaY > 0 ? 0.9 : 1.1; setScale(s => Math.min(Math.max(s * delta, 0.5), 3)); }
    };
    const handleMouseDown = (e: React.MouseEvent) => { if ((e.target as HTMLElement).closest('button')) return; e.preventDefault(); setIsDragging(false); dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y }; };
    const handleMouseMove = (e: React.MouseEvent) => { if (!dragStartRef.current) return; setIsDragging(true); setPosition({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y }); };
    const handleMouseUp = () => { dragStartRef.current = null; setTimeout(() => setIsDragging(false), 50); };
    const handleBackgroundClick = () => { if (!isDragging) setActiveTooltipId(null); };
    const handleTouchStart = (e: React.TouchEvent) => { if ((e.target as HTMLElement).closest('button')) return; if (e.touches.length === 1) { setIsDragging(false); const touch = e.touches[0]; dragStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y }; } else if (e.touches.length === 2) { const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); lastPinchDistRef.current = dist; } };
    const handleTouchMove = (e: React.TouchEvent) => { e.preventDefault(); if (e.touches.length === 1 && dragStartRef.current) { setIsDragging(true); const touch = e.touches[0]; setPosition({ x: touch.clientX - dragStartRef.current.x, y: touch.clientY - dragStartRef.current.y }); } else if (e.touches.length === 2 && lastPinchDistRef.current) { const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); const delta = dist / lastPinchDistRef.current; setScale(s => Math.min(Math.max(s * delta, 0.5), 3)); lastPinchDistRef.current = dist; } };
    const handleTouchEnd = () => { dragStartRef.current = null; lastPinchDistRef.current = null; setTimeout(() => setIsDragging(false), 50); };
    const zoomIn = () => setScale(s => Math.min(s + 0.2, 3));
    const zoomOut = () => setScale(s => Math.max(s - 0.2, 0.5));
    const reset = () => { setScale(1); setPosition({ x: 0, y: 0 }); };

    return (
        <div className="flex flex-col w-full sm:w-auto max-w-[95vw] sm:max-w-[85vw] md:max-w-[1000px] h-fit max-h-[60vh] bg-background/95 backdrop-blur-2xl rounded-xl border border-border/60 shadow-2xl overflow-hidden">
            
            {/* HEADER */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-muted/20 shrink-0 z-20">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
                        {headerInfo.icon}
                    </div>
                    <div className="flex flex-col overflow-hidden min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground truncate">{headerInfo.title}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-bold shrink-0">
                                {headerInfo.badge}
                            </span>
                        </div>
                        {headerInfo.subtitle && (
                            <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[200px] sm:max-w-[400px]" title={headerInfo.subtitle}>
                                {headerInfo.subtitle}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 ml-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-background/80 shrink-0 ml-2" 
                                    onClick={() => setShowGrid(!showGrid)}
                                >
                                    {showGrid ? <Grid3x3 className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                                {showGrid ? "Hide Grid" : "Show Grid"}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <Separator orientation="vertical" className="h-5 bg-border/50" />

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 rounded-full" 
                                    onClick={onClose}
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Close Map</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </div>

            {/* CANVAS */}
            <div 
                ref={containerRef}
                className="relative flex-1 w-full overflow-hidden bg-background/30 cursor-grab active:cursor-grabbing touch-none select-none min-h-[300px]"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={handleBackgroundClick}
            >
                <div className="absolute top-3 right-3 z-50 flex items-center gap-1 bg-background/90 backdrop-blur-xl border border-border/50 rounded-full p-1.5 shadow-lg">
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted" onClick={zoomOut} disabled={scale <= 0.5}><ZoomOut className="w-3.5 h-3.5" /></Button>
                    <span className="text-[10px] font-mono w-8 text-center tabular-nums text-foreground font-semibold select-none">{Math.round(scale * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted" onClick={zoomIn} disabled={scale >= 3}><ZoomIn className="w-3.5 h-3.5" /></Button>
                    <div className="w-px h-3 bg-border mx-1" />
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-muted" onClick={reset}><RotateCcw className="w-3.5 h-3.5" /></Button>
                </div>

                <div 
                    className="absolute inset-0 w-[200%] h-[200%] -left-[50%] -top-[50%] pointer-events-none transition-opacity duration-300"
                    style={{ 
                        opacity: showGrid ? 0.15 : 0, 
                        backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
                        backgroundSize: `${20 * scale}px ${20 * scale}px`,
                        transform: `translate(${position.x % (20 * scale)}px, ${position.y % (20 * scale)}px)`,
                        color: 'var(--foreground)'
                    }} 
                />

                <div 
                    className="flex flex-col items-center justify-center p-20 min-w-max min-h-max origin-center transition-transform duration-75 ease-out antialiased backface-hidden"
                    style={{ 
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    }}
                >
                    <div className="flex flex-col gap-4 relative z-10">
                        {treeData.map((node, index) => (
                            <MindMapNode
                                key={node.id}
                                node={node}
                                onNavigate={onNavigate}
                                onDrillDown={onDrillDown}
                                activeTurnId={activeTurnId}
                                depth={0}
                                isFirst={index === 0}
                                isLast={index === treeData.length - 1}
                                hasSiblings={treeData.length > 1}
                                isDragging={isDragging}
                                activeTooltipId={activeTooltipId}
                                setActiveTooltipId={setActiveTooltipId}
                            />
                        ))}
                    </div>
                </div>
                
                <div className="absolute bottom-2 left-2 z-40 bg-background/80 backdrop-blur-md px-2 py-1 rounded-md text-[9px] text-muted-foreground border pointer-events-none animate-out fade-out duration-1000 delay-[4000ms] fill-mode-forwards select-none">
                    <Move className="w-3 h-3 inline mr-1" /> Pan & Pinch to Zoom
                </div>
            </div>
        </div>
    )
}

function MindMapNode({
    node,
    onNavigate,
    onDrillDown,
    activeTurnId,
    depth,
    isFirst,
    isLast,
    hasSiblings,
    isDragging,
    activeTooltipId,
    setActiveTooltipId
}: {
    node: TreeNode,
    onNavigate: (id: string) => void,
    onDrillDown: (pid: string, num: string, title: string, model: string, desc?: string) => void,
    activeTurnId: string | null,
    depth: number,
    isFirst: boolean,
    isLast: boolean,
    hasSiblings: boolean,
    isDragging: boolean,
    activeTooltipId: string | null,
    setActiveTooltipId: (id: string | null) => void
}) {
    const isReal = node.type === 'real';
    const isActive = isReal && node.turnId === activeTurnId;
    const hasChildren = node.children && node.children.length > 0;
    
    const isOpen = activeTooltipId === node.id;
    const isTouch = useIsTouch(); 

    const [isExpanded, setIsExpanded] = useState(node.isExpandedDefault || isActive);

    useEffect(() => {
        if (isActive && hasChildren) setIsExpanded(true)
    }, [isActive, hasChildren])

    const rawTitle = cleanGoalTitle(node.title);
    const shortTitle = rawTitle.length > 25 ? rawTitle.substring(0, 25) + "..." : rawTitle;
    const rawTooltipContent = node.description || node.title;
    const tooltipText = cleanGoalTitle(rawTooltipContent);
    const badgeText = node.label.replace("Step ", "");

    const CONNECTOR_TOP = "top-[21px]" 
    const CONNECTOR_HEIGHT_FIRST = "h-[calc(100%-21px)]"
    const CONNECTOR_HEIGHT_LAST = "h-[21px]"

    // --- SIMPLIFIED HANDLERS FOR TOGGLE BEHAVIOR ---
    const handleBadgeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDragging) return;
        
        // Only toggle on touch devices (mobile/tablet)
        if (isTouch) {
            setActiveTooltipId(isOpen ? null : node.id);
        }
    };

    const handleBadgeHover = () => {
        // Only open on hover for non-touch devices (desktop)
        if (!isTouch && !isDragging) {
            setActiveTooltipId(node.id);
        }
    };

    const handleBadgeLeave = () => {
        // Only close on hover leave for non-touch devices (desktop)
        if (!isTouch && !isDragging) {
            setActiveTooltipId(null);
        }
    };

    return (
        <div className="flex flex-col sm:flex-row items-start group relative">

            <div className="relative flex flex-col items-center mr-0 sm:mr-8 mb-2 sm:mb-0 z-20">
                <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={(e) => {
                        if (!isDragging && isReal && node.turnId) {
                            onNavigate(node.turnId);
                        }
                    }}
                    className={cn(
                        "relative flex items-center gap-2 p-1.5 pr-3 rounded-lg border transition-all duration-300 w-[190px] shrink-0 shadow-sm select-none bg-background",
                        isReal 
                            ? (isActive ? "bg-primary/10 border-primary shadow-[0_0_20px_-10px_rgba(124,58,237,0.5)] ring-1 ring-primary/40" : "bg-card hover:bg-muted/50 border-border/60 hover:border-primary/30")
                            : "bg-muted/10 border-dashed border-border/40 opacity-70 cursor-default",
                        isDragging ? "cursor-grabbing" : (isReal ? "cursor-pointer" : "cursor-default")
                    )}
                >
                    <div 
                        onClick={handleBadgeClick}
                        onMouseEnter={handleBadgeHover}
                        onMouseLeave={handleBadgeLeave}
                        className={cn(
                            "flex items-center justify-center h-6 min-w-[1.25rem] px-1.5 rounded-full shrink-0 transition-colors shadow-inner text-[9px] font-mono font-bold border",
                            isTouch ? "cursor-pointer" : "cursor-help",
                            isReal
                                ? (isActive ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-muted/80")
                                : "bg-transparent text-muted-foreground border-border/50 hover:bg-muted/50"
                        )}
                    >
                        {badgeText}
                    </div>
                    
                    <TooltipProvider delayDuration={0}>
                        <Tooltip 
                            open={isOpen} 
                            onOpenChange={(open) => {
                                // Allow library to close tooltip (e.g., via Escape key)
                                if (!open) setActiveTooltipId(null);
                            }}
                        >
                            <TooltipTrigger asChild>
                                <div className="absolute inset-0 pointer-events-none" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px]">
                                <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-black/10">
                                    {isReal ? <GitCommitHorizontal className="w-3 h-3 text-emerald-600" /> : <CircleDashed className="w-3 h-3 opacity-50" />}
                                    <span className="font-bold tracking-wide uppercase opacity-70">
                                        {isReal ? "Expanded" : "Pending"}
                                    </span>
                                </div>
                                <div className="leading-relaxed font-medium opacity-90 mb-2 select-text text-xs">
                                    {tooltipText}
                                </div>
                                
                                {!isReal && node.parentId && node.modelId && node.stepNumber && (
                                    <div className="flex items-center justify-end mt-2 pt-2 border-t border-black/5">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation(); 
                                                if(!isDragging) onDrillDown(node.parentId!, node.stepNumber!, node.title, node.modelId!, node.description);
                                            }}
                                            className="group/link flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold transition-colors cursor-pointer pointer-events-auto"
                                        >
                                            <Network className="w-3 h-3" />
                                            <span>Break Down</span>
                                            <ArrowRight className="w-3 h-3 opacity-50 group-hover/link:translate-x-0.5 transition-transform" />
                                        </button>
                                    </div>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <div className="flex-1 overflow-hidden min-w-0 pointer-events-none">
                        <div className="flex items-center justify-between">
                            <span className={cn(
                                "text-[10px] font-bold truncate", 
                                isReal ? (isActive ? "text-primary" : "text-foreground") : "text-muted-foreground italic"
                            )}>
                                {isReal ? "Completed" : "Step"}
                            </span>
                            
                            {hasChildren && (
                                <div
                                    role="button"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        if(!isDragging) setIsExpanded(!isExpanded)
                                    }}
                                    className={cn(
                                        "w-4 h-4 flex items-center justify-center rounded-full hover:bg-muted transition-transform ml-1 pointer-events-auto cursor-pointer",
                                        isExpanded ? "rotate-90 sm:rotate-0 bg-primary/10 text-primary" : "text-muted-foreground"
                                    )}
                                >
                                    {isExpanded
                                        ? <ChevronLeft className="w-2.5 h-2.5 hidden sm:block" />
                                        : <ChevronRight className="w-2.5 h-2.5" />
                                    }
                                    {isExpanded && <ChevronRight className="w-2.5 h-2.5 sm:hidden transform rotate-90" />}
                                </div>
                            )}
                            
                            {!isReal && <Lock className="w-2.5 h-2.5 text-muted-foreground/40" />}
                        </div>
                        <p className={cn(
                            "text-[9px] truncate font-medium -mt-0.5",
                            isReal ? "text-muted-foreground/80" : "text-muted-foreground/50"
                        )}>
                            {shortTitle}
                        </p>
                    </div>
                </motion.div>
            </div>

            <AnimatePresence>
                {isExpanded && hasChildren && (
                    <motion.div
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={cn(
                            "flex flex-col gap-2 relative",
                            "sm:ml-0 ml-4 pl-2 sm:pl-0 border-l-2 sm:border-l-0 border-dashed border-primary/15 sm:border-none"
                        )}
                    >
                        <div className="sm:hidden text-[8px] font-bold text-primary/50 uppercase tracking-widest mb-1 pl-1 flex items-center gap-1 opacity-70">
                            <CornerDownRight className="w-2.5 h-2.5" /> Sub-Tasks
                        </div>

                        {node.children.map((child, i) => {
                            const isFirstChild = i === 0;
                            const isLastChild = i === node.children.length - 1;
                            const hasMultipleChildren = node.children.length > 1;

                            return (
                                <div key={child.id} className="relative flex items-center">
                                    <div className={`hidden sm:block absolute -left-8 w-4 h-px bg-border/40 ${CONNECTOR_TOP}`} />
                                    {hasMultipleChildren && (
                                        <div
                                            className={cn(
                                                "hidden sm:block absolute -left-4 w-px bg-border/40",
                                                isFirstChild ? `${CONNECTOR_TOP} ${CONNECTOR_HEIGHT_FIRST}` :
                                                isLastChild ? `top-0 ${CONNECTOR_HEIGHT_LAST}` :
                                                "top-0 h-full"
                                            )}
                                        />
                                    )}
                                    <div className={`hidden sm:block absolute -left-4 w-4 h-px bg-border/40 ${CONNECTOR_TOP}`} />
                                    {hasMultipleChildren && isFirstChild && (
                                        <div className={`hidden sm:block absolute -left-4 ${CONNECTOR_TOP} w-2 h-2 border-t border-l border-border/40 rounded-tl-lg pointer-events-none`} />
                                    )}
                                    {hasMultipleChildren && isLastChild && (
                                        <div className="hidden sm:block absolute -left-4 top-0 w-2 h-[22px] border-b border-l border-border/40 rounded-bl-lg pointer-events-none" />
                                    )}
                                    <div className={`hidden sm:block absolute left-0 ${CONNECTOR_TOP} -translate-x-1/2 -translate-y-1/2 z-10 bg-background rounded-full border border-border/60 p-[1px] shadow-sm`}>
                                        <ChevronRight className="w-2 h-2 text-muted-foreground/60" />
                                    </div>
                                    
                                    <MindMapNode
                                        node={child}
                                        onNavigate={onNavigate}
                                        onDrillDown={onDrillDown}
                                        activeTurnId={activeTurnId}
                                        depth={depth + 1}
                                        isFirst={i === 0}
                                        isLast={i === node.children.length - 1}
                                        hasSiblings={node.children.length > 1}
                                        isDragging={isDragging}
                                        activeTooltipId={activeTooltipId}
                                        setActiveTooltipId={setActiveTooltipId}
                                    />
                                </div>
                            )
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}