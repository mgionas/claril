import Viewer from "bpmn-js/lib/Viewer";

/** Headlessly render BPMN XML to an SVG data URL using a transient bpmn-js
 * Viewer. The viewer is attached off-screen before saveSVG() because a fully
 * detached SVG can getBBox()=0 in some engines, then destroyed. */
export async function renderBpmnToDataUrl(xml: string): Promise<string> {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.left = "-9999px";
  host.style.top = "0";
  host.style.width = "1200px";
  host.style.height = "900px";
  document.body.appendChild(host);
  const viewer = new Viewer({ container: host });
  try {
    await viewer.importXML(xml);
    const { svg } = await viewer.saveSVG();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  } finally {
    viewer.destroy();
    host.remove();
  }
}
