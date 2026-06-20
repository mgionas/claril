/**
 * `bpmn-auto-layout` ships no type definitions. This bare ambient declaration
 * lets the regression test import `layoutProcess` (the only surface used here).
 */
declare module "bpmn-auto-layout" {
  export function layoutProcess(xml: string): Promise<string>;
}
