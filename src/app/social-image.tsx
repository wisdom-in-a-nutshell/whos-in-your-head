import { ImageResponse } from "next/og";

const paper = "#fbfaf6";
const ink = "#171311";
const accent = "#c83832";

export const socialImageAlt =
  "Who's In Your Head? Think of someone famous. I'll guess in 21 questions.";

type SocialImageOptions = {
  width: number;
  height: number;
};

export function createSocialImage({ width, height }: SocialImageOptions) {
  const isCompact = height <= 600;

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
          padding: isCompact ? "46px 64px 52px" : "52px 64px 58px",
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
            gap: isCompact ? 20 : 26,
            maxWidth: 1050
          }}
        >
          <div
            style={{
              fontSize: isCompact ? 108 : 116,
              fontWeight: 950,
              lineHeight: 0.9
            }}
          >
            Think of someone famous.
          </div>
          <div
            style={{
              color: accent,
              fontSize: isCompact ? 100 : 108,
              fontWeight: 950,
              lineHeight: 0.9
            }}
          >
            I&apos;ll guess who.
          </div>
        </div>

        <div />
      </div>
    ),
    { width, height }
  );
}
