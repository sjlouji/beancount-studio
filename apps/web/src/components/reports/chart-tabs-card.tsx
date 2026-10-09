import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A card whose header has a title on the left and compact tabs on the right. */
export function ChartTabsCard({
  title,
  tabs,
  defaultValue,
  className,
}: {
  title: ReactNode;
  tabs: Array<{ value: string; label: string; content: ReactNode }>;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent>
        <Tabs defaultValue={defaultValue ?? tabs[0]?.value}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">{title}</h2>
            <TabsList className="h-7">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
