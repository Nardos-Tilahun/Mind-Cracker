"use client"

import { useTheme } from "next-themes"
import { authClient } from "@/lib/auth-client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOut, Monitor, Moon, Sun, Check } from "lucide-react"

interface UserNavProps {
  user: {
    name: string
    email: string
    image?: string | null
  }
}

export function UserNav({ user }: UserNavProps) {
  const { setTheme, theme } = useTheme()

  // Generate initials (max 2 chars)
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    : user.email?.charAt(0).toUpperCase() || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="relative h-9 w-9 rounded-full focus-visible:ring-2 focus-visible:ring-primary/50 transition-all p-0 overflow-hidden"
        >
          <Avatar className="h-full w-full ring-2 ring-border/50 hover:ring-primary/50 transition-all">
            <AvatarImage 
              src={user.image || undefined} 
              alt={user.name || "User Account"} 
              className="object-cover"
            />
            {/* 
               VISIBILITY FIX:
               - Gradient background ensures visibility on any header color.
               - High contrast text (zinc-700 on light, zinc-100 on dark).
               - Flex centering for perfect alignment.
            */}
            <AvatarFallback className="bg-linear-to-br from-zinc-100 to-zinc-300 dark:from-zinc-700 dark:to-zinc-900 text-zinc-700 dark:text-zinc-100 font-bold text-xs flex items-center justify-center h-full w-full">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent className="w-60 z-100 bg-white dark:bg-zinc-950 border-border shadow-xl p-1" align="end" forceMount>
        
        {/* User Info Header */}
        <div className="flex flex-col space-y-1 p-2.5">
          <p className="text-sm font-semibold leading-none truncate tracking-tight">{user.name || "User"}</p>
          <p className="text-xs leading-none text-muted-foreground truncate font-mono opacity-80">
            {user.email}
          </p>
        </div>
        
        <DropdownMenuSeparator className="my-1 opacity-50" />
        
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="h-9 cursor-pointer">
            <Monitor className="mr-2 h-4 w-4 opacity-70" />
            <span>Theme</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="z-100 bg-white dark:bg-zinc-950 border-border shadow-lg ml-1">
              <DropdownMenuItem onClick={() => setTheme("light")} className="cursor-pointer">
                <Sun className="mr-2 h-4 w-4 opacity-70" />
                <span>Light</span>
                {theme === "light" && <Check className="ml-auto h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")} className="cursor-pointer">
                <Moon className="mr-2 h-4 w-4 opacity-70" />
                <span>Dark</span>
                {theme === "dark" && <Check className="ml-auto h-4 w-4 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")} className="cursor-pointer">
                <Monitor className="mr-2 h-4 w-4 opacity-70" />
                <span>System</span>
                {theme === "system" && <Check className="ml-auto h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        <DropdownMenuSeparator className="my-1 opacity-50" />
        
        <DropdownMenuItem 
          onClick={() => authClient.signOut()} 
          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer h-9"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}