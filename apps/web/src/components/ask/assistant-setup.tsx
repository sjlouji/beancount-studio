"use client";

import { CpuIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { SettingsCard } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api/client";
import { useAiConnection, useConnectOllama, useDisconnectOllama, useMe } from "@/lib/api/hooks";
import type { AiConnectionStatus, OllamaModel } from "@/lib/api/types";
import { formatBytes } from "@/lib/format";

const CODE = "rounded bg-muted px-1 font-mono text-xs";

/** The model to offer first: the connected one, else the newest model that can chat. */
function defaultModel(status: AiConnectionStatus): string {
  const models = status.detected?.models ?? [];
  if (status.connection && models.some((m) => m.name === status.connection!.model)) return status.connection.model;
  return (models.find((m) => m.canChat === true) ?? models.find((m) => m.canChat !== false))?.name ?? "";
}

function modelLabel(model: OllamaModel): string {
  const size = model.parameterSize ?? formatBytes(model.size);
  return model.canChat === false ? `${model.name} · can't chat` : `${model.name} · ${size}`;
}

/** Ollama's models with the one to use and a button to connect it. */
function OllamaPicker({ status, actionLabel }: { status: AiConnectionStatus; actionLabel: string }) {
  const detected = status.detected!;
  const [model, setModel] = useState(() => defaultModel(status));
  const connect = useConnectOllama();
  const chosen = detected.models.find((m) => m.name === model);
  const unchanged = status.connection?.model === model && status.connection.baseUrl === detected.baseUrl;
  return (
    <form
      className="flex flex-wrap items-center justify-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        connect.mutate(
          { baseUrl: detected.baseUrl, model },
          {
            onSuccess: () => toast.success(`The assistant now uses ${model}`),
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      }}
    >
      <Select value={model} onValueChange={setModel}>
        <SelectTrigger className="w-72 max-w-full" aria-label="Ollama model">
          <SelectValue placeholder="Choose a model" />
        </SelectTrigger>
        <SelectContent>
          {detected.models.map((m) => (
            <SelectItem key={m.name} value={m.name} disabled={m.canChat === false}>
              {modelLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" disabled={!model || chosen?.canChat === false || unchanged || connect.isPending}>
        {connect.isPending && <Spinner data-icon="inline-start" />}
        {actionLabel}
      </Button>
    </form>
  );
}

/**
 * Shown where the assistant would be when no model is set up. An administrator can connect the
 * Ollama server running on this machine in one step; everyone else is told who can.
 */
export function AssistantSetup({ className }: { className?: string }) {
  const { data: me } = useMe();
  const isAdmin = Boolean(me?.isAdmin);
  const status = useAiConnection(isAdmin);

  if (!isAdmin) {
    return (
      <EmptyState
        className={className}
        icon={<SparklesIcon />}
        title="The assistant isn't set up yet"
        description="Ask an administrator of this Beancount Studio to connect a model. Everything else works without it."
      />
    );
  }
  if (status.isPending) return <LoadingState label="Looking for Ollama…" className={className} />;
  if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} className={className} />;

  const detected = status.data.detected;
  const chatModels = detected?.models.filter((m) => m.canChat !== false) ?? [];
  if (!detected) {
    return (
      <EmptyState
        className={className}
        icon={<CpuIcon />}
        title="Start Ollama to chat"
        description={
          <>
            Open the Ollama app (or run <code className={CODE}>ollama serve</code>), then check again. To use Anthropic instead, set <code className={CODE}>BS_ANTHROPIC_API_KEY</code> on the server.
          </>
        }
        action={
          <Button variant="secondary" onClick={() => void status.refetch()} disabled={status.isFetching}>
            {status.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            Check again
          </Button>
        }
      />
    );
  }
  if (chatModels.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={<CpuIcon />}
        title="Ollama has no chat model"
        description={
          <>
            The assistant needs a model that calls tools. Pull one, for example <code className={CODE}>ollama pull qwen3:14b</code>, then check again.
          </>
        }
        action={
          <Button variant="secondary" onClick={() => void status.refetch()} disabled={status.isFetching}>
            {status.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            Check again
          </Button>
        }
      />
    );
  }
  return (
    <EmptyState
      className={className}
      icon={<SparklesIcon />}
      title="Chat with Ollama"
      description={`Ollama is running at ${detected.baseUrl}. Pick a model to power the assistant; it stays on this machine.`}
      action={<OllamaPicker status={status.data} actionLabel="Connect" />}
    />
  );
}

/** Settings → General, for administrators: which model the assistant uses, and changing it. */
export function AssistantModelCard({ index }: { index: number }) {
  const { data: me } = useMe();
  const status = useAiConnection(Boolean(me?.isAdmin));
  const disconnect = useDisconnectOllama();
  if (!me?.isAdmin) return null;

  const body = () => {
    if (status.isPending) return <LoadingState label="Looking for Ollama…" className="py-6" />;
    if (status.isError) return <ErrorState error={status.error} onRetry={() => void status.refetch()} />;
    const { connection, detected, provider, model, environmentProvider } = status.data;
    return (
      <div className="space-y-4">
        <p className="text-sm">
          {connection
            ? `The assistant uses ${connection.model} on Ollama at ${connection.baseUrl}.`
            : provider
              ? `The assistant uses ${model ?? "the server's default model"} from the server's settings (${provider === "anthropic" ? "Anthropic" : "an OpenAI-compatible server"}).`
              : "The assistant isn't set up."}
        </p>
        {detected ? (
          <div className="flex flex-wrap items-center gap-2">
            <OllamaPicker key={connection?.model ?? "none"} status={status.data} actionLabel={connection ? "Switch model" : "Connect"} />
            {connection && (
              <Button
                variant="destructive"
                disabled={disconnect.isPending}
                onClick={() =>
                  disconnect.mutate(undefined, {
                    onSuccess: () => toast.success(environmentProvider ? "Disconnected Ollama; the server's own model applies again" : "Disconnected Ollama"),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                {disconnect.isPending && <Spinner data-icon="inline-start" />}
                Disconnect
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {connection ? `Ollama isn't answering at ${connection.baseUrl}. Open the Ollama app, then reload.` : "No Ollama server is running on this machine. Open the Ollama app to use a local model."}
          </p>
        )}
      </div>
    );
  };
  return (
    <SettingsCard title="Assistant" description="The model behind Ask. A local Ollama model keeps your ledgers on this machine." index={index}>
      {body()}
    </SettingsCard>
  );
}
