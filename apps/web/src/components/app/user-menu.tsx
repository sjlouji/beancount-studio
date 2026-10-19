"use client";

import { KeyRoundIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
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

export function UserMenu({ tone = "default" }: { tone?: "default" | "onAubergine" }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const onAubergine = tone === "onAubergine";
  if (!me) {
    return (
      <Button asChild size="sm" variant={onAubergine ? "outline-on-aubergine" : "outline"}>
        <Link href="/login">Sign in</Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={onAubergine ? "ghost-on-aubergine" : "ghost"} size="sm" className="gap-2 pl-1.5">
          <Avatar className="size-6 rounded-md">
            <AvatarFallback className={cn("rounded-md text-[10px] font-bold", onAubergine ? "bg-sidebar-foreground text-primary" : "bg-secondary text-primary")}>
              {initialsOf(me.displayName || me.username)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate sm:inline">{me.displayName || me.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-semibold">{me.displayName || me.username}</span>
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
