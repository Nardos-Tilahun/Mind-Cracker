"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { Mail, User } from "lucide-react"

interface AuthFormProps {
  email: string
  setEmail: (v: string) => void
  password: string
  setPassword: (v: string) => void
  onSubmit: () => void
}

interface RegisterFormProps extends AuthFormProps {
  name: string
  setName: (v: string) => void
}

export function LoginForm({ email, setEmail, password, setPassword, onSubmit }: AuthFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative group">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <Input
            id="email"
            placeholder="name@example.com"
            type="email"
            className="pl-10 placeholder:text-muted-foreground/50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          placeholder="••••••••"
          className="placeholder:text-muted-foreground/50"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        />
      </div>
    </div>
  )
}

export function RegisterForm({ name, setName, email, setEmail, password, setPassword, onSubmit }: RegisterFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full Name</Label>
        <div className="relative group">
          <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <Input
            id="name"
            placeholder="e.g. John Doe"
            className="pl-10 placeholder:text-muted-foreground/50"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">Email</Label>
        <div className="relative group">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <Input
            id="reg-email"
            placeholder="name@example.com"
            type="email"
            className="pl-10 placeholder:text-muted-foreground/50"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-password">Password</Label>
        <PasswordInput
          id="reg-password"
          placeholder="Min. 8 characters"
          className="placeholder:text-muted-foreground/50"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        />
      </div>
    </div>
  )
}