"use client";

import { KeyRoundIcon, LogInIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useMe } from "@/lib/api/hooks";
import { cn } from "@/lib/utils";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** The person's avatar: a rounded square with initials, as in the rail and the member lists. */
export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("size-7 rounded-lg", className)}>
      <AvatarFallback className="rounded-lg bg-secondary text-[11px] font-semibold text-secondary-foreground">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data: me } = useMe();
  const logout = useLogout();
  if (!me) {
    return (
      <Button asChild size={compact ? "icon-sm" : "sm"} variant="outline" aria-label={compact ? "Sign in" : undefined}>
        <Link href="/login">{compact ? <LogInIcon /> : "Sign in"}</Link>
      </Button>
    );
  }
  const name = me.displayName || me.username;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={compact ? "icon-sm" : "sm"} className={cn(!compact && "gap-2 pl-1")} aria-label={compact ? `Account: ${name}` : undefined}>
          <UserAvatar name={name} className="size-6" />
          {!compact && <span className="hidden max-w-32 truncate sm:inline">{name}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-semibold">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`/u/${me.username}`}>
              <UserIcon /> Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <SettingsIcon /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings/api-keys">
              <KeyRoundIcon /> API keys
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
