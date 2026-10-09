import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Titled card used by every settings page; `index` staggers the entrance animation. */
export function SettingsCard({
  title,
  description,
  index = 0,
  tone = "default",
  children,
}: {
  title: string;
  description?: ReactNode;
  index?: number;
  tone?: "default" | "danger";
  children?: ReactNode;
}) {
  return (
    <Card
      className={cn("animate-rise", tone === "danger" && "bg-negative/5 ring-negative/30")}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardContent className="space-y-5">
        <div>
          <h2 className={cn("text-sm font-medium", tone === "danger" && "text-negative")}>{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
