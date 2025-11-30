import { useState, useRef, useEffect } from "react"
import { AgentState } from "@/types/chat"
import { Card, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { BrainCircuit, Check, ChevronDown, Loader2, MoreHorizontal, RefreshCcw, AlertTriangle, Clock, CirclePause, Sparkles, Square, RefreshCw, Search, Activity, CornerUpLeft, Network, Download, Copy, FileText, Share2, FileCode, Link as LinkIcon } from "lucide-react"
import { BarChart, Bar, ResponsiveContainer, Cell, Tooltip } from 'recharts'
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

interface Props {
    state: AgentState
    turnId: string
    metadata?: { parentTurnId?: string; parentStepNumber?: string; level?: number }
    modelName: string
    allModels: any[]
    onSwitch: (id: string) => void
    isLastTurn: boolean
    activeModelIds?: string[]
    onStop: () => void
    onDrillDown: (stepNumber: string, stepTitle: string, stepDescription?: string) => void
    onScrollToParent: () => void
    checkHasChildren: (stepNumber: string) => boolean
    // CHANGED: Accepted string | null
    chatId: string | null
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
        <div className="z-50 min-w-40 overflow-hidden rounded-xl border border-zinc-200/60 bg-white/90 backdrop-blur-xl px-3 py-2 text-xs text-zinc-950 shadow-[0_8px_32px_rgba(0,0,0,0.12)] animate-in fade-in-0 zoom-in-95">
          <div className="font-semibold mb-1 line-clamp-1">{data.step}</div>
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

const InteractiveStepList = ({
    steps,
    status,
    onDrillDown,
    checkHasChildren,
    parentStepNumber
}: {
    steps: any[],
    status: string,
    onDrillDown: (num: string, title: string, desc?: string) => void,
    checkHasChildren: (num: string) => boolean,
    parentStepNumber?: string
}) => {
    if (!steps || !Array.isArray(steps) || steps.length === 0) return null;

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

        <div className="w-full bg-linear-to-b from-muted/10 to-muted/30 rounded-xl border border-border/40 p-3 relative overflow-hidden h-[128px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={steps} barSize={20}>
                    <Tooltip cursor={{fill: 'var(--muted)', opacity: 0.1}} content={<CustomChartTooltip />} isAnimationActive={true} />
                    <Bar dataKey="complexity" radius={[4,4,4,4]} animationDuration={1000}>
                        {steps.map((e:any, i:number) => (
                            <Cell key={i} fill={getComplexityColor(e.complexity)} className="opacity-90 hover:opacity-100 transition-opacity" />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>

        <div className="relative space-y-3 ml-2">
            <div className="absolute left-[9px] top-2 bottom-4 w-[2px] bg-border/40" />
            {steps.map((s: any, i: number) => {
                let displayNum = `${i + 1}`;
                if (parentStepNumber) {
                    displayNum = `${parentStepNumber}.${i + 1}`
                }

                const cleanTitle = s.step.replace(/^\d+(\.\d+)*\s*[-:.]?\s*/, "").trim();
                const hasKids = checkHasChildren(displayNum);

                return (
                <div key={i} className="group relative flex items-start gap-3">
                    <div className={cn(
                        "relative z-10 flex h-5 min-w-1.25rem w-auto px-1.5 shrink-0 items-center justify-center rounded-full border border-background shadow-xs transition-all duration-300 mt-0.5",
                        hasKids ? "bg-primary text-primary-foreground scale-110 ring-2 ring-primary/20" : "bg-muted text-[9px] font-bold text-muted-foreground group-hover:scale-110 group-hover:border-primary/30 group-hover:text-foreground group-hover:bg-background ring-2 ring-transparent group-hover:ring-primary/5"
                    )}>
                       <span className="text-[8px] tracking-tighter font-mono">{displayNum}</span>
                    </div>

                    <div
                        onClick={() => onDrillDown(displayNum, cleanTitle, s.description)}
                        className={cn(
                            "flex-1 p-3 rounded-lg border transition-all duration-300 cursor-pointer relative overflow-hidden group/card",
                            hasKids
                                ? "bg-primary/5 border-primary/20 hover:bg-primary/10"
                                : "bg-card/40 border-border/30 hover:bg-card/80 hover:border-border/60 hover:shadow-sm"
                        )}
                    >
                        <div className="flex justify-between items-start gap-3 mb-1.5">
                            <span className="text-sm font-semibold text-foreground leading-tight">{cleanTitle}</span>

                            {hasKids && (
                                <Badge variant="secondary" className="h-4 px-1 text-[9px] gap-0.5 bg-primary/10 text-primary shrink-0">
                                    Expanded <ChevronDown className="w-2.5 h-2.5 -rotate-90" />
                                </Badge>
                            )}
                        </div>

                        {/* FIX: Use div instead of p to avoid nesting errors with block content */}
                        {s.description && (
                            <div className="text-xs text-muted-foreground/80 leading-relaxed group-hover/card:text-muted-foreground transition-colors">
                                {s.description}
                            </div>
                        )}

                        {!hasKids && (
                            <div className="absolute right-2 bottom-2 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover/card:translate-y-0">
                                <Badge variant="outline" className="h-4 px-1.5 text-[9px] bg-background/80 backdrop-blur-sm border-primary/20 text-primary shadow-sm hover:bg-primary hover:text-primary-foreground transition-colors">
                                    Break Down <Network className="w-2.5 h-2.5 ml-1" />
                                </Badge>
                            </div>
                        )}
                    </div>
                </div>
            )})}
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
            {/* FIX: CollapsibleTrigger is a BUTTON. Using SPAN inside prevents hydration mismatch */}
            <CollapsibleTrigger className="flex w-full items-center justify-between p-2.5 hover:bg-primary/5 transition-colors cursor-pointer select-none">
                <span className="flex items-center gap-2 text-xs font-medium text-primary/80 uppercase tracking-tight">
                    <BrainCircuit className={cn("w-3.5 h-3.5", (status === 'reasoning' || status === 'retrying') && "text-primary animate-pulse")}/>
                    {status === 'retrying' ? "System Log & Handovers" : "Thinking Process"}
                    {!isOpen && (status === 'reasoning' || status === 'retrying') && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground/80 font-normal normal-case animate-pulse">
                            &mdash; analyzing...
                        </span>
                    )}
                </span>
                <ChevronDown className={cn("w-3.5 h-3.5 text-primary/50 transition-transform duration-300", isOpen && "rotate-180")}/>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div
                    ref={logRef}
                    className="md:max-h-[180px] overflow-y-auto p-3 text-[10px] font-mono leading-relaxed text-muted-foreground/90 bg-background/40 border-t border-primary/10 whitespace-pre-wrap selection:bg-primary/20 custom-scrollbar overscroll-auto touch-pan-y"
                >
                    {thinking}
                    {(status === 'reasoning' || status === 'retrying') && <span className="inline-block w-1 h-3 ml-1 align-middle bg-primary animate-pulse"/>}
                </div>
            </CollapsibleContent>
        </Collapsible>
    )
}

const MessageContent = ({ content, steps }: { content: string, steps?: any[] }) => {
    const [isCopied, setIsCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {}
    };

    return (
        <div className="relative group/message rounded-lg -mx-2 px-2 py-1 transition-colors hover:bg-muted/30">
            <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap selection:bg-primary/20 pr-8">
                {content}
            </div>
            <div className="absolute top-0 right-0 opacity-0 group-hover/message:opacity-100 transition-opacity duration-200">
                <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6">
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
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
            <div className="rounded-xl border border-blue-500/20 bg-linear-to-br from-blue-500/5 to-background p-6 flex flex-col items-center text-center gap-4">
                <AlertTriangle className="w-8 h-8 text-blue-500" />
                <div className="space-y-2">
                    <h3 className="text-lg font-bold">Daily Intelligence Limit Reached</h3>
                    <p className="text-sm text-muted-foreground">Our free AI fleet has exhausted all available API keys.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="rounded-xl border border-destructive/20 bg-linear-to-br from-destructive/5 to-background p-5 relative overflow-hidden flex flex-col gap-4">
            <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-destructive" />
                <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-destructive">Intelligence Grid Offline</h3>
                    <p className="text-sm text-foreground/90">{message}</p>
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={onRetry} className="h-8 text-xs">
                    <RefreshCcw className="w-3.5 h-3.5 mr-2"/> Restart Logic
                </Button>
            </div>
        </div>
    )
}

export function AgentCard({ state, modelName, allModels, onSwitch, isLastTurn, activeModelIds = [], onStop, onDrillDown, onScrollToParent, checkHasChildren, metadata, chatId, turnId }: Props) {
  const [elapsed, setElapsed] = useState("0.0")
  const [search, setSearch] = useState("")
  const [copiedText, setCopiedText] = useState(false)
  const [copiedMD, setCopiedMD] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  useEffect(() => {
      let interval: NodeJS.Timeout
      if (['reasoning', 'synthesizing', 'retrying'].includes(state.status)) interval = setInterval(() => setElapsed(((Date.now() - state.metrics.startTime) / 1000).toFixed(1)), 100)
      else if (state.metrics.endTime) setElapsed(((state.metrics.endTime - state.metrics.startTime) / 1000).toFixed(1))
      return () => clearInterval(interval)
  }, [state.status, state.metrics])

  const formatMarkdown = () => {
      if (!state.jsonResult) return "";
      const steps = state.jsonResult.steps || [];
      const title = modelName || "Strategy";
      let md = `## 🧠 Strategic Plan: ${title}\n\n`;
      if (state.jsonResult.message) md += `**Executive Summary:**\n${state.jsonResult.message}\n\n`;
      md += `### 🚀 Execution Roadmap\n\n`;
      steps.forEach((s: any, i: number) => {
          md += `**${i + 1}. ${s.step}**  *(Difficulty: ${s.complexity}/10)*\n`;
          md += `${s.description}\n\n`;
      });
      return md;
  };

  const formatPlainText = () => {
      if (!state.jsonResult) return "";
      const steps = state.jsonResult.steps || [];
      const title = modelName || "Strategy";
      let txt = `STRATEGIC PLAN: ${title}\n\n`;
      if (state.jsonResult.message) txt += `SUMMARY:\n${state.jsonResult.message}\n\n`;
      txt += `EXECUTION ROADMAP:\n`;
      steps.forEach((s: any, i: number) => {
          txt += `${i + 1}. ${s.step} [Difficulty: ${s.complexity}/10]\n   ${s.description}\n\n`;
      });
      return txt;
  };

  const handleDownloadMD = () => {
      const md = formatMarkdown();
      if (!md) return;
      const title = state.jsonResult?.message ? state.jsonResult.message.split('\n')[0].replace(/[^a-z0-9]/gi, '_').substring(0, 30) : "strategy";
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}_plan.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Markdown file downloaded");
  };

  const handleCopyMD = async () => {
      const text = formatMarkdown();
      if (!text) return;
      try {
          await navigator.clipboard.writeText(text);
          setCopiedMD(true);
          toast.success("Markdown copied to clipboard");
          setTimeout(() => setCopiedMD(false), 2000);
      } catch (err) {
          toast.error("Failed to copy");
      }
  };

  const handleCopyText = async () => {
      const text = formatPlainText();
      if (!text) return;
      try {
          await navigator.clipboard.writeText(text);
          setCopiedText(true);
          toast.success("Formatted text copied to clipboard");
          setTimeout(() => setCopiedText(false), 2000);
      } catch (err) {
          toast.error("Failed to copy");
      }
  };

  const handleCopyLink = async () => {
      if (!chatId) {
          toast.error("Chat must be saved first.");
          return;
      }
      try {
          const url = `${window.location.origin}/?chatId=${chatId}#turn-${turnId}`;
          await navigator.clipboard.writeText(url);
          setCopiedLink(true);
          toast.success("Deep link copied!");
          setTimeout(() => setCopiedLink(false), 2000);
      } catch (e) {
          toast.error("Failed to copy link");
      }
  }

  let StatusIcon = Loader2, statusText = "Initializing...", statusColor = "text-primary", statusBg = "bg-primary"
  if(state.status === 'reasoning') { StatusIcon = BrainCircuit; statusText = "Reasoning"; statusColor = "text-indigo-500"; statusBg = "bg-indigo-500" }
  else if(state.status === 'synthesizing') { StatusIcon = Sparkles; statusText = "Drafting"; statusColor = "text-orange-500"; statusBg = "bg-orange-500" }
  else if(state.status === 'complete') { StatusIcon = Check; statusText = "Done"; statusColor = "text-emerald-500"; statusBg = "bg-emerald-500" }
  else if(state.status === 'stopped') { StatusIcon = CirclePause; statusText = "Paused"; statusColor = "text-amber-500"; statusBg = "bg-amber-500" }
  else if(state.status === 'error') { StatusIcon = AlertTriangle; statusText = "Failed"; statusColor = "text-destructive"; statusBg = "bg-destructive" }

  const isRunning = ['reasoning', 'synthesizing', 'waiting', 'retrying'].includes(state.status)
  const isChild = !!metadata?.parentTurnId;
  const filteredModels = allModels.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card className={cn(
        "flex flex-col h-fit w-full border shadow-sm bg-card/95 backdrop-blur-xl transition-[box-shadow,border] duration-300 ease-out",
        state.status === 'reasoning' ? "ring-1 ring-indigo-500/20 border-indigo-500/20 shadow-indigo-500/5" :
        state.status === 'complete' ? "border-emerald-500/20 shadow-emerald-500/5" : "border-border",
        isChild && "border-l-4 border-l-primary/30"
    )}>
      <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 bg-muted/30 border-b border-border/40 h-12 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
           {isChild ? (
               <Button variant="ghost" size="icon" onClick={onScrollToParent} className="h-6 w-6 mr-1 -ml-1 text-muted-foreground hover:text-primary" title="Back to Parent">
                   <CornerUpLeft className="w-3.5 h-3.5" />
               </Button>
           ) : (
               <div className={cn("w-2 h-2 rounded-full shadow-sm shrink-0 transition-all duration-500", (isRunning) ? `${statusBg} animate-pulse scale-110` : statusBg)} />
           )}
           <div className="flex flex-col overflow-hidden">
               <span className="text-xs font-bold truncate text-foreground tracking-tight flex items-center gap-1.5">
                   {modelName}
                   {isChild && <Badge variant="outline" className="text-[8px] h-3.5 px-1 bg-background/50 border-primary/20 text-primary">L{metadata?.level}</Badge>}
               </span>
               <div className="flex items-center gap-2 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                   <span className={cn(statusColor, "flex items-center gap-1 transition-colors duration-300")}><StatusIcon className={cn("w-2.5 h-2.5", isRunning && "animate-spin")} />{statusText}</span>
                   <span className="w-px h-2 bg-border"/><span className="flex items-center gap-1 font-mono"><Clock className="w-2.5 h-2.5" /> {elapsed}s</span>
               </div>
           </div>
        </div>
        <div className="flex items-center gap-1">
            {state.status === 'complete' && state.jsonResult && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary transition-all" title="Share & Export">
                            <Share2 className="w-3.5 h-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Share</DropdownMenuLabel>
                        <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer gap-2">
                            {copiedLink ? <Check className="w-4 h-4 text-emerald-500" /> : <LinkIcon className="w-4 h-4 text-muted-foreground" />}
                            <span>Copy Deep Link</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Export</DropdownMenuLabel>
                        <DropdownMenuItem onClick={handleCopyText} className="cursor-pointer gap-2">
                            {copiedText ? <Check className="w-4 h-4 text-emerald-500" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
                            <span>Copy as Text</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleCopyMD} className="cursor-pointer gap-2">
                            {copiedMD ? <Check className="w-4 h-4 text-emerald-500" /> : <FileCode className="w-4 h-4 text-muted-foreground" />}
                            <span>Copy as Markdown</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleDownloadMD} className="cursor-pointer gap-2">
                            <Download className="w-4 h-4 text-muted-foreground" />
                            <span>Download .md</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

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
                                <Input placeholder="Search models..." className="h-8 pl-8 text-xs bg-background/50" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                            {filteredModels.map(m => (
                                <DropdownMenuItem key={m.id} onClick={() => onSwitch(m.id)} disabled={activeModelIds.includes(m.id)} className="cursor-pointer">
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
         {state.status === 'error' ? (
             <ErrorView state={state} onRetry={() => onSwitch(state.modelId)} />
         ) : (
             <>
                 <ThinkingLog thinking={state.thinking} status={state.status} />
                 {state.jsonResult?.message && <MessageContent content={state.jsonResult.message} steps={state.jsonResult.steps} />}
                 {state.jsonResult?.steps && Array.isArray(state.jsonResult.steps) && state.jsonResult.steps.length > 0 && (
                    <InteractiveStepList
                        steps={state.jsonResult.steps}
                        status={state.status}
                        onDrillDown={onDrillDown}
                        checkHasChildren={checkHasChildren}
                        parentStepNumber={metadata?.parentStepNumber}
                    />
                 )}
             </>
         )}
      </div>
    </Card>
  )
}