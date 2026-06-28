import { ImageResponse } from "next/og";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social share card (Open Graph + Twitter) — brand lockup + tagline. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "90px",
          background: "#0b0b0d",
          backgroundImage:
            "radial-gradient(900px 500px at 80% -10%, rgba(77,141,255,0.18), transparent 60%)",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 40 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#4d8dff" }} />
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>{SITE_NAME}</div>
        </div>
        <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1.5, maxWidth: 920 }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ fontSize: 27, color: "#a1a1aa", marginTop: 30, maxWidth: 880, lineHeight: 1.35 }}>
          {SITE_DESCRIPTION}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 44, fontSize: 22, color: "#71717a" }}>
          Open source · AGPL · BPMN · Sequence · C4 · self-hostable
        </div>
      </div>
    ),
    { ...size },
  );
}
