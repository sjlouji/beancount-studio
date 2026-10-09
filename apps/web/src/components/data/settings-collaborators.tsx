"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOutIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CardSkeleton, ErrorState } from "@/components/app/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { apiDelete, apiGet, apiPut, errorMessage } from "@/lib/api/client";
import { keys, ledgerPath, useCollaborators } from "@/lib/api/hooks";
import type { Collaborator, Ledger } from "@/lib/api/types";

type Role = Collaborator["role"];

const ROLES: Array<{ value: Role; label: string }> = [
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
  { value: "admin", label: "Admin" },
];

interface UserHit {
  username: string;
  displayName: string;
}

function RoleSelect({ value, onChange, disabled, label }: { value: Role; onChange: (role: Role) => void; disabled?: boolean; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-28" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((role) => (
          <SelectItem key={role.value} value={role.value}>
            {role.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useCollaboratorMutations(owner: string, slug: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.ledgerScope(owner, slug, "collaborators") });
  const path = (username: string) => `${ledgerPath(owner, slug)}/collaborators/${encodeURIComponent(username)}`;
  const upsert = useMutation({
    mutationFn: ({ username, role }: { username: string; role: Role }) => apiPut<Collaborator>(path(username), { role }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, "Couldn't update the collaborator")),
  });
  const remove = useMutation({
    mutationFn: (username: string) => apiDelete<void>(path(username)),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, "Couldn't remove the collaborator")),
  });
  return { upsert, remove };
}

/** Username search backed by GET /users/search (prefix match on username, exact match on email). */
function AddCollaborator({ owner, slug, existing }: { owner: string; slug: string; existing: Set<string> }) {
  const { upsert } = useCollaboratorMutations(owner, slug);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [role, setRole] = useState<Role>("read");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), 200);
    return () => clearTimeout(timer);
  }, [input]);

  const hits = useQuery<UserHit[]>({
    queryKey: ["users", "search", debounced],
    queryFn: () => apiGet<UserHit[]>("/users/search", { q: debounced }),
    enabled: debounced.length > 0,
  });
  const candidates = (hits.data ?? []).filter((u) => !existing.has(u.username) && u.username !== owner);

  const add = () => {
    if (!picked) return;
    upsert.mutate(
      { username: picked.username, role },
      {
        onSuccess: () => {
          toast.success(`${picked.username} added as ${role}`);
          setPicked(null);
          setInput("");
        },
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-64 justify-start font-normal">
            <UserPlusIcon data-icon="inline-start" />
            {picked ? <span className="font-mono text-[13px]">{picked.username}</span> : <span className="text-muted-foreground">Find a user…</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={input} onValueChange={setInput} placeholder="Username or email" />
            <CommandList>
              {hits.isError ? (
                <p className="p-3 text-sm text-negative">{errorMessage(hits.error)}</p>
              ) : hits.isFetching ? (
                <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Spinner className="size-3.5" /> Searching…
                </p>
              ) : (
                <>
                  {debounced.length > 0 && <CommandEmpty>No users found.</CommandEmpty>}
                  <CommandGroup>
                    {candidates.map((user) => (
                      <CommandItem
                        key={user.username}
                        value={user.username}
                        onSelect={() => {
                          setPicked(user);
                          setOpen(false);
                        }}
                      >
                        <span className="font-mono text-[13px]">{user.username}</span>
                        <span className="truncate text-xs text-muted-foreground">{user.displayName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <RoleSelect value={role} onChange={setRole} label="Role for the new collaborator" />
      <Button onClick={add} disabled={!picked || upsert.isPending}>
        {upsert.isPending && <Spinner data-icon="inline-start" />} Add collaborator
      </Button>
    </div>
  );
}

export function CollaboratorsCard({ ledger }: { ledger: Ledger }) {
  const { owner, slug } = ledger;
  const collaborators = useCollaborators(owner, slug);
  const { upsert, remove } = useCollaboratorMutations(owner, slug);

  return (
    <Card className="animate-rise [animation-delay:80ms]">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Collaborators</CardTitle>
        <CardDescription>Read can view, Write can edit entries and files, Admin can also manage settings and collaborators.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {collaborators.isPending ? (
          <CardSkeleton rows={2} className="border-0 p-0" />
        ) : collaborators.isError ? (
          <ErrorState error={collaborators.error} onRetry={() => void collaborators.refetch()} />
        ) : (
          <>
            <ul className="divide-y">
              <li className="flex items-center gap-3 py-2">
                <Avatar size="sm">
                  <AvatarFallback>{owner.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px]">{owner}</div>
                </div>
                <span className="text-xs text-muted-foreground">Owner</span>
              </li>
              {collaborators.data.map((person) => (
                <li key={person.username} className="flex items-center gap-3 py-2">
                  <Avatar size="sm">
                    <AvatarFallback>{person.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px]">{person.username}</div>
                    <div className="truncate text-xs text-muted-foreground">{person.displayName}</div>
                  </div>
                  <RoleSelect
                    value={person.role}
                    label={`Role for ${person.username}`}
                    disabled={upsert.isPending}
                    onChange={(role) => upsert.mutate({ username: person.username, role }, { onSuccess: () => toast.success(`${person.username} is now ${role}`) })}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${person.username}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(person.username, { onSuccess: () => toast.success(`${person.username} removed`) })}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
            {collaborators.data.length === 0 && <p className="text-sm text-muted-foreground">No collaborators yet. Add someone below to share this ledger.</p>}
            <AddCollaborator owner={owner} slug={slug} existing={new Set(collaborators.data.map((c) => c.username))} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Non-admin collaborators can remove themselves from the ledger. */
export function LeaveCard({ ledger, username }: { ledger: Ledger; username: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const leave = useMutation({
    mutationFn: () => apiDelete<void>(`${ledgerPath(ledger.owner, ledger.slug)}/collaborators/${encodeURIComponent(username)}`),
    onSuccess: () => {
      toast.success(`You left ${ledger.title}`);
      qc.removeQueries({ queryKey: keys.ledger(ledger.owner, ledger.slug) });
      void qc.invalidateQueries({ queryKey: keys.ledgers });
      router.push("/ledgers");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't leave the ledger")),
  });

  return (
    <Card className="animate-rise [animation-delay:80ms]">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Membership</CardTitle>
        <CardDescription>
          You have <span className="font-medium text-foreground">{ledger.role}</span> access to {ledger.owner}/{ledger.slug}.
        </CardDescription>
      </CardHeader>
      <CardFooter className="border-t">
        <Button variant="outline" onClick={() => leave.mutate()} disabled={leave.isPending}>
          {leave.isPending ? <Spinner data-icon="inline-start" /> : <LogOutIcon data-icon="inline-start" />} Leave ledger
        </Button>
      </CardFooter>
    </Card>
  );
}
