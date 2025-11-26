"use client"

import { motion, AnimatePresence } from "framer-motion"
import { BrainCircuit, Sparkles, ArrowRight } from "lucide-react"
import { useSloganManager } from "@/hooks/use-slogan-manager"

interface EmptyStateProps {
  onExampleClick?: (text: string) => void
}

export function EmptyState({ onExampleClick }: EmptyStateProps) {
  // This hook now guarantees a new slogan every time this component remounts (on New Chat)
  const { slogan, isAnimating } = useSloganManager()

  return (
    <div className="flex flex-col items-center justify-start w-full max-w-2xl px-4 mt-2">

      {/* Group: Logo + Content */}
      <div className="flex flex-col items-center gap-5 sm:gap-6 mb-4 w-full">

        {/* Icon Area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full animate-pulse" />
          <div className="relative p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 ring-1 ring-primary/20 shadow-2xl backdrop-blur-sm">
            <BrainCircuit className="w-12 h-12 sm:w-16 sm:h-16 text-primary/90" />
          </div>
        </motion.div>

        {/* Dynamic Content Area */}
        <div className="w-full min-h-[180px]">
          <AnimatePresence mode="wait">
            {!isAnimating && (
              <motion.div
                key={slogan.headline} // Key change triggers animation
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="flex flex-col items-center gap-6"
              >

                {/* 1. Slogan Text */}
                <div className="flex flex-col gap-3 items-center">
                  <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tighter text-foreground drop-shadow-sm text-center leading-tight">
                    {slogan.headline}
                  </h2>
                  <p className="text-base sm:text-lg text-muted-foreground font-medium leading-relaxed max-w-lg text-center">
                    {slogan.subtext}
                  </p>
                </div>

                {/* 2. Interactive Example Button */}
                <div className="flex flex-col items-center w-full">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/50 mb-2.5">
                    Featured Idea:
                  </p>
                  <button
                    onClick={() => onExampleClick?.(slogan.example)}
                    className="group relative inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-primary/5 hover:bg-primary/10 border border-primary/10 hover:border-primary/30 transition-all duration-300 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Sparkles className="w-4 h-4 text-amber-500 group-hover:rotate-12 transition-transform" />
                    <span className="text-sm sm:text-base font-semibold text-foreground/90 italic">
                      &quot;{slogan.example}&quot;
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-primary/60 group-hover:translate-x-1 group-hover:text-primary transition-all" />
                  </button>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  )
}