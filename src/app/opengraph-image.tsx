import { ImageResponse } from "next/og";

const paper = "#fbfaf6";
const ink = "#171311";
const muted = "#706462";
const accent = "#c83832";

export const alt =
  "Who's In Your Head? Think of someone famous. I'll guess in 21 questions.";
export const size = {
  width: 1200,
  height: 630
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: paper,
          color: ink,
          padding: "52px 64px 58px",
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 2.6,
            textTransform: "uppercase"
          }}
        >
          <div>Who&apos;s In Your Head?</div>
          <div
            style={{
              border: `3px solid ${ink}`,
              borderRadius: 999,
              padding: "15px 24px",
              fontSize: 24
            }}
          >
            21 questions / 1 guess
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 26,
            maxWidth: 1050
          }}
        >
          <div
            style={{
              fontSize: 116,
              fontWeight: 950,
              lineHeight: 0.9
            }}
          >
            Think of someone famous.
          </div>
          <div
            style={{
              color: accent,
              fontSize: 108,
              fontWeight: 950,
              lineHeight: 0.9
            }}
          >
            I&apos;ll guess who.
          </div>
        </div>

        <div
          style={{
            color: muted,
            fontSize: 34,
            fontWeight: 800
          }}
        >
          Don&apos;t say it out loud.
        </div>
      </div>
    ),
    size
  );
}
