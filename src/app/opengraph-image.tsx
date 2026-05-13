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
  const marks = Array.from({ length: 21 }, (_, index) => index);
  const answers = ["Yes", "No", "Not sure"];

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
          padding: "48px 58px 46px",
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 25,
            fontWeight: 900,
            letterSpacing: 2.4,
            textTransform: "uppercase"
          }}
        >
          <div>Who&apos;s In Your Head?</div>
          <div
            style={{
              border: `3px solid ${ink}`,
              borderRadius: 999,
              padding: "13px 22px",
              fontSize: 23
            }}
          >
            21 questions / 1 guess
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 48
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              maxWidth: 725
            }}
          >
            <div
              style={{
                color: accent,
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: 3,
                textTransform: "uppercase"
              }}
            >
              Let&apos;s play, human
            </div>
            <div
              style={{
                fontSize: 94,
                fontWeight: 950,
                lineHeight: 0.91
              }}
            >
              Think of someone famous. I&apos;ll guess.
            </div>
            <div
              style={{
                maxWidth: 650,
                color: muted,
                fontSize: 34,
                fontWeight: 750,
                lineHeight: 1.22
              }}
            >
              I get 21 questions. You only answer yes, no, or not sure.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              width: 310
            }}
          >
            {answers.map((answer, index) => (
              <div
                key={answer}
                style={{
                  height: 84,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `3px solid ${ink}`,
                  borderRadius: 14,
                  background: index === 0 ? accent : paper,
                  color: index === 0 ? paper : ink,
                  boxShadow: index === 0 ? `10px 10px 0 ${ink}` : "none",
                  fontSize: 34,
                  fontWeight: 900
                }}
              >
                {answer}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16
          }}
        >
          <div
            style={{
              color: muted,
              fontSize: 23,
              fontWeight: 900,
              letterSpacing: 2.6,
              textTransform: "uppercase"
            }}
          >
            Question limit
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {marks.map((mark) => (
              <div
                key={mark}
                style={{
                  width: 45,
                  height: 18,
                  border: `3px solid ${ink}`,
                  borderRadius: 999,
                  background: mark < 6 ? accent : paper
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    size
  );
}
