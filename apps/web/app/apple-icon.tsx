import { ImageResponse } from "next/og";

/** Apple touch icon — the Claril mark on the dark canvas, rounded. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0d",
        }}
      >
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: "#4d8dff" }} />
      </div>
    ),
    { ...size },
  );
}
