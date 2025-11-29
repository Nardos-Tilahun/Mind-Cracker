import { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react"
import { AgentState } from "@/types/chat"
import { Card, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BrainCircuit, Check, ChevronDown, Loader2, MoreHorizontal, RefreshCcw, AlertTriangle, Clock, CirclePause, Sparkles, Square, RefreshCw, Search, ArrowRightLeft, Activity, ZapOff, Hourglass, Info, BatteryWarning, Copy } from "lucide-react"
import { BarChart, Bar, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"

interface Props {
    state: AgentState
    modelName: string
    allModels: any[]
    onSwitch: (id: string) => void
    isLastTurn: boolean
    activeModelIds?: string[]
    onStop: () => void
}

const getComplexityColor = (score: number) => {
    if (score <= 3) return "var(--color-emerald-500)";
    if (score <= 7) return "var(--color-amber-500)";
    return "var(--color-rose-500)";
}

const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const color = getComplexityColor(data.complexity);
      return (
        <div className="z-50 min-w-40 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-md px-3 py-2 text-xs text-white shadow-2xl animate-in fade-in-0 zoom-in-95">
          <p className="font-semibold mb-1 line-clamp-1">{data.step}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="opacity-70">Difficulty</span>
            <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                <span className="font-mono font-bold">{data.complexity}/10</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
};

const AgentChart = ({ steps, status }: { steps: any[], status: string }) => {
    if (!steps || !Array.isArray(steps) || steps.length === 0) return null;

    const containerRef = useRef<HTMLDivElement>(null);
    const [isSafeToRender, setIsSafeToRender] = useState(false);

    useLayoutEffect(() => {
        if (!containerRef.current) return;

        const checkDimensions = () => {
            const { clientWidth, clientHeight } = containerRef.current!;
            if (clientWidth > 0 && clientHeight > 0) {
                setIsSafeToRender(true);
            }
        };

        checkDimensions();

        const observer = new ResizeObserver(() => {
             requestAnimationFrame(checkDimensions);
        });
        
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const totalComplexity = steps.reduce((acc, curr) => acc + (curr.complexity || 0), 0);
    const avgComplexity = Math.round(totalComplexity / (steps.length || 1));

    return (
    <div className={cn("space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-4 mb-2", status === 'stopped' && "opacity-80 grayscale-[0.5]")}>
        <div className="flex items-center justify-between px-1">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Strategy Map
            </h4>
            <Badge variant="outline" className="text-[9px] font-mono gap-1 bg-background/50 h-5 px-2">
                AVG DIFF: <span style={{ color: getComplexityColor(avgComplexity) }}>{avgComplexity}/10</span>
            </Badge>
        </div>
        
        <div 
            ref={containerRef}
            className="h-[128px] w-full bg-linear-to-b from-muted/10 to-muted/30 rounded-xl border border-border/40 p-3 relative overflow-hidden group" 
            style={{ width: '100%', minHeight: '128px' }}
        >
            {isSafeToRender ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={10} minHeight={10}>
                    <BarChart data={steps} barSize={20}>
                        <Tooltip cursor={{fill: 'var(--muted)', opacity: 0.1}} content={<CustomChartTooltip />} isAnimationActive={true} />
                        <Bar dataKey="complexity" radius={[4,4,4,4]} animationDuration={1000}>
                            {steps.map((e:any, i:number) => (
                                <Cell
                                    key={i}
                                    fill={getComplexityColor(e.complexity)}
                                    className="opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="w-full h-full animate-pulse bg-muted/5 rounded-lg" />
            )}
        </div>

        <div className="relative space-y-0 ml-2">
            <div className="absolute left-[9px] top-2 bottom-4 w-[2px] bg-border/40" />
            {steps.map((s: any, i: number) => (
                <div key={i} className="group relative flex items-start gap-3 pb-5 last:pb-0">
                    <div className={cn(
                        "relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-background shadow-xs transition-all duration-300",
                        "bg-muted text-[9px] font-bold text-muted-foreground group-hover:scale-110 group-hover:border-primary/30 group-hover:text-foreground group-hover:bg-background ring-2 ring-transparent group-hover:ring-primary/5"
                    )}>
                        {i + 1}
                    </div>
                    <div className="flex-1 -mt-1.5 p-3 rounded-lg bg-card/40 border border-border/30 hover:bg-card/80 hover:border-border/60 transition-all duration-300">
                        <div className="flex justify-between items-start gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground leading-tight">{s.step}</span>
                        </div>
                        {s.description && (
                            <p className="text-xs text-muted-foreground/90 leading-relaxed">
                                {s.description}
                            </p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    </div>
    )
}

const ThinkingLog = ({ thinking, status }: { thinking: string, status: string }) => {
    const [isOpen, setIsOpen] = useState(false)
    const logRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (isOpen && (status === 'reasoning' || status === 'retrying') && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight
        }
    }, [thinking, status, isOpen])

    if (!thinking || thinking.trim().length < 5) return null;

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group border border-primary/10 rounded-lg bg-primary/5 overflow-hidden transition-all hover:border-primary/20 mb-4">
            <CollapsibleTrigger className="flex w-full items-center justify-between p-2.5 hover:bg-primary/5 transition-colors cursor-pointer select-none">
                <div className="flex items-center gap-2 text-xs font-medium text-primary/80 uppercase tracking-tight">
                    <BrainCircuit className={cn("w-3.5 h-3.5", (status === 'reasoning' || status === 'retrying') && "text-primary animate-pulse")}/>
                    {status === 'retrying' ? "System Log & Handovers" : "Thinking Process"}
                    {!isOpen && (status === 'reasoning' || status === 'retrying') && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground/80 font-normal normal-case animate-pulse">
                            &mdash; analyzing...
                        </span>
                    )}
                </div>
                <ChevronDown className={cn("w-3.5 h-3.5 text-primary/50 transition-transform duration-300", isOpen && "rotate-180")}/>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div ref={logRef} className="max-h-[180px] overflow-y-auto p-3 text-[10px] font-mono leading-relaxed text-muted-foreground/90 bg-background/40 border-t border-primary/10 whitespace-pre-wrap selection:bg-primary/20 custom-scrollbar">
                    {thinking}
                    {(status === 'reasoning' || status === 'retrying') && <span className="inline-block w-1 h-3 ml-1 align-middle bg-primary animate-pulse"/>}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

// --- IMPROVED: Always Visible Copy Button ---
const MessageContent = ({ content, steps }: { content: string, steps?: any[] }) => {
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = async () => {
        try {
            let fullText = content;

            // Append steps nicely formatted if they exist
            if (steps && Array.isArray(steps) && steps.length > 0) {
                fullText += "\n\n### Strategic Plan:\n";
                steps.forEach((step, index) => {
                    fullText += `\n${index + 1}. **${step.step}** (Difficulty: ${step.complexity}/10)\n   ${step.description}\n`;
                });
            }

            await navigator.clipboard.writeText(fullText);
            setIsCopied(true);
            toast.success("Full strategy copied to clipboard");
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            toast.error("Failed to copy text");
        }
    };

    return (
        <div className="relative group/message rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-muted/30">
            <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap selection:bg-primary/20 pr-8">
                {content}
            </div>
            
            {/* Copy Button - Always visible, but subtle when idle */}
            <div className="absolute top-0 right-0">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopy}
                    className="h-6 w-6 text-muted-foreground/40 hover:text-foreground hover:bg-background/80 transition-all duration-200"
                    title="Copy Strategy"
                >
                    <AnimatePresence mode="wait" initial={false}>
                        {isCopied ? (
                            <motion.div
                                key="check"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                            >
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="copy"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                            >
                                <Copy className="w-3.5 h-3.5" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Button>
            </div>
        </div>
    );
};

const ErrorView = ({ state, onRetry }: { state: AgentState, onRetry: () => void }) => {
    const isTimeout = state.thinking.includes("timed out") || state.thinking.includes("taking too long");
    const isDailyLimit = state.thinking.includes("Daily Limit Reached") || (state.jsonResult?.message && state.jsonResult.message.includes("Daily Limit"));

    const message = state.jsonResult?.message || "The AI encountered an anomaly.";

    if (isDailyLimit) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border border-blue-500/20 bg-linear-to-br from-blue-500/5 to-background p-6 relative overflow-hidden"
            >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                        style={{ backgroundImage: 'radial-gradient(#3b82f6 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                </div>

                <div className="relative z-10 flex flex-col items-center text-center gap-4">
                    <div className="p-3 rounded-full bg-blue-500/10 border border-blue-500/20 shrink-0">
                        <BatteryWarning className="w-8 h-8 text-blue-500" />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-lg font-bold text-foreground tracking-tight">
                            Daily Intelligence Limit Reached
                        </h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                            Our free AI fleet has exhausted all available API keys for the day. This ensures high-quality service remains sustainable.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2 w-full max-w-xs pt-2">
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-2 rounded-lg border border-blue-500/20">
                            Resets at 00:00 UTC (Tomorrow)
                        </div>
                        <p className="text-[10px] text-muted-foreground/60 italic">
                            Tip: Try again later, or use your own API key in a local instance.
                        </p>
                    </div>
                </div>
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl border border-destructive/20 bg-linear-to-br from-destructive/5 to-background p-5 relative overflow-hidden"
        >
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(#ff0000 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>

            <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20 shrink-0">
                        {isTimeout ? <Hourglass className="w-6 h-6 text-destructive" /> : <ZapOff className="w-6 h-6 text-destructive" />}
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-destructive tracking-tight">
                                {isTimeout ? "Temporal Loop Detected" : "Intelligence Grid Offline"}
                            </h3>
                            <Badge variant="outline" className="text-[9px] border-destructive/30 text-destructive/80 h-5">
                                API ERROR
                            </Badge>
                        </div>
                        <p className="text-sm text-foreground/90 font-medium leading-relaxed">
                            {message}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-600 dark:text-amber-400">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>
                        <strong>Why?</strong> We run on free, high-tier models. Sometimes they hallucinate, loop, or ghost us. It&apos;s the price of free genius.
                    </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRetry}
                        className="h-8 text-xs border-destructive/20 hover:bg-destructive/5 hover:text-destructive transition-colors group"
                    >
                        <RefreshCcw className="w-3.5 h-3.5 mr-2 group-hover:rotate-180 transition-transform duration-500"/>
                        Restart Logic
                    </Button>
                </div>
            </div>
        </motion.div>
    )
}

export function AgentCard({ state, modelName, allModels, onSwitch, isLastTurn, activeModelIds = [], onStop }: Props) {
  const [elapsed, setElapsed] = useState("0.0")
  const [search, setSearch] = useState("")

  useEffect(() => {
      let interval: NodeJS.Timeout
      if (['reasoning', 'synthesizing', 'retrying'].includes(state.status)) interval = setInterval(() => setElapsed(((Date.now() - state.metrics.startTime) / 1000).toFixed(1)), 100)
      else if (state.metrics.endTime) setElapsed(((state.metrics.endTime - state.metrics.startTime) / 1000).toFixed(1))
      return () => clearInterval(interval)
  }, [state.status, state.metrics])

  let StatusIcon = Loader2, statusText = "Initializing...", statusColor = "text-primary", statusBg = "bg-primary"

  if(state.status === 'reasoning') { StatusIcon = BrainCircuit; statusText = "Reasoning"; statusColor = "text-indigo-500"; statusBg = "bg-indigo-500" }
  else if(state.status === 'synthesizing') { StatusIcon = Sparkles; statusText = "Drafting"; statusColor = "text-orange-500"; statusBg = "bg-orange-500" }
  else if(state.status === 'complete') { StatusIcon = Check; statusText = "Done"; statusColor = "text-emerald-500"; statusBg = "bg-emerald-500" }
  else if(state.status === 'stopped') { StatusIcon = CirclePause; statusText = "Paused"; statusColor = "text-amber-500"; statusBg = "bg-amber-500" }
  else if(state.status === 'error') { StatusIcon = AlertTriangle; statusText = "Failed"; statusColor = "text-destructive"; statusBg = "bg-destructive" }
  else if(state.status === 'waiting') { StatusIcon = Loader2; statusText = "Queue"; statusColor = "text-muted-foreground"; statusBg = "bg-zinc-400" }
  else if(state.status === 'retrying' as any) { StatusIcon = ArrowRightLeft; statusText = "Retrying"; statusColor = "text-amber-600"; statusBg = "bg-amber-600" }

  const isRunning = ['reasoning', 'synthesizing', 'waiting', 'retrying'].includes(state.status)

  const filteredModels = useMemo(() => {
      if(!search) return allModels
      return allModels.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()))
  }, [allModels, search])

  return (
    <Card className={cn(
        "flex flex-col h-fit w-full border shadow-sm bg-card/95 backdrop-blur-xl transition-[box-shadow,border] duration-300 ease-out",
        state.status === 'reasoning' ? "ring-1 ring-indigo-500/20 border-indigo-500/20 shadow-indigo-500/5" :
        state.status === 'synthesizing' ? "ring-1 ring-orange-500/20 border-orange-500/20 shadow-orange-500/5" :
        state.status === 'retrying' as any ? "ring-1 ring-amber-500/20 border-amber-500/30" :
        state.status === 'complete' ? "border-emerald-500/20 shadow-emerald-500/5" :
        state.status === 'error' ? "border-destructive/20 shadow-destructive/5" :
        "border-border"
    )}>
      <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 bg-muted/30 border-b border-border/40 h-12 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
           <div className={cn("w-2 h-2 rounded-full shadow-sm shrink-0 transition-all duration-500", (isRunning) ? `${statusBg} animate-pulse scale-110` : statusBg)} />
           <div className="flex flex-col overflow-hidden">
               <span className="text-xs font-bold truncate text-foreground tracking-tight">{modelName}</span>
               <div className="flex items-center gap-2 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                   <span className={cn(statusColor, "flex items-center gap-1 transition-colors duration-300")}><StatusIcon className={cn("w-2.5 h-2.5", isRunning && "animate-spin")} />{statusText}</span>
                   <span className="w-px h-2 bg-border"/><span className="flex items-center gap-1 font-mono"><Clock className="w-2.5 h-2.5" /> {elapsed}s</span>
               </div>
           </div>
        </div>
        <div className="flex items-center gap-1">
            {isRunning ? (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={onStop} title="Stop Generation"><Square className="w-3 h-3 fill-current" /></Button>
            ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary transition-colors" onClick={() => onSwitch(state.modelId)} title="Regenerate"><RefreshCw className="w-3.5 h-3.5" /></Button>
            )}

            {isLastTurn && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-background/80"><MoreHorizontal className="w-4 h-4"/></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[280px]">
                        <div className="p-2 sticky top-0 bg-popover z-10 border-b">
                            <div className="relative">
                                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    placeholder="Search models..."
                                    className="h-8 pl-8 text-xs bg-background/50"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                            {filteredModels.map(m => (
                                <DropdownMenuItem
                                    key={m.id}
                                    onClick={() => onSwitch(m.id)}
                                    disabled={activeModelIds.includes(m.id)}
                                    className="cursor-pointer"
                                >
                                    <div className="flex flex-col gap-0.5 overflow-hidden w-full">
                                        <span className={cn("text-xs font-medium truncate", activeModelIds.includes(m.id) && "opacity-50")}>{m.name}</span>
                                        <span className="text-[10px] text-muted-foreground opacity-70">{m.provider}</span>
                                    </div>
                                    {m.id === state.modelId && <Check className="w-3 h-3 ml-2 shrink-0 text-primary"/>}
                                </DropdownMenuItem>
                            ))}
                        </div>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
      </CardHeader>

      <div className="p-4 space-y-4">
         {/* FAILURE STATE UI */}
         {state.status === 'error' ? (
             <ErrorView state={state} onRetry={() => onSwitch(state.modelId)} />
         ) : (
             <>
                 {/* Normal Flow */}
                 <ThinkingLog thinking={state.thinking} status={state.status} />

                 {/* UPDATED: Pass steps to allow full copy */}
                 {state.jsonResult?.message && (
                     <MessageContent 
                        content={state.jsonResult.message} 
                        steps={state.jsonResult.steps}
                     />
                 )}

                 {/* FIX: Robust Guard clause against crash */}
                 {state.jsonResult?.steps && Array.isArray(state.jsonResult.steps) && state.jsonResult.steps.length > 0 && (<AgentChart steps={state.jsonResult.steps} status={state.status} />)}
             </>
         )}
      </div>
    </Card>
  )
}