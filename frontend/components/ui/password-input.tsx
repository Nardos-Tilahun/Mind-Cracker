"use client"

import * as React from "react"
import { Eye, EyeOff, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface PasswordInputProps extends React.ComponentProps<typeof Input> {
  wrapperClassName?: string
}

export function PasswordInput({ className, wrapperClassName, ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = React.useState(false)

  return (
    <div className={cn("relative group", wrapperClassName)}>
      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
      <Input
        type={isVisible ? "text" : "password"}
        className={cn("pl-10 pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setIsVisible(!isVisible)}
        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 focus:outline-none focus:text-primary transition-colors"
        aria-label={isVisible ? "Hide password" : "Show password"}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}