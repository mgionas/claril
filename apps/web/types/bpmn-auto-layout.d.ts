declare module "bpmn-auto-layout" {
  /**
   * Add/refresh BPMN diagram interchange (DI) for a semantic BPMN 2.0 XML
   * string and return the laid-out XML. DOM-free — safe in a server action.
   */
  export function layoutProcess(xml: string): Promise<string>;
}
