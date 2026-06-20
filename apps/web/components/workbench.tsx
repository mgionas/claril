"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { Finding } from "@claril/shared";
import { TopBar } from "@/components/top-bar";
import { InspectorPanel } from "@/components/inspector-panel";
import { CommandBar } from "@/components/command-bar";

// bpmn-js touches the DOM, so it must run client-only.
const BpmnCanvas = dynamic(() => import("@/components/bpmn-canvas"), { ssr: false });

export function Workbench() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const handleFindings = useCallback((next: Finding[]) => setFindings(next), []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-fg">
      <BpmnCanvas onFindingsChange={handleFindings} />
      <TopBar />
      <InspectorPanel findings={findings} />
      <CommandBar />
    </main>
  );
}
