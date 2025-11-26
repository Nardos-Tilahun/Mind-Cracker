"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { motion } from "framer-motion"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="w-9 h-9" /> // Prevent hydration mismatch

  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative w-14 h-8 rounded-full bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-white/10 flex items-center px-1 shadow-inner transition-colors focus:outline-none"
    >
      <motion.div
        className="absolute w-6 h-6 rounded-full bg-white dark:bg-[#0a0a0a] shadow-md flex items-center justify-center z-10"
        initial={false}
        animate={{ x: isDark ? 24 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <motion.div
          initial={false}
          animate={{ rotate: isDark ? 180 : 0, opacity: isDark ? 0 : 1 }}
          className="absolute"
        >
          <Sun className="w-3.5 h-3.5 text-orange-500" />
        </motion.div>
        <motion.div
          initial={false}
          animate={{ rotate: isDark ? 0 : -180, opacity: isDark ? 1 : 0 }}
          className="absolute"
        >
          <Moon className="w-3.5 h-3.5 text-cyan-400" />
        </motion.div>
      </motion.div>
    </button>
  )
}