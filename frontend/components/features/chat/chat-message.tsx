"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Pencil, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { ChatTurn } from "@/types/chat"

interface ChatMessageProps {
    turn: ChatTurn
    onEdit: (newText: string) => void
    onNavigate: (direction: 'prev' | 'next') => void
}

export function ChatMessage({ turn, onEdit, onNavigate }: ChatMessageProps) {
    const [isEditing, setIsEditing] = useState(false)
    const [editText, setEditText] = useState(turn.userMessage)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        setEditText(turn.userMessage)
        setIsEditing(false)
    }, [turn.id, turn.currentVersionIndex])

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto"
            textareaRef.current.style.height = textareaRef.current.scrollHeight + "px"
            textareaRef.current.focus()
        }
    }, [isEditing, editText])

    const handleSave = () => {
        if (editText.trim() !== turn.userMessage && editText.trim().length > 0) {
            onEdit(editText)
        }
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSave()
        } else if (e.key === 'Escape') {
            setEditText(turn.userMessage)
            setIsEditing(false)
        }
    }

    const currentVer = (turn.currentVersionIndex || 0) + 1
    const totalVer = turn.versions?.length || 1

    return (
        <div className="group flex flex-col items-end w-full">
            <div className={cn("relative max-w-[90%] sm:max-w-[80%]", isEditing ? "w-full sm:max-w-3xl" : "")}>
                
                {isEditing ? (
                    <div className="bg-background border border-primary/20 rounded-2xl p-3 shadow-lg ring-2 ring-primary/10 animate-in fade-in zoom-in-95 duration-200">
                        <textarea
                            ref={textareaRef}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="w-full bg-transparent border-none resize-none outline-none text-sm leading-relaxed min-h-[60px]"
                            placeholder="Edit your message..."
                        />
                        <div className="flex justify-end gap-2 mt-3">
                            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-7 px-3 text-xs">
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSave} className="h-7 px-3 text-xs">
                                Save & Submit
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="relative group/bubble">
                        <div className="bg-primary text-primary-foreground px-6 py-3.5 rounded-3xl rounded-tr-md shadow-md text-sm leading-relaxed wrap-break-word">
                            {turn.userMessage}
                        </div>
                        
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/80 text-muted-foreground border border-border/50 shadow-sm opacity-0 group-hover/bubble:opacity-100 transition-all hover:text-primary hover:scale-110"
                            title="Edit message"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Thread Navigation */}
            {!isEditing && totalVer > 1 && (
                <div className="flex items-center gap-1 mt-1.5 mr-1 select-none animate-in fade-in slide-in-from-top-1">
                    <button
                        onClick={() => onNavigate('prev')}
                        disabled={currentVer === 1}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronLeft className="w-3 h-3" />
                    </button>
                    
                    <span className="text-[10px] font-semibold text-muted-foreground min-w-[20px] text-center">
                        {currentVer} / {totalVer}
                    </span>

                    <button
                        onClick={() => onNavigate('next')}
                        disabled={currentVer === totalVer}
                        className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronRight className="w-3 h-3" />
                    </button>
                </div>
            )}
        </div>
    )
}