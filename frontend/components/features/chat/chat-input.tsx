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
                "w-full transition-all duration-500 ease-in-out pointer-events-none z-50",
                // Mobile-friendly positioning logic
                isCentered ? "relative" : "fixed bottom-0 left-0 right-0 bg-linear-to-t from-background via-background/95 to-transparent pb-safe"
            )}
        >
            <div className={cn(
                "mx-auto relative transition-all duration-500 pointer-events-auto",
                isCentered ? "max-w-2xl px-4" : "max-w-3xl px-3 pb-3 md:pb-6"
            )}>

                {/* Input Container - Pill Shape */}
                <div className={cn(
                    "relative flex items-end gap-2 p-2 rounded-[26px] border shadow-2xl transition-all duration-300",
                    "bg-background/80 backdrop-blur-xl supports-backdrop-filter:bg-background/60",
                    isProcessing
                        ? "border-amber-500/30 ring-4 ring-amber-500/10"
                        : "border-border/60 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10"
                )}>
                    {/* User Icon Badge */}
                    <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground shrink-0 mb-0.5">
                        <UserIcon className="w-5 h-5" />
                    </div>

                    <textarea
                        ref={ref}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isProcessing ? "Agents are working..." : "What is your goal?"}
                        className="flex-1 bg-transparent border-none focus:ring-0 resize-none py-3 px-2 text-base md:text-sm scrollbar-hide placeholder:text-muted-foreground/60 outline-none max-h-[160px] min-h-[44px]"
                        rows={1}
                        // Auto-grow hack style
                        style={{ fieldSizing: "content" } as any} 
                    />

                    <Button
                        onClick={isProcessing && onStop ? onStop : onSubmit}
                        disabled={!isProcessing && !input.trim()}
                        size="icon"
                        className={cn(
                            "rounded-full h-10 w-10 mb-0.5 transition-all duration-300 shrink-0 shadow-sm",
                            isProcessing 
                                ? "bg-amber-500 hover:bg-amber-600 text-white animate-in zoom-in-50" 
                                : input.trim() 
                                    ? "bg-primary hover:bg-primary/90 text-primary-foreground" 
                                    : "bg-muted text-muted-foreground hover:bg-muted/80"
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

                {/* Footer / Disclaimer */}
                <div className={cn(
                    "flex justify-center mt-3 transition-opacity duration-500", 
                    isCentered ? "opacity-100" : "opacity-0 h-0 overflow-hidden"
                )}>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/80 bg-background/50 px-3 py-1 rounded-full border border-border/40 backdrop-blur-sm">
                        <ShieldCheck className="w-3 h-3 text-primary/70" />
                        <span>AI outputs can be inaccurate. Verify important details.</span>
                    </div>
                </div>
            </div>
        </div>
    )
})

ChatInput.displayName = "ChatInput"