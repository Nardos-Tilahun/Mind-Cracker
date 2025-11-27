import { forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { ArrowRight, User as UserIcon, Square, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
    input: string
    setInput: (v: string) => void
    onSubmit: (e: any) => void
    isProcessing: boolean
    activeModelsCount: number
    onStop?: () => void
    isCentered?: boolean
}

export const ChatInput = forwardRef<HTMLTextAreaElement, Props>(({ 
    input, 
    setInput, 
    onSubmit, 
    isProcessing, 
    activeModelsCount, 
    onStop, 
    isCentered 
}, ref) => {
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (isProcessing) return
            if (input.trim()) onSubmit(e)
        }
    }

    return (
        <div
            className={cn(
                "w-full z-30 transition-all duration-500 ease-in-out pointer-events-none",
                isCentered ? "bg-transparent p-0" : "bg-background/95 backdrop-blur-xl shadow-[0_-5px_20px_-5px_rgba(0,0,0,0.05)] py-4 px-4"
            )}
        >
            <div className={cn(
                "mx-auto relative transition-all duration-500 pointer-events-auto", 
                isCentered ? "max-w-2xl" : "max-w-3xl"
            )}>

                {/* Input Box */}
                <div className={cn(
                    "relative flex items-end gap-2 p-3 rounded-3xl border shadow-2xl ring-1 transition-all duration-300",
                    "bg-background dark:bg-zinc-900/90",
                    isProcessing
                        ? "border-amber-500/30 ring-amber-500/10 shadow-amber-500/5"
                        : "border-primary/20 shadow-primary/5 ring-white/10 focus-within:ring-primary/30 focus-within:border-primary/40"
                )}>
                    <Button variant="ghost" size="icon" className="rounded-full h-10 w-10 text-muted-foreground mb-1 ml-1 hover:bg-primary/10 hover:text-primary self-end">
                        <UserIcon className="w-5 h-5" />
                    </Button>

                    <textarea
                        ref={ref}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isProcessing ? "Waiting to finish..." : "Ask your agents..."}
                        className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-[200px] py-3.5 px-2 text-sm md:text-base scrollbar-hide placeholder:text-muted-foreground/50 outline-none"
                        rows={1}
                        style={{ minHeight: "52px" }}
                    />

                    <Button
                        onClick={isProcessing && onStop ? onStop : onSubmit}
                        disabled={!isProcessing && !input.trim()}
                        size="icon"
                        className={cn(
                            "rounded-full h-10 w-10 mb-1.5 mr-1 transition-all duration-300 shrink-0",
                            isProcessing ? "bg-amber-500 hover:bg-amber-600 shadow-lg text-white animate-in zoom-in-50" :
                            input.trim() ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
                        )}
                        title={isProcessing ? "Stop Generation" : "Send Message"}
                    >
                        {isProcessing ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                        ) : (
                            <ArrowRight className="w-5 h-5" />
                        )}
                    </Button>
                </div>

                {/* Footer: Security Disclaimer */}
                <div className={cn("flex flex-col items-center gap-2 mt-3 select-none transition-opacity duration-500", isCentered ? "opacity-80" : "opacity-100")}>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/90 bg-primary/5 px-3 py-1 rounded-full border border-primary/10 backdrop-blur-lx shadow-sm transition-all hover:bg-primary/10 cursor-help group">
                        <ShieldCheck className="w-3 h-3 text-primary/70 group-hover:text-primary" />
                        <span className="font-medium tracking-tight group-hover:text-primary transition-colors">
                            Verify outputs to crack your goal.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
})

ChatInput.displayName = "ChatInput"