import { useState, useRef, useEffect, useMemo } from "react"
import { AgentState } from "@/types/chat"
import { Card, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BrainCircuit, Check, ChevronDown, Loader2, MoreHorizontal, RefreshCcw, AlertTriangle, Clock, CirclePause, Sparkles, Square, RefreshCw, Search, ArrowRightLeft, Activity, ImageIcon } from "lucide-react"
import { BarChart, Bar, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import Image from "next/image"

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

// --- NEW: IMAGE GENERATION COMPONENT ---
const ImageVisualizer = ({ prompt }: { prompt: string }) => {
    const [isLoading, setIsLoading] = useState(true)
    
    // Use Pollinations.ai for free, unlimited generation (No API Key required)
    // We encode the prompt and use the 'flux' model for high quality
    const imageUrl = useMemo(() => {
        if (!prompt) return ""
        const encoded = encodeURIComponent(prompt)
        return `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=576&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000)}`
    }, [prompt])

    if (!prompt) return null

    return (
        <div className="mt-4 rounded-xl overflow-hidden border border-border/50 bg-muted/20 relative group">
             <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/30 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <ImageIcon className="w-3 h-3" /> Visualized Outcome
            </div>
            <div className="relative aspect-video w-full bg-muted/30">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                )}
                {/* Use standard img tag for external dynamic URLs to avoid Next.js config complexity for random seeds */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                    src={imageUrl} 
                    alt={prompt}
                    className={cn("w-full h-full object-cover transition-opacity duration-700", isLoading ? "opacity-0" : "opacity-100")}
                    onLoad={() => setIsLoading(false)}
                    loading="lazy"
                />
            </div>
            <p className="p-2 text-[10px] text-muted-foreground bg-background/40 italic line-clamp-1">
                "{prompt}"
            </p>
        </div>
    )
}

const AgentChart = ({ steps, status }: { steps: any[], status: string }) => {
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
        <div className="h-32 w-full bg-linear-to-b from-muted/10 to-muted/30 rounded-xl border border-border/40 p-3 min-h-[128px] relative overflow-hidden group">
            <ResponsiveContainer width="100%" height="100%" minWidth={100}>
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
                    {status === 'retrying' ? "System Log" : "Thinking Process"}
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
  else if(state.status === 'error') { StatusIcon = AlertTriangle; statusText = "Error"; statusColor = "text-red-500"; statusBg = "bg-red-500" }
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
         {state.status === 'error' && (
             <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive text-xs flex flex-col gap-2 animate-in fade-in zoom-in-95">
                 <div className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4"/> Connection Failed</div>
                 <p className="opacity-90">{state.thinking || "Unknown error."}</p>
                 <Button variant="outline" size="sm" onClick={() => onSwitch(state.modelId)} className="mt-1 border-destructive/30 hover:bg-destructive/10 w-fit h-7 text-xs"><RefreshCcw className="w-3 h-3 mr-2"/> Retry</Button>
             </div>
         )}
         
         {state.status !== 'error' && (
             <ThinkingLog thinking={state.thinking} status={state.status} />
         )}
         
         {state.jsonResult?.message && (
             <div className="text-sm leading-relaxed text-foreground/90 animate-in fade-in slide-in-from-bottom-2 selection:bg-primary/20">
                 {state.jsonResult.message}
             </div>
         )}

         {/* 4. RENDER IMAGE IF AVAILABLE */}
         {state.jsonResult?.visual_prompt && (
             <ImageVisualizer prompt={state.jsonResult.visual_prompt} />
         )}

         {state.jsonResult?.steps && (<AgentChart steps={state.jsonResult.steps} status={state.status} />)}
      </div>
    </Card>
  )
}