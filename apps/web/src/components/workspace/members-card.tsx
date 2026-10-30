"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ErrorState, ListSkeleton } from "@/components/app/states";
import { UserAvatar } from "@/components/app/user-menu";
import { SettingsCard } from "@/components/settings/settings-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api/client";
import { useMe, useRemoveMember, useSetMemberRole } from "@/lib/api/hooks";
import type { Member, Workspace, WorkspaceRole } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS, ROLE_OPTIONS, ROLE_RANK, canAdminister } from "./rules";

/** Everyone in the workspace. Admins change roles below their own and remove those people. */
export function MembersCard({ workspace, members, index = 0 }: { workspace: Workspace; members: UseQueryResult<Member[]>; index?: number }) {
  const { data: me } = useMe();
  const setRole = useSetMemberRole(workspace.slug);
  const remove = useRemoveMember(workspace.slug);
  const myRank = ROLE_RANK[workspace.role];
  const admin = canAdminister(workspace.role);

  return (
    <SettingsCard
      id="members"
      index={index}
      title="Members"
      description="Everyone here sees every ledger in the workspace. Owners and admins manage it, members write, viewers read."
    >
      {members.isPending ? (
        <ListSkeleton rows={3} />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => void members.refetch()} />
      ) : (
        <ul className="divide-y">
          {members.data.map((person) => {
            const self = me?.username === person.username;
            const editable = admin && !self && myRank > ROLE_RANK[person.role];
            const name = person.displayName || person.username;
            return (
              <li key={person.username} className="flex items-center gap-3 py-2.5">
                <UserAvatar name={name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {name}
                    {self && <span className="ml-1.5 font-normal text-muted-foreground">(you)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">@{person.username}</span> · joined {formatRelative(person.joinedAt)}
                  </div>
                </div>
                {editable ? (
                  <Select
                    value={person.role}
                    disabled={setRole.isPending}
                    onValueChange={(role) =>
                      setRole.mutate(
                        { username: person.username, role: role as WorkspaceRole },
                        {
                          onSuccess: () => toast.success(`${person.username} is now ${ROLE_LABELS[role as WorkspaceRole].toLowerCase()}`),
                          onError: (error) => toast.error(errorMessage(error, "Couldn't change the role")),
                        },
                      )
                    }
                  >
                    <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${person.username}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.filter((option) => ROLE_RANK[option.value] <= myRank).map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{ROLE_LABELS[person.role]}</Badge>
                )}
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${person.username}`}
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(person.username, {
                        onSuccess: () => toast.success(`${person.username} was removed`),
                        onError: (error) => toast.error(errorMessage(error, "Couldn't remove the member")),
                      })
                    }
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}
