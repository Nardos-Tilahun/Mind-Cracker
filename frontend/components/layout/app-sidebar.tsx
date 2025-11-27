"use client"

import * as React from "react"
import axios from "axios"
import { authClient } from "@/lib/auth-client"
import { useHistory } from "@/lib/context/history-context"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
  SidebarInput,
} from "@/components/ui/sidebar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { History, Lock, Search, MessageSquarePlus, Trash2, X } from "lucide-react"
import { AuthModal } from "@/components/auth-modal"
import { toast } from "sonner"
import Fuse from "fuse.js"
import { API_URL } from "@/lib/chat/config"

export function AppSidebar({ onSelectHistory, onNewChat, onClearHistory, ...props }: any) {
  const { data: session, isPending: isAuthPending } = authClient.useSession()
  const { history, isLoading: isHistoryLoading, refreshHistory } = useHistory()

  const [searchQuery, setSearchQuery] = React.useState("")
  const [isAuthOpen, setIsAuthOpen] = React.useState(false)
  const [isClearDialogOpen, setIsClearDialogOpen] = React.useState(false)
  const [itemToDelete, setItemToDelete] = React.useState<number | null>(null)

  const handleClearHistory = async () => {
    if (!session?.user?.id) return
    try {
        // CHANGED: Use API_URL
        await axios.delete(`${API_URL}/history/${session.user.id}`)
        await refreshHistory()
        setIsClearDialogOpen(false)
        onClearHistory?.()
        toast.success("All history cleared")
    } catch (e) {
        toast.error("Failed to clear history")
    }
  }

  const handleDeleteItem = async () => {
    if (!itemToDelete) return
    try {
        // CHANGED: Use API_URL
        await axios.delete(`${API_URL}/goals/${itemToDelete}`)
        await refreshHistory()
        setItemToDelete(null)
        toast.success("Goal deleted")
    } catch (e) {
        toast.error("Failed to delete goal")
    }
  }

  const filteredHistory = React.useMemo(() => {
    if (!history) return []
    if (!searchQuery.trim()) return history

    const fuse = new Fuse(history, {
      keys: [
        { name: 'goal', weight: 0.6 },
        { name: 'thinking', weight: 0.3 },
        { name: 'model', weight: 0.2 },
        { name: 'preview.step', weight: 0.2 },
        { name: 'preview.description', weight: 0.1 }
      ],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 2,
    })

    return fuse.search(searchQuery).map(result => result.item)
  }, [history, searchQuery])

  const isLoading = isAuthPending || (session && isHistoryLoading && !history)

  return (
    <>
      <Sidebar collapsible="icon" {...props}>
        <SidebarHeader>
          <SidebarMenu className="mt-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onNewChat}
                tooltip="New Chat"
                className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground shadow-sm transition-all group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:text-primary group-data-[collapsible=icon]:hover:bg-primary/10"
              >
                <MessageSquarePlus className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden font-medium">New Chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center justify-between pr-2">
              <SidebarGroupLabel>Your Previous Goals</SidebarGroupLabel>
              {session && history && history.length > 0 && (
                <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Clear all">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear All History?</AlertDialogTitle>
                      <AlertDialogDescription>This will permanently delete ALL your saved goals.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearHistory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            {session && history && history.length > 0 && (
              <div className="px-2 mb-3 mt-1 relative">
                <SidebarInput
                  placeholder="Search history..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
                <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 select-none opacity-50" />
              </div>
            )}

            <SidebarMenu>
              {isLoading ? (
                 <div className="p-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div>
              ) : !session ? (
                <div className="p-4 m-2 rounded-lg border border-dashed bg-sidebar-accent/50 text-center">
                  <Lock className="w-4 h-4 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground mb-3">Sign in to save.</p>
                  <Button size="sm" variant="secondary" onClick={() => setIsAuthOpen(true)} className="w-full h-7 text-xs">Sign In</Button>
                  <AuthModal open={isAuthOpen} onOpenChange={setIsAuthOpen} />
                </div>
              ) : filteredHistory.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground italic">No saved goals yet.</div>
              ) : (
                filteredHistory.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton onClick={() => onSelectHistory?.(item)} tooltip={item.goal} className="pr-8 group">
                      <History className="opacity-70" />
                      <span className="truncate">{item.goal}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={(e) => {
                          e.stopPropagation()
                          setItemToDelete(item.id)
                      }}
                      className="opacity-0 group-hover/menu-item:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="size-3.5" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
                <AlertDialogDescription>
                    This specific chat session will be permanently removed.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}