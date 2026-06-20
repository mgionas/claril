import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp-server";
import { invalidXml, validXml } from "./fixtures";

/** Connect an in-memory MCP client to the Claril server. */
async function connectClient() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("MCP lint_bpmn tool", () => {
  it("exposes the lint_bpmn tool", async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("lint_bpmn");
  });

  it("returns ok=true and no findings for a valid diagram", async () => {
    const client = await connectClient();
    const res = await client.callTool({ name: "lint_bpmn", arguments: { xml: validXml } });
    const structured = res.structuredContent as {
      ok: boolean;
      findings: unknown[];
    };
    expect(structured.ok).toBe(true);
    expect(structured.findings).toHaveLength(0);
  });

  it("returns ok=false with findings for a known-bad diagram", async () => {
    const client = await connectClient();
    const res = await client.callTool({ name: "lint_bpmn", arguments: { xml: invalidXml } });
    const structured = res.structuredContent as {
      ok: boolean;
      counts: { error: number };
      findings: { ruleId: string }[];
    };
    expect(structured.ok).toBe(false);
    expect(structured.counts.error).toBeGreaterThan(0);
    expect(structured.findings.map((f) => f.ruleId)).toContain("structural/missing-end-event");
  });

  it("errors when neither xml nor path is given", async () => {
    const client = await connectClient();
    const res = (await client.callTool({ name: "lint_bpmn", arguments: {} })) as {
      isError?: boolean;
    };
    expect(res.isError).toBe(true);
  });
});
