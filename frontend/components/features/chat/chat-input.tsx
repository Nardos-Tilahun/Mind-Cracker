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
                "w-full flex flex-col items-center transition-all duration-300",
                // CHAT MODE STYLING:
                // 1. bg-background/95: Solid background to hide scrolling chat
                // 2. border-t: Subtle separation
                // 3. pb-[env...]: Respects iPhone Home Bar area
                !isCentered && "bg-background/95 backdrop-blur-xl border-t border-border/40 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            )}
        >
            <div className={cn(
                "w-full transition-all duration-500",
                isCentered ? "max-w-2xl" : "max-w-3xl px-4" 
            )}>

                {/* Input Box */}
                <div className={cn(
                    "relative flex items-end gap-2 p-2 rounded-[24px] border shadow-sm transition-all duration-300",
                    "bg-background dark:bg-zinc-900/50", 
                    isProcessing
                        ? "border-amber-500/30 ring-1 ring-amber-500/10"
                        : "border-primary/10 ring-1 ring-border/5 focus-within:ring-primary/20 focus-within:border-primary/30"
                )}>
                    <div className="pl-2 pb-1.5 hidden sm:block">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <UserIcon className="w-4 h-4" />
                        </div>
                    </div>

                    <textarea
                        ref={ref}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isProcessing ? "Agents are working..." : "Ask your agents..."}
                        className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-[150px] py-3 px-2 text-[16px] md:text-[15px] scrollbar-hide placeholder:text-muted-foreground/60 outline-none"
                        // 16px font size on mobile prevents iOS from zooming in automatically
                        rows={1}
                        style={{ minHeight: "44px" }}
                    />

                    <Button
                        onClick={isProcessing && onStop ? onStop : onSubmit}
                        disabled={!isProcessing && !input.trim()}
                        size="icon"
                        className={cn(
                            "rounded-full h-9 w-9 mb-1 mr-1 transition-all duration-300 shrink-0",
                            isProcessing ? "bg-amber-500 hover:bg-amber-600 shadow-lg text-white animate-in zoom-in-50" :
                            input.trim() ? "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20" : "bg-muted text-muted-foreground"
                        )}
                    >
                        {isProcessing ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                        ) : (
                            <ArrowRight className="w-4 h-4" />
                        )}
                    </Button>
                </div>

                {/* Footer: Disclaimer - Always directly below input */}
                <div className="flex justify-center mt-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 bg-muted/20 px-2.5 py-0.5 rounded-full border border-border/20">
                        <ShieldCheck className="w-3 h-3 text-primary/60" />
                        <span className="font-medium tracking-tight truncate max-w-[300px]">
                            AI tactics can be wrong. Verify before execution.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
})

ChatInput.displayName = "ChatInput"