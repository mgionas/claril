/**
 * `bpmn-moddle` ships no types. We re-declare the bare module here so the CLI's
 * tsc is satisfied when it compiles `@claril/bpmn-parse`'s source (raw-TS
 * monorepo). The concrete typed surface lives in @claril/bpmn-parse/src/parse.ts.
 */
declare module "bpmn-moddle" {
  export const BpmnModdle: unknown;
}
