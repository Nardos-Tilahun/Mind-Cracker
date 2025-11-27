import { useState, useRef, useEffect, useMemo } from "react"
import { AgentState } from "@/types/chat"
import { Card, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BrainCircuit, Check, ChevronDown, Loader2, MoreHorizontal, RefreshCcw, AlertTriangle, Clock, CirclePause, Sparkles, Square, RefreshCw, Search, ArrowRightLeft, Activity } from "lucide-react"
import { BarChart, Bar, ResponsiveContainer, Cell, Tooltip, XAxis } from 'recharts'
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

interface Props {
    state: AgentState
    modelName: string
    allModels: any[]
    onSwitch: (id: string) => void
    isLastTurn: boolean
    activeModelIds?: string[]
    onStop: () => void
}

// --- VISUAL HELPERS ---
const getComplexityColor = (score: number) => {
    if (score <= 3) return "var(--color-emerald-500)"; // Easy
    if (score <= 7) return "var(--color-amber-500)";   // Medium
    return "var(--color-rose-500)";                    // Hard
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
    const totalComplexity = steps.reduce((acc, curr) => acc + (curr.complexity || 0), 0);
    const avgComplexity = Math.round(totalComplexity / (steps.length || 1));

    return (
    <div className={cn("space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-2", status === 'stopped' && "opacity-80 grayscale-[0.5]")}>
        
        {/* Header Stat */}
        <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Strategy Breakdown
            </h4>
            <Badge variant="outline" className="text-[10px] font-mono gap-1 bg-background/50">
                AVG DIFFICULTY: <span style={{ color: getComplexityColor(avgComplexity) }}>{avgComplexity}/10</span>
            </Badge>
        </div>

        {/* The Graph */}
        <div className="h-36 w-full bg-linear-to-b from-muted/10 to-muted/30 rounded-2xl border border-border/40 p-4 min-h-[144px] relative overflow-hidden group">
            <ResponsiveContainer width="100%" height="100%" minWidth={100}>
                <BarChart data={steps} barSize={24}>
                    <Tooltip cursor={{fill: 'var(--muted)', opacity: 0.1}} content={<CustomChartTooltip />} isAnimationActive={true} />
                    <Bar dataKey="complexity" radius={[6,6,6,6]} animationDuration={1200}>
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
        </div>

        {/* The Timeline List */}
        <div className="relative space-y-0 ml-2">
            {/* Vertical Line */}
            <div className="absolute left-[11px] top-2 bottom-4 w-[2px] bg-border/50" />

            {steps.map((s: any, i: number) => (
                <div key={i} className="group relative flex items-start gap-4 pb-6 last:pb-0">
                    {/* Node Dot */}
                    <div className={cn(
                        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-background shadow-sm transition-all group-hover:scale-110",
                        "bg-muted text-[10px] font-bold text-muted-foreground group-hover:border-primary/20 group-hover:text-foreground"
                    )}>
                        {i + 1}
                    </div>
                    
                    {/* Card Content */}
                    <div className="flex-1 -mt-1 p-3 rounded-xl bg-card/40 border border-border/40 hover:bg-card hover:border-border transition-all duration-300">
                        <div className="flex justify-between items-start gap-2 mb-1">
                            <span className="text-sm font-semibold text-foreground leading-tight">{s.step}</span>
                            <span className="text-[10px] font-mono opacity-50 shrink-0">Diff: {s.complexity}</span>
                        </div>
                        {s.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed">
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
        if (isOpen && (status === 'reasoning' || status === 'synthesizing' || status === 'retrying') && logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight 
        }
    }, [thinking, status, isOpen])

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group border border-primary/10 rounded-xl bg-primary/5 overflow-hidden transition-all hover:border-primary/20">
            <CollapsibleTrigger className="flex w-full items-center justify-between p-3 hover:bg-primary/5 transition-colors cursor-pointer select-none">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary/80 uppercase tracking-tight">
                    <BrainCircuit className={cn("w-4 h-4", (status === 'reasoning' || status === 'retrying') && "text-primary animate-pulse")}/>
                    {status === 'retrying' ? "System Log" : "Internal Reasoning"}
                    {!isOpen && (status === 'reasoning' || status === 'retrying') && (
                        <span className="ml-2 text-[10px] text-muted-foreground font-normal lowercase animate-in fade-in">(processing...)</span>
                    )}
                </div>
                <ChevronDown className={cn("w-4 h-4 text-primary/50 transition-transform duration-300", isOpen && "rotate-180")}/>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div ref={logRef} className="max-h-[200px] overflow-y-auto p-4 text-[11px] font-mono leading-relaxed text-muted-foreground/90 bg-background/40 border-t border-primary/10 whitespace-pre-wrap selection:bg-primary/20">
                    {thinking || <span className="animate-pulse text-primary/60">Initializing...</span>}
                    {(status === 'reasoning' || status === 'retrying') && <span className="inline-block w-1.5 h-3 ml-1 align-middle bg-primary animate-pulse"/>}
                </div>
            </CollapsibleContent>
        </Collapsible>
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
  else if(state.status === 'synthesizing') { StatusIcon = Sparkles; statusText = "Synthesizing"; statusColor = "text-orange-500"; statusBg = "bg-orange-500" }
  else if(state.status === 'complete') { StatusIcon = Check; statusText = "Completed"; statusColor = "text-emerald-500"; statusBg = "bg-emerald-500" }
  else if(state.status === 'stopped') { StatusIcon = CirclePause; statusText = "Interrupted"; statusColor = "text-amber-500"; statusBg = "bg-amber-500" }
  else if(state.status === 'error') { StatusIcon = AlertTriangle; statusText = "Failed"; statusColor = "text-red-500"; statusBg = "bg-red-500" }
  else if(state.status === 'waiting') { StatusIcon = Loader2; statusText = "Waiting"; statusColor = "text-muted-foreground"; statusBg = "bg-zinc-400" }
  else if(state.status === 'retrying' as any) { StatusIcon = ArrowRightLeft; statusText = "Switching Agent"; statusColor = "text-amber-600"; statusBg = "bg-amber-600" }

  const isRunning = ['reasoning', 'synthesizing', 'waiting', 'retrying'].includes(state.status)

  const filteredModels = useMemo(() => {
      if(!search) return allModels
      return allModels.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.provider.toLowerCase().includes(search.toLowerCase()))
  }, [allModels, search])

  return (
    <Card className={cn(
        "flex flex-col min-h-[400px] max-h-[700px] overflow-hidden border shadow-xl bg-card/80 backdrop-blur-xl transition-all duration-300", 
        state.status === 'reasoning' ? "ring-2 ring-indigo-500/20 border-indigo-500/30 shadow-indigo-500/5" : 
        state.status === 'synthesizing' ? "ring-2 ring-orange-500/20 border-orange-500/30 shadow-orange-500/5" : 
        state.status === 'retrying' as any ? "ring-2 ring-amber-500/20 border-amber-500/30" : 
        state.status === 'complete' ? "border-emerald-500/20 shadow-emerald-500/5" :
        "border-border"
    )}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 bg-muted/40 border-b h-14 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
           <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm shrink-0 transition-all duration-500", (state.status === 'reasoning' || state.status === 'synthesizing' || state.status === 'retrying' as any) ? `${statusBg} animate-pulse scale-110` : statusBg)} />
           <div className="flex flex-col overflow-hidden">
               <span className="text-sm font-bold truncate text-foreground tracking-tight">{modelName}</span>
               <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                   <span className={cn(statusColor, "flex items-center gap-1 transition-colors duration-300")}><StatusIcon className={cn("w-3 h-3", (state.status === 'reasoning' || state.status === 'synthesizing' || state.status === 'retrying' as any) && "animate-spin")} />{statusText}</span>
                   <span className="w-px h-2 bg-border"/><span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3" /> {elapsed}s</span>
               </div>
           </div>
        </div>
        <div className="flex items-center gap-1">
            {isRunning ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={onStop} title="Stop Generation"><Square className="w-4 h-4 fill-current" /></Button>
            ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors" onClick={() => onSwitch(state.modelId)} title="Regenerate"><RefreshCw className="w-4 h-4" /></Button>
            )}
            
            {isLastTurn && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-background/80"><MoreHorizontal className="w-4 h-4"/></Button></DropdownMenuTrigger>
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
                            {filteredModels.length === 0 && <div className="text-xs text-center py-2 text-muted-foreground">No models found</div>}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-linear-to-b from-transparent to-background/5">
         {state.status === 'error' && (<div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive text-xs flex flex-col gap-2"><div className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4"/> Generation Failed</div><p className="opacity-90">{state.thinking || "Unknown error."}</p><Button variant="outline" size="sm" onClick={() => onSwitch(state.modelId)} className="mt-2 border-destructive/30 hover:bg-destructive/10 w-fit"><RefreshCcw className="w-3 h-3 mr-2"/> Retry</Button></div>)}
         
         {(state.thinking || ['reasoning', 'stopped', 'retrying'].includes(state.status as any)) && state.status !== 'error' && (
             <ThinkingLog thinking={state.thinking} status={state.status} />
         )}
         
         {state.jsonResult?.message && (<div className="text-sm leading-7 text-foreground/90 p-1 animate-in fade-in slide-in-from-bottom-2">{state.jsonResult.message}</div>)}
         {state.jsonResult?.steps && (<AgentChart steps={state.jsonResult.steps} status={state.status} />)}
      </div>
    </Card>
  )
}