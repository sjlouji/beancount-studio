"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore, type ComponentType } from "react";
import { SettingsCard } from "@/components/settings/settings-card";
import { cn } from "@/lib/utils";

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: Array<{ value: ThemeChoice; label: string; hint: string; icon: ComponentType<{ className?: string }> }> = [
  { value: "light", label: "Light", hint: "Warm paper tones", icon: SunIcon },
  { value: "dark", label: "Dark", hint: "Easy on the eyes", icon: MoonIcon },
  { value: "system", label: "System", hint: "Follow your device", icon: MonitorIcon },
];

const noopSubscribe = () => () => {};

/**
 * Tiny window mock. The light pane uses fixed palette colours so it renders light even while the app is dark;
 * the dark pane opts into the `.dark` token set locally.
 */
function Pane({ tone, className }: { tone: "light" | "dark"; className?: string }) {
  const light = tone === "light";
  return (
    <div className={cn(tone === "dark" && "dark", "absolute inset-0 p-2", light ? "bg-stone-50" : "bg-background", className)}>
      <div className={cn("flex h-full flex-col gap-1.5 rounded-sm border p-1.5", light ? "border-stone-200 bg-white" : "border-border bg-card")}>
        <div className={cn("h-1.5 w-1/2 rounded-full", light ? "bg-emerald-700" : "bg-primary")} />
        <div className={cn("h-1 w-5/6 rounded-full", light ? "bg-stone-200" : "bg-muted")} />
        <div className={cn("h-1 w-2/3 rounded-full", light ? "bg-stone-200" : "bg-muted")} />
      </div>
    </div>
  );
}

function Swatch({ value }: { value: ThemeChoice }) {
  return (
    <div aria-hidden className="relative h-16 w-full overflow-hidden rounded-md border">
      {value === "system" ? (
        <>
          <Pane tone="light" />
          <Pane tone="dark" className="[clip-path:polygon(100%_0,100%_100%,0_100%)]" />
        </>
      ) : (
        <Pane tone={value} />
      )}
    </div>
  );
}

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the stored theme on the client; avoid a hydration mismatch on the selected state.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : null;

  return (
    <SettingsCard title="Appearance" description="Saved in this browser. System follows your operating system and switches automatically." index={1}>
      <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
        {CHOICES.map(({ value, label, hint, icon: Icon }) => {
          const selected = current === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col gap-3 rounded-lg border p-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                selected && "border-primary bg-accent/60 ring-2 ring-primary/20",
              )}
            >
              <Swatch value={value} />
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="truncate text-xs text-muted-foreground">{hint}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </SettingsCard>
  );
}
