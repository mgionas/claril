"use client";

import Link from "next/link";
import {
  Boxes,
  FileText,
  FolderKanban,
  GitBranch,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Pie, PieChart, Bar, BarChart, XAxis, YAxis, Cell } from "recharts";
import type { DashboardStats } from "@/lib/dashboard-stats-core";
import type { DiagramKind } from "@/lib/default-diagram";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface DashboardOverviewProps {
  stats: DashboardStats;
  userName: string;
  aiConnected: boolean;
}

const KIND_ICON: Record<DiagramKind, typeof Workflow> = {
  bpmn: Workflow,
  sequence: GitBranch,
  c4: Boxes,
};

const KIND_LABEL: Record<DiagramKind, string> = {
  bpmn: "BPMN",
  sequence: "Sequence",
  c4: "C4",
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const numberFmt = new Intl.NumberFormat("en-US");

export function DashboardOverview({ stats, userName, aiConnected }: DashboardOverviewProps) {
  const isOrg = stats.scope === "org";
  const { bpmn, sequence, c4 } = stats.diagramsByType;

  return (
    <div className="flex flex-col gap-7">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {firstName(userName)}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-fg-muted">
            An overview of your {isOrg ? "organization’s" : "personal"} diagrams.
            {aiConnected && (
              <span className="inline-flex items-center gap-1 text-fg-subtle">
                <Sparkles className="size-3 text-accent" aria-hidden />
                AI connected
              </span>
            )}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/projects">
            <FolderKanban className="size-4" />
            {stats.projectCount === 0 ? "New project" : "Go to projects"}
          </Link>
        </Button>
      </div>

      {stats.projectCount === 0 ? (
        <WholeEmptyState />
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Projects"
              value={numberFmt.format(stats.projectCount)}
            />
            <StatCard
              label="Diagrams"
              value={numberFmt.format(stats.diagramCount)}
              sub={`${bpmn} BPMN · ${sequence} Sequence · ${c4} C4`}
            />
            {isOrg && stats.memberCount !== undefined && (
              <StatCard
                label="Members"
                value={numberFmt.format(stats.memberCount)}
              />
            )}
          </div>

          {/* Charts + usage */}
          <div className="grid gap-4 lg:grid-cols-3">
            <TypeDonut bpmn={bpmn} sequence={sequence} c4={c4} />
            {isOrg && stats.usage && <UsageCard usage={stats.usage} />}
            {isOrg && stats.usage && stats.usage.byModel.length > 0 && (
              <UsageByModelChart byModel={stats.usage.byModel} />
            )}
          </div>

          {/* Recent diagrams */}
          <RecentDiagrams recent={stats.recent} />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="pb-0">
        <CardDescription className="text-fg-subtle">{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      {sub && (
        <CardContent>
          <p className="text-xs text-fg-muted">{sub}</p>
        </CardContent>
      )}
    </Card>
  );
}

function TypeDonut({ bpmn, sequence, c4 }: { bpmn: number; sequence: number; c4: number }) {
  const data = [
    { type: "bpmn", count: bpmn, fill: "var(--color-bpmn)" },
    { type: "sequence", count: sequence, fill: "var(--color-sequence)" },
    { type: "c4", count: c4, fill: "var(--color-c4)" },
  ].filter((d) => d.count > 0);

  const config: ChartConfig = {
    count: { label: "Diagrams" },
    bpmn: { label: "BPMN", color: "var(--chart-1)" },
    sequence: { label: "Sequence", color: "var(--chart-2)" },
    c4: { label: "C4", color: "var(--chart-3)" },
  };

  return (
    <Card className="py-5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium">Diagrams by type</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-center">
        {data.length === 0 ? (
          <p className="py-10 text-sm text-fg-subtle">No data yet</p>
        ) : (
          <ChartContainer config={config} className="mx-auto aspect-square max-h-[200px]">
            <PieChart>
              <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="type" hideLabel />} />
              <Pie data={data} dataKey="count" nameKey="type" innerRadius={48} strokeWidth={2}>
                {data.map((d) => (
                  <Cell key={d.type} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function UsageCard({ usage }: { usage: DashboardStats["usage"] & {} }) {
  const totalCalls = usage.byModel.reduce((n, m) => n + m.calls, 0);
  const topModels = usage.byModel.slice(0, 4);

  return (
    <Card className="py-5">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          AI usage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {numberFmt.format(usage.totalTokens)}
            </p>
            <p className="text-xs text-fg-subtle">tokens</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {numberFmt.format(totalCalls)}
            </p>
            <p className="text-xs text-fg-subtle">calls</p>
          </div>
        </div>
        {topModels.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-xs">
            {topModels.map((m) => (
              <li key={m.label} className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-fg-muted">{m.label}</span>
                <span className="shrink-0 tabular-nums text-fg-subtle">
                  {numberFmt.format(m.totalTokens)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function UsageByModelChart({ byModel }: { byModel: NonNullable<DashboardStats["usage"]>["byModel"] }) {
  const data = byModel.slice(0, 6).map((m) => ({ label: m.label, totalTokens: m.totalTokens }));
  const config: ChartConfig = {
    totalTokens: { label: "Tokens", color: "var(--chart-1)" },
  };

  return (
    <Card className="py-5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium">Tokens by model</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-video max-h-[200px] w-full">
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" dataKey="totalTokens" hide />
            <YAxis
              type="category"
              dataKey="label"
              tickLine={false}
              axisLine={false}
              width={120}
              tick={{ fontSize: 11 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="totalTokens" fill="var(--color-totalTokens)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function RecentDiagrams({ recent }: { recent: DashboardStats["recent"] }) {
  return (
    <Card className="py-5">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium">Recent diagrams</CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm" className="text-fg-muted">
            <Link href="/projects">View all</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Edited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-8 text-center text-sm text-fg-subtle">
                  No diagrams yet
                </TableCell>
              </TableRow>
            ) : (
              recent.map((d) => {
                const KindIcon = KIND_ICON[d.type] ?? FileText;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link
                        href={`/d/${d.id}`}
                        className="group flex min-w-0 items-center gap-2"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-[6px] bg-elevated text-fg-subtle">
                          <KindIcon className="size-3.5" />
                        </span>
                        <span className="truncate text-fg transition-colors group-hover:text-accent">
                          {d.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-fg-subtle">
                          {KIND_LABEL[d.type] ?? d.type}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-fg-muted">{d.projectName}</TableCell>
                    <TableCell className="text-right text-xs text-fg-subtle">
                      {relativeTime(d.updatedAt)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function WholeEmptyState() {
  return (
    <Card className="items-center py-16 text-center">
      <CardContent className="flex flex-col items-center">
        <span className="grid size-12 place-items-center rounded-[10px] bg-elevated text-fg-subtle">
          <FolderKanban className="size-6" />
        </span>
        <p className="mt-4 text-sm font-medium">No projects yet</p>
        <p className="mt-1 max-w-xs text-sm text-fg-muted">
          Create your first project to start designing BPMN, sequence, and C4 diagrams.
        </p>
        <Button asChild className="mt-5">
          <Link href="/projects">
            <FolderKanban className="size-4" />
            Go to projects
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
