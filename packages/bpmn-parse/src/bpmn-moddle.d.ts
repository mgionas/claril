/**
 * `bpmn-moddle` ships no type definitions. This bare ambient declaration lets
 * us import its `BpmnModdle` constructor; the concrete (typed) surface we use
 * is declared locally in parse.ts via a cast, so dependent packages need
 * nothing extra beyond their own copy of this declaration.
 */
declare module "bpmn-moddle" {
  export const BpmnModdle: unknown;
}
