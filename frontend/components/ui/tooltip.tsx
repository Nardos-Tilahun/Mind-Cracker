"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

// Updated iOS 26 ultra-glass effect with SELECTABLE text
function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-200 overflow-hidden rounded-2xl border border-white/30 \
          bg-white/40 backdrop-blur-2xl backdrop-saturate-200 \
          px-3 py-2 text-xs text-black font-medium shadow-[0_12px_40px_rgba(0,0,0,0.18)] \
          animate-in fade-in-0 zoom-in-90 data-[state=closed]:animate-out \
          data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 \
          data-[side=bottom]:slide-in-from-top-2 \
          data-[side=left]:slide-in-from-right-2 \
          data-[side=right]:slide-in-from-left-2 \
          data-[side=top]:slide-in-from-bottom-2 \
          select-text pointer-events-auto touch-manipulation",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className="fill-white/50 drop-shadow-[0_2px_6px_rgba(0,0,0,0.15)]"
          width={12}
          height={6}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }