import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";
import {
  MP_PROFILES,
  DONATION_TRAILS,
  TOPIC_STATS,
  PARTY_COLORS,
  formatDollars,
  mpPhotoUrl,
} from "@/lib/card-data";

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

/* ── Shared card wrapper ── */
function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#0a0a0f",
        padding: "48px 56px",
        fontFamily: "sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle gradient overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(ellipse at 20% 50%, rgba(255,215,0,0.04) 0%, transparent 60%)",
          display: "flex",
        }}
      />
      {/* Top border accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          background:
            "linear-gradient(to right, #FFD700, #b89b00, transparent)",
          display: "flex",
        }}
      />
      {children}
      {/* Watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          right: 56,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#FFD700",
            letterSpacing: "0.05em",
          }}
        >
          OPAX
        </span>
        <span style={{ fontSize: 14, color: "#8b949e" }}>opax.com.au</span>
      </div>
      {/* Bottom-left source note */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          left: 56,
          display: "flex",
        }}
      >
        <span style={{ fontSize: 11, color: "#8b949e", opacity: 0.6 }}>
          Source: Hansard + AEC Disclosure Returns
        </span>
      </div>
    </div>
  );
}

/* ── MP Disconnect Card ── */
function MpDisconnectCard({
  mpId,
  topic,
}: {
  mpId: string;
  topic: string;
}) {
  const mp = MP_PROFILES[mpId];
  if (!mp) return <CardShell><div style={{ display: "flex", color: "#DC2626", fontSize: 32 }}>MP not found</div></CardShell>;

  const partyColor = PARTY_COLORS[mp.party] || "#888";
  const topicLabel = TOPIC_STATS[topic]?.label || topic;
  const photoUrl = mpPhotoUrl(mp.photoId);

  return (
    <CardShell>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 40,
          flex: 1,
        }}
      >
        {/* Left: Photo + identity */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            minWidth: 180,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt={mp.name}
            width={140}
            height={140}
            style={{
              borderRadius: "50%",
              border: `3px solid ${partyColor}`,
              objectFit: "cover",
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#e6edf3",
                textAlign: "center",
              }}
            >
              {mp.name}
            </span>
            <span
              style={{
                fontSize: 14,
                color: partyColor,
                fontWeight: 600,
                marginTop: 2,
              }}
            >
              {mp.party}
            </span>
            <span style={{ fontSize: 12, color: "#8b949e", marginTop: 2 }}>
              {mp.electorate}
            </span>
          </div>
        </div>

        {/* Right: Stats */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            gap: 16,
            justifyContent: "center",
          }}
        >
          {/* Topic label */}
          <div style={{ display: "flex" }}>
            <span
              style={{
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                color: "#FFD700",
                fontWeight: 600,
              }}
            >
              {topicLabel}
            </span>
          </div>

          {/* Spoke stat */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 42, fontWeight: 700, color: "#e6edf3" }}>
              Spoke about reform{" "}
              <span style={{ color: "#FFD700" }}>{mp.speeches}</span> times
            </span>
          </div>

          {/* What they did */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 14,
            }}
          >
            <span
              style={{
                fontSize: 16,
                color: "#8b949e",
                lineHeight: 1.5,
              }}
            >
              {mp.voted}
            </span>
          </div>

          {/* Disconnect badge */}
          {mp.disconnect && (
            <div style={{ display: "flex", marginTop: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: "rgba(220, 38, 38, 0.15)",
                  border: "1px solid rgba(220, 38, 38, 0.3)",
                  borderRadius: 6,
                  padding: "6px 16px",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: "#DC2626",
                    display: "flex",
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#DC2626",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Disconnect Detected
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </CardShell>
  );
}

/* ── Donation Trail Card ── */
function DonationTrailCard({
  industry,
  party,
}: {
  industry: string;
  party?: string;
}) {
  const trail = DONATION_TRAILS[industry];
  if (!trail) return <CardShell><div style={{ display: "flex", color: "#DC2626", fontSize: 32 }}>Industry not found</div></CardShell>;

  const parties = party
    ? trail.parties.filter((p) => p.party === party)
    : trail.parties;

  const maxAmount = Math.max(...parties.map((p) => p.amount));

  return (
    <CardShell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          gap: 20,
        }}
      >
        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#FFD700",
              fontWeight: 600,
            }}
          >
            Follow the Money
          </span>
          <span style={{ fontSize: 44, fontWeight: 700, color: "#e6edf3" }}>
            {trail.industry} Donations
          </span>
          <span style={{ fontSize: 16, color: "#8b949e" }}>
            {trail.period} | Total: {formatDollars(trail.totalDonations)}
          </span>
        </div>

        {/* Bar chart */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            flex: 1,
            justifyContent: "center",
          }}
        >
          {parties.map((p) => (
            <div
              key={p.party}
              style={{ display: "flex", alignItems: "center", gap: 16 }}
            >
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#e6edf3",
                  minWidth: 48,
                }}
              >
                {p.party}
              </span>
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  height: 36,
                  backgroundColor: "rgba(255,255,255,0.03)",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(p.amount / maxAmount) * 100}%`,
                    height: "100%",
                    backgroundColor: p.color,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {formatDollars(p.amount)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom line */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 14,
          }}
        >
          <span style={{ fontSize: 18, color: "#8b949e" }}>
            Meanwhile: <span style={{ color: "#DC2626", fontWeight: 700 }}>{trail.reformBillsPassed} major reform bills</span> passed
          </span>
        </div>
      </div>
    </CardShell>
  );
}

/* ── Topic Stat Card ── */
function TopicStatCard({ topic }: { topic: string }) {
  const stat = TOPIC_STATS[topic];
  if (!stat) return <CardShell><div style={{ display: "flex", color: "#DC2626", fontSize: 32 }}>Topic not found</div></CardShell>;

  return (
    <CardShell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 24,
        }}
      >
        {/* Main headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span
            style={{
              fontSize: 13,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "#FFD700",
              fontWeight: 600,
            }}
          >
            OPAX Investigation
          </span>
          <span style={{ fontSize: 64, fontWeight: 700, color: "#FFD700" }}>
            {stat.yearsOfDebate} YEARS OF DEBATE
          </span>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "flex",
            gap: 40,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#e6edf3" }}>
              {stat.speeches.toLocaleString()}
            </span>
            <span style={{ fontSize: 14, color: "#8b949e" }}>
              speeches on {stat.label.toLowerCase()}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#e6edf3" }}>
              {stat.mpsInvolved}
            </span>
            <span style={{ fontSize: 14, color: "#8b949e" }}>
              MPs involved
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 700, color: "#e6edf3" }}>
              {formatDollars(stat.industryDonations)}
            </span>
            <span style={{ fontSize: 14, color: "#8b949e" }}>
              in industry donations
            </span>
          </div>
        </div>

        {/* Result */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            paddingTop: 20,
          }}
        >
          <span style={{ fontSize: 13, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Result:
          </span>
          <span style={{ fontSize: 24, fontWeight: 700, color: "#DC2626" }}>
            {stat.result}
          </span>
        </div>
      </div>
    </CardShell>
  );
}

/* ── Route handler ── */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");

  try {
    let element: React.ReactElement;

    switch (type) {
      case "mp-disconnect": {
        const mp = searchParams.get("mp") || "10007";
        const topic = searchParams.get("topic") || "gambling";
        element = <MpDisconnectCard mpId={mp} topic={topic} />;
        break;
      }
      case "donation-trail": {
        const industry = searchParams.get("industry") || "gambling";
        const party = searchParams.get("party") || undefined;
        element = <DonationTrailCard industry={industry} party={party} />;
        break;
      }
      case "topic-stat": {
        const topic = searchParams.get("topic") || "gambling";
        element = <TopicStatCard topic={topic} />;
        break;
      }
      default:
        return new Response(
          JSON.stringify({
            error: "Unknown card type. Use: mp-disconnect, donation-trail, topic-stat",
            examples: [
              "/api/card?type=mp-disconnect&mp=10007&topic=gambling",
              "/api/card?type=donation-trail&industry=gambling",
              "/api/card?type=donation-trail&industry=gambling&party=ALP",
              "/api/card?type=topic-stat&topic=gambling",
            ],
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
    }

    return new ImageResponse(element, {
      width: WIDTH,
      height: HEIGHT,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Card generation error:", message);
    return new Response(`Failed to generate card image: ${message}`, {
      status: 500,
    });
  }
}
