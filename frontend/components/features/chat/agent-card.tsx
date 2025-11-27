import { useState, useRef, useEffect } from "react"
import { AgentState } from "@/types/chat"
import { Card, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { BrainCircuit, Check, ChevronDown, Loader2, MoreHorizontal, RefreshCcw, AlertTriangle, Clock, CirclePause, Sparkles, Square, RefreshCw } from "lucide-react"
import { BarChart, Bar, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface Props {
    state: AgentState
    modelName: string
    allModels: any[]
    onSwitch: (id: string) => void
    isLastTurn: boolean
    activeModelIds?: string[]
    onStop: () => void
}

const CustomChartTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="z-50 min-w-32 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95">
          <p className="mb-1.5 text-xs font-semibold leading-none">{data.step}</p>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="uppercase tracking-wider font-medium">Complexity</span>
            <span className="font-mono font-bold text-foreground">{data.complexity}/10</span>
          </div>
        </div>
      );
    }
    return null;
};

const AgentChart = ({ steps, status }: { steps: any[], status: string }) => (
    <div className={cn("space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500", status === 'stopped' && "opacity-80 grayscale-[0.5]")}>
        <div className="h-32 w-full bg-muted/20 rounded-xl border border-border/50 p-3">
            {/* FIXED: Added minWidth to prevent Recharts -1 width error on initial render */}
            <ResponsiveContainer width="100%" height="100%" minWidth={100}>
                <BarChart data={steps}>
                    <Tooltip cursor={{fill: 'var(--muted)', opacity: 0.2}} content={<CustomChartTooltip />} />
                    <Bar dataKey="complexity" radius={[4,4,0,0]} animationDuration={1000}>
                        {steps.map((e:any, i:number) => (<Cell key={i} fill={e.complexity > 7 ? 'var(--color-destructive)' : 'var(--color-primary)'} opacity={0.8} />))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
        <div className="space-y-2.5">
            {steps.map((s: any, i: number) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl border border-border/60 bg-card/50 hover:bg-card transition-colors">
                    <Badge variant="outline" className="h-6 w-6 p-0 flex items-center justify-center shrink-0 rounded-lg bg-background">{i+1}</Badge>
                    <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">{s.step}</span>
                        {s.description && <span className="text-xs text-muted-foreground">{s.description}</span>}
                    </div>
                </div>
            ))}
        </div>
    </div>
)

const ThinkingLog = ({ thinking, status }: { thinking: string, status: string }) => {
    const [isOpen, setIsOpen] = useState(true)
    const logRef = useRef<HTMLDivElement>(null)
    useEffect(() => { if ((status === 'reasoning' || status === 'synthesizing') && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [thinking, status])
    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="group border border-primary/10 rounded-xl bg-primary/5 overflow-hidden transition-all hover:border-primary/20">
            <CollapsibleTrigger className="flex w-full items-center justify-between p-3 hover:bg-primary/5 transition-colors cursor-pointer">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary/80 uppercase tracking-tight"><BrainCircuit className="w-4 h-4"/>Internal Reasoning</div>
                <ChevronDown className={cn("w-4 h-4 text-primary/50 transition-transform duration-300", isOpen && "rotate-180")}/>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div ref={logRef} className="max-h-[200px] overflow-y-auto p-4 text-[11px] font-mono leading-relaxed text-muted-foreground/90 bg-background/40 border-t border-primary/10 whitespace-pre-wrap">
                    {thinking || <span className="animate-pulse text-primary/60">Initializing reasoning logic...</span>}
                    {status === 'reasoning' && <span className="inline-block w-1.5 h-3 ml-1 align-middle bg-primary animate-pulse"/>}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

export function AgentCard({ state, modelName, allModels, onSwitch, isLastTurn, activeModelIds = [], onStop }: Props) {
  const [elapsed, setElapsed] = useState("0.0")
  useEffect(() => {
      let interval: NodeJS.Timeout
      if (['reasoning', 'synthesizing'].includes(state.status)) interval = setInterval(() => setElapsed(((Date.now() - state.metrics.startTime) / 1000).toFixed(1)), 100)
      else if (state.metrics.endTime) setElapsed(((state.metrics.endTime - state.metrics.startTime) / 1000).toFixed(1))
      return () => clearInterval(interval)
  }, [state.status, state.metrics])

  let StatusIcon = Loader2, statusText = "Initializing...", statusColor = "text-primary", statusBg = "bg-primary"
  if(state.status === 'reasoning') { StatusIcon = BrainCircuit; statusText = "Reasoning"; statusColor = "text-indigo-500"; statusBg = "bg-indigo-500" }
  else if(state.status === 'synthesizing') { StatusIcon = Sparkles; statusText = "Synthesizing"; statusColor = "text-orange-500"; statusBg = "bg-orange-500" }
  else if(state.status === 'complete') { StatusIcon = Check; statusText = "Completed"; statusColor = "text-green-500"; statusBg = "bg-green-500" }
  else if(state.status === 'stopped') { StatusIcon = CirclePause; statusText = "Interrupted"; statusColor = "text-amber-500"; statusBg = "bg-amber-500" }
  else if(state.status === 'error') { StatusIcon = AlertTriangle; statusText = "Failed"; statusColor = "text-red-500"; statusBg = "bg-red-500" }
  else if(state.status === 'waiting') { StatusIcon = Loader2; statusText = "Waiting"; statusColor = "text-muted-foreground"; statusBg = "bg-zinc-400" }

  const isRunning = ['reasoning', 'synthesizing', 'waiting'].includes(state.status)

  return (
    <Card className={cn("flex flex-col min-h-[400px] max-h-[700px] overflow-hidden border shadow-lg bg-card/90 backdrop-blur-xl transition-all duration-300", state.status === 'reasoning' ? "ring-2 ring-indigo-500/20 border-indigo-500/30" : state.status === 'synthesizing' ? "ring-2 ring-orange-500/20 border-orange-500/30" : state.status === 'stopped' ? "border-dashed border-amber-500/30" : "border-border")}>
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 bg-muted/30 border-b h-14 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
           <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm shrink-0 transition-colors duration-500", (state.status === 'reasoning' || state.status === 'synthesizing') ? `${statusBg} animate-pulse` : statusBg)} />
           <div className="flex flex-col overflow-hidden">
               <span className="text-sm font-bold truncate text-foreground">{modelName}</span>
               <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                   <span className={cn(statusColor, "flex items-center gap-1 transition-colors duration-300")}><StatusIcon className={cn("w-3 h-3", (state.status === 'reasoning' || state.status === 'synthesizing') && "animate-spin")} />{statusText}</span>
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
                    <DropdownMenuContent align="end">{allModels.slice(0,5).map(m => (<DropdownMenuItem key={m.id} onClick={() => onSwitch(m.id)} disabled={activeModelIds.includes(m.id)}><span className={cn("flex-1", activeModelIds.includes(m.id) && "opacity-50")}>{m.name}</span>{m.id === state.modelId && <Check className="w-3 h-3 ml-2"/>}</DropdownMenuItem>))}</DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
      </CardHeader>
      <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar bg-linear-to-b from-transparent to-background/5">
         {state.status === 'error' && (<div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive text-xs flex flex-col gap-2"><div className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4"/> Generation Failed</div><p className="opacity-90">{state.thinking || "Unknown error."}</p><Button variant="outline" size="sm" onClick={() => onSwitch(state.modelId)} className="mt-2 border-destructive/30 hover:bg-destructive/10 w-fit"><RefreshCcw className="w-3 h-3 mr-2"/> Retry</Button></div>)}
         {(state.thinking || state.status === 'reasoning' || state.status === 'stopped') && state.status !== 'error' && (<ThinkingLog thinking={state.thinking} status={state.status} />)}
         {state.jsonResult?.message && (<div className="text-sm leading-7 text-foreground/90 p-1 animate-in fade-in slide-in-from-bottom-2">{state.jsonResult.message}</div>)}
         {state.jsonResult?.steps && (<AgentChart steps={state.jsonResult.steps} status={state.status} />)}
      </div>
    </Card>
  )
}