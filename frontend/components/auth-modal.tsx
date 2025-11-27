"use client"

import { useState, useEffect } from "react"
import { authClient } from "@/lib/auth-client"
import { motion, AnimatePresence } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowRight, AlertCircle, Lock, X } from "lucide-react"
import { LoginForm, RegisterForm } from "@/components/auth/auth-forms"

interface AuthModalProps {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultTab?: "login" | "register"
}

export function AuthModal({ trigger, open, onOpenChange, defaultTab = "login" }: AuthModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState(defaultTab)

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab)
      setError("")
    }
  }, [open, defaultTab])

  const handleClose = () => onOpenChange?.(false)

  // --- HELPER: Translate Error Codes to User Messages ---
  const getFriendlyErrorMessage = (err: any) => {
      const msg = err?.message || "";
      const status = err?.status || 0;

      // 1. Validation Errors
      if (msg.includes("password") && msg.includes("length")) return "Password must be at least 8 characters.";
      if (msg.includes("email")) return "Please enter a valid email address.";
      
      // 2. Login Errors
      if (status === 401 || msg.includes("Invalid email or password")) return "Incorrect email or password.";
      if (status === 403) return "Access denied. Please verify your email.";
      if (status === 429) return "Too many attempts. Please try again later.";
      
      // 3. Registration Errors
      if (msg.includes("already exists") || status === 409) return "An account with this email already exists.";
      
      // 4. Fallback
      return "Something went wrong. Please try again.";
  }

  const handleAuth = async () => {
    // Basic Client-Side Validation
    if (!email.includes("@")) { setError("Please enter a valid email."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (activeTab === "register" && !name) { setError("Please enter your name."); return; }

    const isLogin = activeTab === "login"
    setIsLoading(true)
    setError("")

    try {
      if (isLogin) {
        const { error: authError } = await authClient.signIn.email({ email, password, callbackURL: "/" })
        if (authError) {
            setError(getFriendlyErrorMessage(authError))
            return // Stop here
        }
        handleClose()
      } else {
        const { error: authError } = await authClient.signUp.email({ email, password, name, callbackURL: "/" })
        if (authError) {
            setError(getFriendlyErrorMessage(authError))
            return // Stop here
        }
        handleClose()
      }
    } catch (e: any) {
      setError("Network error. Please check your connection.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    setIsLoading(true)
    setError("")
    try {
        await authClient.signIn.social({ provider: "google", callbackURL: "/" })
    } catch (e) {
        setError("Could not connect to Google.")
        setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border border-zinc-200 dark:border-white/10 bg-white/95 dark:bg-zinc-950/80 backdrop-blur-2xl shadow-2xl outline-none transition-all duration-300">

        <button onClick={handleClose} className="absolute right-4 top-4 z-50 p-2 rounded-full bg-zinc-100/50 dark:bg-zinc-800/50 hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors focus:outline-none">
          <X className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        </button>

        <div className="absolute top-0 left-0 w-full h-32 bg-linear-to-b from-primary/10 via-primary/5 to-transparent pointer-events-none" />

        <div className="relative z-10 p-6">
          <DialogHeader className="mb-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-linear-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4 ring-1 ring-primary/20 shadow-sm">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold tracking-tight">{activeTab === "login" ? "Welcome back" : "Create account"}</DialogTitle>
            <DialogDescription>Access your strategic intelligence dashboard.</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setError(""); }} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-zinc-100 dark:bg-zinc-900/50 p-1">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            <div className="relative overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: activeTab === "login" ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: activeTab === "login" ? 20 : -20 }}
                  transition={{ duration: 0.2 }}
                >
                  <TabsContent value="login" className="mt-0 outline-none pb-1">
                    <LoginForm
                      email={email} setEmail={setEmail}
                      password={password} setPassword={setPassword}
                      onSubmit={handleAuth}
                    />
                  </TabsContent>

                  <TabsContent value="register" className="mt-0 outline-none pb-1">
                    <RegisterForm
                      name={name} setName={setName}
                      email={email} setEmail={setEmail}
                      password={password} setPassword={setPassword}
                      onSubmit={handleAuth}
                    />
                  </TabsContent>
                </motion.div>
              </AnimatePresence>
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 mt-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{error}</span>
              </motion.div>
            )}

            <div className="mt-6 space-y-3">
              <Button className="w-full font-bold h-11 shadow-primary/20" onClick={handleAuth} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {activeTab === "login" ? "Sign In" : "Create Account"}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4 opacity-70" />}
              </Button>

              <Button variant="outline" className="w-full h-10 border-dashed text-xs text-muted-foreground" onClick={() => setActiveTab(activeTab === "login" ? "register" : "login")}>
                {activeTab === "login" ? "Don't have an account? Register" : "Already have an account? Sign In"}
              </Button>

              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Or continue with</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Button variant="outline" className="w-full h-11" onClick={handleGoogle} disabled={isLoading}>
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}