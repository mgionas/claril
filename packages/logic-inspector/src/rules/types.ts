import type { Finding } from "@claril/shared";
import type { ProcessGraph } from "../types";

/** A single, independent, deterministic analysis rule. */
export interface Rule {
  id: string;
  run(graph: ProcessGraph): Finding[];
}
