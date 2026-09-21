import Link from "next/link";
import type { Route } from "next";
import { Card } from "@/components/ui";
import type { CompanyDayStory } from "@/lib/day-review/company-story";

const lineStyle = {
  margin: 0,
  fontSize: "var(--text-base)",
  lineHeight: 1.45,
} as const;

export function CompanyDayStoryCard({
  story,
  holdHref,
}: {
  story: CompanyDayStory;
  holdHref?: string | null;
}) {
  return (
    <Card data-testid="company-day-story" style={{ marginBottom: "var(--space-6)" }}>
      <h2
        style={{
          fontSize: "var(--text-lg)",
          fontWeight: 700,
          margin: "0 0 var(--space-3)",
        }}
      >
        Today
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <p style={{ ...lineStyle, fontWeight: 600 }}>{story.housesLine}</p>
        {holdHref ? (
          <Link href={holdHref as Route} style={{ ...lineStyle, color: "inherit", textDecoration: "none" }}>
            {story.billsLine}
          </Link>
        ) : (
          <p style={lineStyle}>{story.billsLine}</p>
        )}
        <p style={lineStyle}>{story.comingBackLine}</p>
        <p style={lineStyle}>{story.leftoversLine}</p>
      </div>
    </Card>
  );
}
