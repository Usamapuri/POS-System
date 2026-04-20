import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { User, LogOut, KeyRound, Loader2, Eye, EyeOff } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"
import apiClient from "@/api/client"
import type { User as UserType } from "@/types"

interface UserMenuProps {
  user: UserType
  collapsed?: boolean
  size?: "sm" | "md" | "lg"
}

// Keep in sync with minPasswordLen in backend auth handler.
const MIN_PASSWORD_LEN = 8

export function UserMenu({ user, collapsed = false, size = "md" }: UserMenuProps) {
  const [changeOpen, setChangeOpen] = useState(false)

  const handleLogout = () => {
    apiClient.clearAuth()
    window.location.href = '/login'
  }

  const sizeClasses = {
    sm: {
      avatar: "w-6 h-6",
      icon: "w-3 h-3",
      text: "text-xs",
      name: "text-xs",
      email: "text-xs"
    },
    md: {
      avatar: "w-8 h-8",
      icon: "w-4 h-4",
      text: "text-sm",
      name: "text-sm",
      email: "text-xs"
    },
    lg: {
      avatar: "w-10 h-10",
      icon: "w-5 h-5",
      text: "text-base",
      name: "text-base",
      email: "text-sm"
    }
  }

  const currentSize = sizeClasses[size]

  // Menu content is rendered twice (collapsed vs expanded trigger) — keep
  // the dropdown items in one place so the two branches can't drift.
  const menuItems = (
    <>
      <DropdownMenuItem onSelect={() => setChangeOpen(true)}>
        <KeyRound className="mr-2 h-4 w-4" />
        <span>Change password</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600">
        <LogOut className="mr-2 h-4 w-4" />
        <span>Log out</span>
      </DropdownMenuItem>
    </>
  )

  return (
    <>
      {collapsed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-auto p-1.5 rounded-full">
              <div className={`bg-primary rounded-full flex items-center justify-center ${currentSize.avatar}`}>
                <User className={`text-primary-foreground ${currentSize.icon}`} />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="right" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.first_name} {user.last_name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start p-3 h-auto bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3 w-full">
                <div className={`bg-primary rounded-full flex items-center justify-center ${currentSize.avatar}`}>
                  <User className={`text-primary-foreground ${currentSize.icon}`} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className={`font-medium truncate ${currentSize.name}`}>
                    {user.first_name} {user.last_name}
                  </p>
                  <p className={`text-muted-foreground truncate ${currentSize.email}`}>
                    {user.email}
                  </p>
                </div>
                <Badge variant="outline" className={currentSize.text}>
                  {user.role.toUpperCase()}
                </Badge>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.first_name} {user.last_name}</p>
                <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ChangePasswordDialog open={changeOpen} onOpenChange={setChangeOpen} />
    </>
  )
}

// Inline modal component — small enough that the extra file wouldn't pay for
// itself, tightly coupled to the menu for discoverability. If this grows we
// split it into components/forms/.
function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setShowNew(false)
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: async (payload: { current: string; next: string }) =>
      apiClient.changePassword(payload.current, payload.next),
    onSuccess: () => {
      toast({
        title: "Password updated",
        description: "You'll keep your current session, but use the new password next time you sign in.",
      })
      reset()
      onOpenChange(false)
    },
    onError: (err: Error) => {
      setError(err.message || "Could not change password")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!currentPassword) {
      setError("Please enter your current password")
      return
    }
    if (newPassword.length < MIN_PASSWORD_LEN) {
      setError(`New password must be at least ${MIN_PASSWORD_LEN} characters`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match")
      return
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current one")
      return
    }
    mutation.mutate({ current: currentPassword, next: newPassword })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Always clear form when the dialog closes — stale passwords lying
        // around in component state is an easy way to leak them via React
        // devtools.
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-4 w-4 text-orange-600" />
            Change password
          </DialogTitle>
          <DialogDescription>
            Pick a new password for your account. You'll stay signed in on this device.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              disabled={mutation.isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={mutation.isPending}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label={showNew ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">At least {MIN_PASSWORD_LEN} characters.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type={showNew ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              disabled={mutation.isPending}
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-[13px] text-rose-800">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating…
                </span>
              ) : (
                "Update password"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
