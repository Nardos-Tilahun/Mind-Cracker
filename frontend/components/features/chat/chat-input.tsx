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
                "w-full z-50 transition-all duration-500 ease-in-out",
                // If centered (initial state), behave normally. If not (chat mode), fix to bottom.
                isCentered 
                    ? "relative pointer-events-none"
                    : "fixed bottom-0 left-0 right-0 p-4 pointer-events-none flex justify-center"
            )}
        >
            <div className={cn(
                "w-full transition-all duration-500 pointer-events-auto",
                isCentered ? "max-w-2xl mx-auto" : "max-w-3xl mx-auto md:ml-auto md:mr-auto" // Keeps it centered within content area
            )}>

                {/* Input Box */}
                <div className={cn(
                    "relative flex items-end gap-2 p-2 rounded-[26px] border shadow-2xl transition-all duration-300",
                    "bg-background/80 backdrop-blur-xl dark:bg-zinc-900/80",
                    isProcessing
                        ? "border-amber-500/30 ring-1 ring-amber-500/10"
                        : "border-primary/10 shadow-primary/5 ring-1 ring-white/5 focus-within:ring-primary/20 focus-within:border-primary/30"
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
                        className="flex-1 bg-transparent border-none focus:ring-0 resize-none max-h-[150px] py-3 px-2 text-[15px] scrollbar-hide placeholder:text-muted-foreground/60 outline-none"
                        rows={1}
                        style={{ minHeight: "44px" }}
                        suppressHydrationWarning={true}
                        spellCheck="false"
                        data-form-type="other"
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

                {/* Footer: Disclaimer */}
                <div className={cn("flex justify-center mt-2 transition-opacity duration-500", isCentered ? "opacity-80" : "opacity-0 h-0 overflow-hidden")}>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/90 bg-background/50 px-3 py-1 rounded-full backdrop-blur-md">
                        <ShieldCheck className="w-3 h-3 text-primary/70" />
                        <span className="font-medium tracking-tight">
                            AI tactics. Verify before execution.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
})

ChatInput.displayName = "ChatInput"