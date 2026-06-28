import { ImageResponse } from "next/og";

/** Dynamic favicon — the Claril mark (accent dot on the dark canvas). */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#4d8dff" }} />
      </div>
    ),
    { ...size },
  );
}
