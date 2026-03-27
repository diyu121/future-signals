import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

const C = {
  human: "#3B82F6",
  humanBg: "#EFF6FF",
  humanTxt: "#1D4ED8",
  ai: "#14B8A6",
  aiBg: "#F0FDFA",
  aiTxt: "#0F766E",
  combined: "#111827",
  border: "#E5E7EB",
  borderL: "#F3F4F6",
  txt: "#111827",
  txt2: "#6B7280",
  txt3: "#9CA3AF",
  bg: "#F9FAFB",
  surface: "#FFFFFF",
  ink: "#0F172A",
  successBg: "#ECFDF5",
  successBorder: "#BBF7D0",
  successTxt: "#166534",
  warnBg: "#FFFBEB",
  warnTxt: "#B45309",
  warnBorder: "#FDE68A",
};

const FF = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif";

const SIGNALS = [
  {
    id: "open-weight-parity-2027",
    question:
      "Will open-weight AI models reach parity with frontier proprietary models before Dec 2027?",
    category: "AI & ML",
    resolutionDate: "Dec 31, 2027",
    contributorCount: 142,
    combined: 64,
    human: 58,
    ai: 71,
    divergence: 13,
    signalStrength: "Moderate",
    verifiedExperts: 38,
    aiModels: 12,
  },
  {
    id: "arc-agi-human-level-2026",
    question:
      "Will a multimodal AI system pass the ARC-AGI benchmark at human level by end of 2026?",
    category: "AI & ML",
    resolutionDate: "Dec 31, 2026",
    contributorCount: 89,
    combined: 47,
    human: 38,
    ai: 61,
    divergence: 23,
    signalStrength: "Low",
    verifiedExperts: 18,
    aiModels: 8,
  },
  {
    id: "enterprise-code-50pct-2027",
    question:
      "Will AI-generated code account for >50% of new enterprise software commits by 2027?",
    category: "AI & ML",
    resolutionDate: "Dec 31, 2027",
    contributorCount: 203,
    combined: 72,
    human: 68,
    ai: 77,
    divergence: 9,
    signalStrength: "Strong",
    verifiedExperts: 54,
    aiModels: 10,
  },
  {
    id: "agents-multiday-2026",
    question:
      "Will AI agents complete unassisted multi-day work tasks in production environments by end of 2026?",
    category: "AI & ML",
    resolutionDate: "Dec 31, 2026",
    contributorCount: 118,
    combined: 55,
    human: 49,
    ai: 63,
    divergence: 14,
    signalStrength: "Moderate",
    verifiedExperts: 22,
    aiModels: 7,
  },
  {
    id: "eu-ai-act-withdrawal-2026",
    question:
      "Will the EU AI Act lead to a major model withdrawal from the EU market by 2026?",
    category: "Policy",
    resolutionDate: "Dec 31, 2026",
    contributorCount: 67,
    combined: 31,
    human: 35,
    ai: 24,
    divergence: 11,
    signalStrength: "Low",
    verifiedExperts: 12,
    aiModels: 5,
  },
  {
    id: "safety-pause-2027",
    question:
      "Will a major AI lab announce an emergency safety pause due to an unexpected capability jump?",
    category: "Safety",
    resolutionDate: "Dec 31, 2027",
    contributorCount: 94,
    combined: 22,
    human: 27,
    ai: 15,
    divergence: 12,
    signalStrength: "Low",
    verifiedExperts: 16,
    aiModels: 6,
  },
];

const LEADERBOARD = [
  {
    rank: 1,
    name: "Dr. Sarah Chen",
    type: "Human",
    domain: "AI Research",
    accuracy: "87%",
    calibration: "0.82",
    reputation: 94,
    influence: "High",
  },
  {
    rank: 2,
    name: "GPT-Research v4",
    type: "AI",
    domain: "General",
    accuracy: "91%",
    calibration: "0.89",
    reputation: 91,
    influence: "High",
  },
  {
    rank: 3,
    name: "Claude-Analyst",
    type: "AI",
    domain: "General",
    accuracy: "90%",
    calibration: "0.87",
    reputation: 90,
    influence: "High",
  },
  {
    rank: 4,
    name: "Marcus Webb",
    type: "Human",
    domain: "ML Engineering",
    accuracy: "83%",
    calibration: "0.79",
    reputation: 88,
    influence: "Medium",
  },
  {
    rank: 5,
    name: "Prof. James Liu",
    type: "Human",
    domain: "AI Safety",
    accuracy: "85%",
    calibration: "0.81",
    reputation: 86,
    influence: "Medium",
  },
  {
    rank: 6,
    name: "Gemini-Forecast",
    type: "AI",
    domain: "General",
    accuracy: "88%",
    calibration: "0.85",
    reputation: 85,
    influence: "Medium",
  },
];

const AI_MODELS = [
  {
    name: "GPT-Research v4",
    role: "General forecasting baseline",
    strengths: "Benchmark trend synthesis, funding signals, public research digestion",
    score: 91,
  },
  {
    name: "Claude-Analyst",
    role: "Long-form reasoning model",
    strengths: "Structured argumentation, uncertainty framing, scenario decomposition",
    score: 90,
  },
  {
    name: "Gemini-Forecast",
    role: "Momentum and ecosystem tracker",
    strengths: "Market trajectory, open-weight movement, product release synthesis",
    score: 85,
  },
  {
    name: "Internal Ensemble",
    role: "Blended AI baseline",
    strengths: "Consensus estimate across multiple model perspectives",
    score: 88,
  },
];

const EVIDENCE_INPUTS = [
  {
    title: "Llama 3.1 vs GPT-4o Benchmark Study",
    type: "Research",
    date: "Sep 2025",
    summary:
      "Meta's Llama 3.1 405B achieved within 3% of GPT-4o on MMLU and HumanEval benchmarks.",
  },
  {
    title: "Epoch AI Open-Weight Progress Report",
    type: "Research",
    date: "Jan 2026",
    summary:
      "The lag between frontier and open-weight models has compressed sharply since 2023.",
  },
  {
    title: "Enterprise Reliability Benchmarks 2025",
    type: "Benchmark",
    date: "Oct 2025",
    summary:
      "CTO survey suggests reliability and support still hold back open-weight deployment.",
  },
  {
    title: "EU AI Act Open-Weight Exemptions",
    type: "Policy",
    date: "Nov 2025",
    summary:
      "Regulatory carve-outs may accelerate open-weight adoption while introducing compliance ambiguity.",
  },
];

const AI_SYNTHESIS = {
  bullCase:
    "Rapid benchmark convergence, lower cost curves, and infrastructure investment suggest open-weight models could achieve functional parity on many important tasks before end of 2027.",
  bearCase:
    "Benchmark parity is not deployment parity. Frontier labs still hold structural advantages in safety tooling, reliability, and enterprise support.",
  keyUncertainty:
    "The definition of parity is contested. Shorter timelines follow from benchmark-based definitions; longer timelines follow from deployment-quality definitions.",
  disagreement:
    "Experts weight deployment quality and enterprise readiness. AI models weight benchmark trajectories and open-weight momentum.",
};

const CHART_DATA = [
  { date: "Jan '25", human: 42, ai: 55, combined: 48, high: 54 },
  { date: "Mar '25", human: 45, ai: 58, combined: 51, high: 57 },
  { date: "May '25", human: 48, ai: 62, combined: 54, high: 60 },
  { date: "Jul '25", human: 50, ai: 65, combined: 57, high: 62 },
  { date: "Sep '25", human: 53, ai: 67, combined: 59, high: 64 },
  { date: "Nov '25", human: 55, ai: 69, combined: 61, high: 66 },
  { date: "Jan '26", human: 57, ai: 70, combined: 63, high: 68 },
  { date: "Mar '26", human: 58, ai: 71, combined: 64, high: 69 },
];

function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1100,
  };
}

function Card({ children, style = {} }) {
  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        background: C.surface,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ children, bg = "#F3F4F6", color = "#374151" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        backgroundColor: bg,
        color,
        fontFamily: FF,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MetaPill({ label, value, highlight = false }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 12px",
        borderRadius: 10,
        backgroundColor: highlight ? C.humanBg : C.borderL,
        border: `1px solid ${highlight ? "#BFDBFE" : C.border}`,
      }}
    >
      <span style={{ fontSize: 11, color: C.txt3, fontWeight: 500, fontFamily: FF }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: highlight ? C.humanTxt : C.txt,
          fontWeight: 700,
          fontFamily: FF,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function TopNav({ page, onNav }) {
  const { isMobile } = useBreakpoint();
  const items = [
    ["index", "Signals"],
    ["leaderboard", "Leaderboard"],
    ["models", "AI Models"],
    ["methodology", "Methodology"],
  ];

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div
        style={{
          minHeight: isMobile ? 68 : 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 1280,
          margin: "0 auto",
          padding: isMobile ? "12px 16px" : "0 20px",
          fontFamily: FF,
          gap: 12,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        <button
          onClick={() => onNav("index")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: "none",
            background: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#111B3A",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            FS
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.txt }}>Future Signals</span>
        </button>

        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {items.map(([key, label]) => (
              <button
                key={key}
                onClick={() => onNav(key)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: page === key ? C.borderL : "transparent",
                  color: page === key ? C.txt : C.txt2,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: FF,
                  fontWeight: page === key ? 600 : 500,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
          {!isMobile && (
            <button
              style={{
                border: "none",
                background: "none",
                color: C.txt2,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: FF,
              }}
            >
              Log in
            </button>
          )}
          <button onClick={() => onNav("submit")} style={primaryBtn}>
            Submit Forecast
          </button>
        </div>

        {isMobile && (
          <div
            style={{
              width: "100%",
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {items.map(([key, label]) => (
              <button
                key={key}
                onClick={() => onNav(key)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: page === key ? C.borderL : "transparent",
                  color: page === key ? C.txt : C.txt2,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: FF,
                  fontWeight: page === key ? 600 : 500,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

function SignalsIndexPage({ signals, onOpen, userForecasts }) {
  const { isMobile } = useBreakpoint();
  const [category, setCategory] = useState("All");
  const categories = ["All", "AI & ML", "Policy", "Safety", "Economics", "Science"];

  const filtered =
    category === "All" ? signals : signals.filter((signal) => signal.category === category);

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: isMobile ? "28px 16px 44px" : "42px 36px 60px",
      }}
    >
      <h1 style={{ fontFamily: FF, fontSize: isMobile ? 28 : 34, color: C.txt, margin: "0 0 12px" }}>
        Forecast Signals
      </h1>
      <p style={{ fontFamily: FF, color: C.txt2, fontSize: 15, marginBottom: 28 }}>
        {signals.length} active signals · Aggregating human expert and AI model forecasts
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 26,
          gap: 12,
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              style={{
                padding: "10px 18px",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: category === c ? C.ink : C.surface,
                color: category === c ? "white" : C.txt2,
                cursor: "pointer",
                fontFamily: FF,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              {c}
            </button>
          ))}
        </div>

        <select style={{ ...selectStyle, width: isMobile ? "100%" : "auto" }} defaultValue="Highest Signal">
          <option>Highest Signal</option>
          <option>Most Active</option>
          <option>Highest Divergence</option>
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {filtered.map((signal) => {
          const hasContributed = !!userForecasts[signal.id];

          return (
            <Card key={signal.id} style={{ padding: isMobile ? 18 : 26 }}>
              <button
                onClick={() => onOpen(signal)}
                style={{
                  width: "100%",
                  border: "none",
                  background: "none",
                  textAlign: "left",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 20,
                    flexDirection: isMobile ? "column" : "row",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                      <Badge bg={C.humanBg} color={C.humanTxt}>
                        {signal.category}
                      </Badge>
                      <Badge
                        bg={
                          signal.signalStrength === "Strong"
                            ? "#ECFDF5"
                            : signal.signalStrength === "Moderate"
                            ? "#EEF2FF"
                            : "#FFFBEB"
                        }
                        color={
                          signal.signalStrength === "Strong"
                            ? "#166534"
                            : signal.signalStrength === "Moderate"
                            ? "#4338CA"
                            : "#B45309"
                        }
                      >
                        {signal.signalStrength} Signal
                      </Badge>
                      {signal.divergence >= 15 && (
                        <Badge bg="#FFFBEB" color="#B45309">
                          High Divergence
                        </Badge>
                      )}
                      {hasContributed && (
                        <Badge bg={C.successBg} color={C.successTxt}>
                          Contributed
                        </Badge>
                      )}
                    </div>

                    <div
                      style={{
                        fontFamily: FF,
                        fontSize: isMobile ? 18 : 20,
                        fontWeight: 600,
                        color: C.txt,
                        lineHeight: 1.45,
                        marginBottom: 18,
                      }}
                    >
                      {signal.question}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 20,
                        flexWrap: "wrap",
                        fontFamily: FF,
                        fontSize: 15,
                        color: C.txt2,
                        marginBottom: 22,
                      }}
                    >
                      <div>
                        <span style={{ color: C.human }}>●</span> Human{" "}
                        <strong style={{ color: C.humanTxt }}>{signal.human}%</strong>
                      </div>
                      <div>
                        <span style={{ color: C.ai }}>●</span> AI{" "}
                        <strong style={{ color: C.aiTxt }}>{signal.ai}%</strong>
                      </div>
                      <div>AI +{Math.abs(signal.ai - signal.human)}pp</div>
                    </div>

                    <div style={{ fontFamily: FF, fontSize: 14, color: C.txt3 }}>
                      Resolves {signal.resolutionDate}
                    </div>
                  </div>

                  <div
                    style={{
                      minWidth: isMobile ? "auto" : 150,
                      textAlign: isMobile ? "left" : "right",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FF,
                        fontSize: isMobile ? 28 : 34,
                        fontWeight: 800,
                        color: C.txt,
                        lineHeight: 1,
                      }}
                    >
                      {signal.combined}%
                    </div>
                    <div style={{ fontFamily: FF, fontSize: 14, color: C.txt3, marginTop: 2 }}>
                      combined
                    </div>
                    <div style={{ fontFamily: FF, fontSize: 14, color: C.txt3, marginTop: isMobile ? 12 : 28 }}>
                      {signal.contributorCount} contributors
                    </div>
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        fontFamily: FF,
      }}
    >
      <div style={{ fontSize: 12, color: C.txt2, marginBottom: 8 }}>{label}</div>
      {payload.map((p) => (
        <div
          key={p.dataKey}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          <span style={{ color: C.txt2 }}>{p.name}</span>
          <strong style={{ color: C.txt }}>{p.value}%</strong>
        </div>
      ))}
    </div>
  );
}

function EvidenceAnalysis({ isMobile }) {
  return (
    <div style={{ fontFamily: FF }}>
      <div
        style={{
          padding: "16px 18px",
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          backgroundColor: C.ink,
          marginBottom: 22,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.55)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 8,
          }}
        >
          What’s Driving the Signal
        </div>
        <p style={{ fontSize: 14, color: "#F9FAFB", lineHeight: 1.6, margin: 0 }}>
          The current signal is driven by accelerating benchmark convergence and growing
          open-weight infrastructure investment, partially offset by concerns around
          deployment quality, safety infrastructure, and enterprise reliability.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.ai }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: C.txt }}>AI Synthesis</span>
        </div>

        <Card style={{ overflow: "hidden" }}>
          {[
            ["Bull Case", AI_SYNTHESIS.bullCase, "#10B981", "#ECFDF5"],
            ["Bear Case", AI_SYNTHESIS.bearCase, "#EF4444", "#FEF2F2"],
            ["Key Uncertainty", AI_SYNTHESIS.keyUncertainty, "#F59E0B", "#FFFBEB"],
            ["Why Humans & AI Disagree", AI_SYNTHESIS.disagreement, C.combined, C.borderL],
          ].map(([label, text, color, bg], i) => (
            <div
              key={label}
              style={{
                padding: "16px 18px",
                borderBottom: i < 3 ? `1px solid ${C.border}` : "none",
                backgroundColor: bg,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: 6,
                }}
              >
                {label}
              </div>
              <p style={{ fontSize: 13, color: C.txt, lineHeight: 1.6, margin: 0 }}>{text}</p>
            </div>
          ))}
        </Card>
      </div>

      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.txt, marginBottom: 12 }}>
          Evidence Inputs
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 10,
          }}
        >
          {EVIDENCE_INPUTS.map((e) => (
            <Card key={e.title} style={{ padding: "14px 16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  marginBottom: 8,
                }}
              >
                <h4
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: C.txt,
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {e.title}
                </h4>
                <Badge
                  bg={
                    e.type === "Research"
                      ? C.humanBg
                      : e.type === "Benchmark"
                      ? C.aiBg
                      : e.type === "Policy"
                      ? "#F5F3FF"
                      : "#F3F4F6"
                  }
                  color={
                    e.type === "Research"
                      ? C.humanTxt
                      : e.type === "Benchmark"
                      ? C.aiTxt
                      : e.type === "Policy"
                      ? "#6D28D9"
                      : "#374151"
                  }
                >
                  {e.type}
                </Badge>
              </div>
              <p style={{ fontSize: 13, color: C.txt2, lineHeight: 1.5, margin: "0 0 8px" }}>
                {e.summary}
              </p>
              <div style={{ fontSize: 11, color: C.txt3 }}>{e.date}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function SignalDetailPage({
  signal,
  onBack,
  onSubmit,
  userForecast,
  liveHuman,
  liveContributors,
  liveCombined,
  isLoading,
  successMessage,
}) {
  const { isMobile, isTablet } = useBreakpoint();
  const stackRightRail = isMobile || isTablet;

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: isMobile ? "28px 16px 44px" : "34px 36px 60px",
      }}
    >
      <button onClick={onBack} style={secondaryBtn}>
        ← Back
      </button>

      <div style={{ marginTop: 22, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Badge bg={C.humanBg} color={C.humanTxt}>
            {signal.category}
          </Badge>
          <Badge bg="#F0FDF4" color="#166534">
            Active
          </Badge>
          <Badge bg="#F3F4F6" color="#374151">
            Resolution Signal
          </Badge>
        </div>

        <h1
          style={{
            fontFamily: FF,
            fontSize: isMobile ? 28 : 34,
            lineHeight: 1.3,
            color: C.txt,
            margin: "0 0 16px",
            maxWidth: 900,
          }}
        >
          {signal.question}
        </h1>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            overflowX: isMobile ? "auto" : "visible",
            paddingBottom: isMobile ? 4 : 0,
          }}
        >
          <MetaPill label="Combined Signal" value={`${liveCombined}%`} highlight />
          <MetaPill label="Human Consensus" value={`${liveHuman}%`} />
          <MetaPill label="AI Consensus" value={`${signal.ai}%`} />
          <MetaPill label="AI leads by" value={`${Math.abs(signal.ai - liveHuman)}pp`} />
          <MetaPill label="Resolves" value={signal.resolutionDate} />
          <MetaPill label="Contributors" value={liveContributors} />
        </div>
      </div>

      {successMessage && (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 16px",
            backgroundColor: C.successBg,
            border: `1px solid ${C.successBorder}`,
            borderRadius: 12,
            fontFamily: FF,
            fontSize: 14,
            color: C.successTxt,
            fontWeight: 600,
          }}
        >
          {successMessage}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: stackRightRail ? "1fr" : "1fr 340px",
          gap: 28,
          alignItems: "start",
        }}
      >
        <div>
          <Card style={{ padding: isMobile ? "18px 16px 16px" : "22px 24px 18px", marginBottom: 20 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 14,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontFamily: FF,
                  fontSize: 12,
                  fontWeight: 600,
                  color: C.txt2,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Signal Evolution
              </div>
              {isLoading && <div style={{ fontSize: 12, color: C.txt3 }}>Loading…</div>}
            </div>

            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={CHART_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.borderL} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.txt3 }} />
                <YAxis tick={{ fontSize: 11, fill: C.txt3 }} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={50} stroke="#D1D5DB" strokeDasharray="5 4" />
                <Area type="monotone" dataKey="high" stroke="none" fill={C.human} fillOpacity={0.06} />
                <Line type="monotone" dataKey="combined" stroke={C.combined} strokeWidth={2.5} name="Combined" />
                <Line type="monotone" dataKey="human" stroke={C.human} strokeWidth={2} name="Human" />
                <Line type="monotone" dataKey="ai" stroke={C.ai} strokeWidth={2} name="AI" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div
            style={{
              marginBottom: 20,
              border: `1px solid ${C.warnBorder}`,
              borderRadius: 10,
              backgroundColor: C.warnBg,
              padding: "14px 18px",
              fontFamily: FF,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.warnTxt, marginBottom: 4 }}>
              Human / AI Divergence is Elevated
            </div>
            <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.55 }}>
              AI models are <strong>{Math.abs(signal.ai - liveHuman)} points</strong> more
              optimistic than expert consensus. This may reflect AI models weighting
              benchmark progress more heavily, while experts emphasize deployment quality.
            </div>
          </div>

          {userForecast && (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                backgroundColor: C.successBg,
                border: `1px solid ${C.successBorder}`,
                borderRadius: 10,
                fontFamily: FF,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.successTxt, marginBottom: 6 }}>
                Your Forecast
              </div>
              <div style={{ fontSize: 13, color: C.txt }}>
                Probability: <strong>{userForecast.probability}%</strong> · Confidence:{" "}
                <strong>{userForecast.confidence}</strong>
              </div>
              {userForecast.rationale ? (
                <div style={{ fontSize: 13, color: C.txt2, marginTop: 4 }}>{userForecast.rationale}</div>
              ) : null}
            </div>
          )}

          <Card style={{ padding: isMobile ? "18px 16px" : "22px 24px" }}>
            <EvidenceAnalysis isMobile={isMobile} />
          </Card>
        </div>

        <div style={{ position: stackRightRail ? "static" : "sticky", top: 90 }}>
          <Card style={{ padding: 20, marginBottom: 14 }}>
            <div
              style={{
                fontFamily: FF,
                fontSize: 11,
                fontWeight: 600,
                color: C.txt3,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 12,
              }}
            >
              Current Signal
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 42 : 54,
                  fontWeight: 800,
                  color: C.txt,
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                }}
              >
                {liveCombined}%
              </div>
              <div style={{ fontSize: 12, color: C.txt2, textAlign: "right", lineHeight: 1.5 }}>
                Probability
                <br />
                of outcome
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: C.txt2,
                lineHeight: 1.6,
                padding: "10px 12px",
                backgroundColor: C.borderL,
                borderRadius: 8,
                marginBottom: 14,
              }}
            >
              AI models are more optimistic than experts. The combined signal remains moderated by expert input.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ padding: "10px 12px", backgroundColor: C.humanBg, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.humanTxt }}>{liveHuman}%</div>
                <div style={{ fontSize: 11, color: C.humanTxt, marginTop: 2 }}>Human</div>
              </div>
              <div style={{ padding: "10px 12px", backgroundColor: C.aiBg, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.aiTxt }}>{signal.ai}%</div>
                <div style={{ fontSize: 11, color: C.aiTxt, marginTop: 2 }}>AI</div>
              </div>
            </div>

            <StatRow label="Contributors" value={liveContributors} />
            <StatRow label="Verified Experts" value={signal.verifiedExperts} />
            <StatRow label="Signal Strength" value={signal.signalStrength} />
            <StatRow label="AI Models" value={signal.aiModels} />

            <button onClick={() => onSubmit(signal)} style={{ ...primaryBtn, width: "100%", marginTop: 14 }}>
              Submit Forecast
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SubmitPage({ signal, onBack, onSave, isSaving }) {
  const { isMobile } = useBreakpoint();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [probability, setProbability] = useState("");
  const [confidence, setConfidence] = useState("Moderate");
  const [rationale, setRationale] = useState("");

  return (
    <div
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: isMobile ? "28px 16px 44px" : "34px 36px 60px",
      }}
    >
      <button onClick={onBack} style={secondaryBtn}>
        ← Back
      </button>

      <Card style={{ marginTop: 20, padding: isMobile ? 18 : 26 }}>
        <h1 style={{ fontFamily: FF, fontSize: isMobile ? 28 : 34, color: C.txt, margin: "0 0 10px" }}>
          Submit Forecast
        </h1>
        <p style={{ fontFamily: FF, fontSize: 14, color: C.txt2, lineHeight: 1.6, marginBottom: 22 }}>
          {signal.question}
        </p>

        <input
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Your role (optional)"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Probability (0–100)"
          value={probability}
          onChange={(e) => setProbability(e.target.value)}
          style={inputStyle}
        />
        <select value={confidence} onChange={(e) => setConfidence(e.target.value)} style={inputStyle}>
          <option value="Low">Low</option>
          <option value="Moderate">Moderate</option>
          <option value="High">High</option>
        </select>
        <textarea
          placeholder="Why? (optional)"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={5}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        <button
          disabled={isSaving}
          onClick={() => onSave({ name, role, probability, confidence, rationale })}
          style={{
            ...primaryBtn,
            width: "100%",
            opacity: isSaving ? 0.7 : 1,
            cursor: isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? "Saving..." : "Submit Forecast"}
        </button>
      </Card>
    </div>
  );
}

function LeaderboardPage() {
  const { isMobile } = useBreakpoint();

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: isMobile ? "28px 16px 44px" : "42px 36px 60px",
      }}
    >
      <h1 style={{ fontFamily: FF, fontSize: isMobile ? 28 : 34, color: C.txt, margin: "0 0 12px" }}>
        Leaderboard
      </h1>
      <p style={{ fontFamily: FF, color: C.txt2, marginBottom: 24 }}>
        Ranked by forecast quality, calibration, and consistency.
      </p>

      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {LEADERBOARD.map((row) => (
            <Card key={row.rank} style={{ padding: 16 }}>
              <div style={{ fontFamily: FF, fontSize: 14, color: C.txt3, marginBottom: 6 }}>
                Rank #{row.rank}
              </div>
              <div style={{ fontFamily: FF, fontSize: 18, fontWeight: 700, color: C.txt }}>
                {row.name}
              </div>
              <div style={{ fontFamily: FF, fontSize: 14, color: C.txt2, marginTop: 4 }}>
                {row.type} · {row.domain}
              </div>
              <div style={{ fontFamily: FF, fontSize: 14, color: C.txt2, marginTop: 10 }}>
                Accuracy: {row.accuracy} · Calibration: {row.calibration}
              </div>
              <div style={{ fontFamily: FF, fontSize: 14, color: C.txt2, marginTop: 4 }}>
                Reputation: {row.reputation} · Influence: {row.influence}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FF }}>
            <thead style={{ background: C.borderL }}>
              <tr>
                {["Rank", "Contributor", "Type", "Domain", "Accuracy", "Calibration", "Reputation", "Influence"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "14px 16px",
                      fontSize: 12,
                      color: C.txt2,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEADERBOARD.map((row) => (
                <tr key={row.rank} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={td}>{row.rank}</td>
                  <td style={td}><strong>{row.name}</strong></td>
                  <td style={td}>{row.type}</td>
                  <td style={td}>{row.domain}</td>
                  <td style={td}>{row.accuracy}</td>
                  <td style={td}>{row.calibration}</td>
                  <td style={td}>{row.reputation}</td>
                  <td style={td}>{row.influence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function AIModelsPage() {
  const { isMobile } = useBreakpoint();

  return (
    <div
      style={{
        maxWidth: 1180,
        margin: "0 auto",
        padding: isMobile ? "28px 16px 44px" : "42px 36px 60px",
      }}
    >
      <h1 style={{ fontFamily: FF, fontSize: isMobile ? 28 : 34, color: C.txt, margin: "0 0 12px" }}>
        AI Models
      </h1>
      <p style={{ fontFamily: FF, color: C.txt2, marginBottom: 24 }}>
        The AI baseline layer combines multiple model perspectives into structured forecast inputs.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 14,
        }}
      >
        {AI_MODELS.map((model) => (
          <Card key={model.name} style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
              <div>
                <div style={{ fontFamily: FF, fontSize: 18, fontWeight: 700, color: C.txt }}>
                  {model.name}
                </div>
                <div style={{ fontFamily: FF, fontSize: 13, color: C.txt2, marginTop: 4 }}>
                  {model.role}
                </div>
              </div>
              <div style={{ fontFamily: FF, fontSize: 28, fontWeight: 800, color: C.txt }}>
                {model.score}
              </div>
            </div>
            <div style={{ fontFamily: FF, fontSize: 13, color: C.txt2, lineHeight: 1.6 }}>
              {model.strengths}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function MethodologyPage() {
  const { isMobile } = useBreakpoint();

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: isMobile ? "28px 16px 44px" : "42px 36px 60px",
      }}
    >
      <h1 style={{ fontFamily: FF, fontSize: isMobile ? 28 : 34, color: C.txt, margin: "0 0 12px" }}>
        Methodology
      </h1>
      <p style={{ fontFamily: FF, color: C.txt2, marginBottom: 26 }}>
        Future Signals combines human forecasts and AI baseline estimates into a structured decision signal.
      </p>

      <div style={{ display: "grid", gap: 14 }}>
        {[
          [
            "Human Consensus",
            "Average of submitted human probability estimates for a given signal.",
          ],
          [
            "AI Consensus",
            "Hardcoded or model-generated AI baseline probability used as a comparison layer.",
          ],
          [
            "Combined Signal",
            "Current MVP uses a simple weighted blend: 60% human consensus, 40% AI consensus.",
          ],
          [
            "Divergence",
            "The gap between human consensus and AI consensus. Large gaps indicate disagreement in how evidence is being weighted.",
          ],
          [
            "Signal Strength",
            "A qualitative confidence label based on the current shape of consensus and disagreement.",
          ],
          [
            "Leaderboard",
            "Current leaderboard is a placeholder design. Reputation scoring is not yet live.",
          ],
        ].map(([title, body]) => (
          <Card key={title} style={{ padding: 20 }}>
            <div style={{ fontFamily: FF, fontSize: 16, fontWeight: 700, color: C.txt, marginBottom: 8 }}>
              {title}
            </div>
            <div style={{ fontFamily: FF, fontSize: 14, color: C.txt2, lineHeight: 1.65 }}>
              {body}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: `1px solid ${C.borderL}`,
        fontFamily: FF,
        fontSize: 13,
      }}
    >
      <span style={{ color: C.txt2 }}>{label}</span>
      <span style={{ fontWeight: 600, color: C.txt }}>{value}</span>
    </div>
  );
}

const primaryBtn = {
  padding: "12px 16px",
  background: C.ink,
  color: "#fff",
  borderRadius: 12,
  border: "none",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: FF,
  fontSize: 14,
};

const secondaryBtn = {
  padding: "10px 14px",
  background: "#fff",
  color: C.txt,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  cursor: "pointer",
  fontFamily: FF,
  fontSize: 14,
};

const inputStyle = {
  display: "block",
  width: "100%",
  marginBottom: 12,
  padding: 12,
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  boxSizing: "border-box",
  fontSize: 14,
  fontFamily: FF,
};

const selectStyle = {
  padding: "10px 14px",
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  background: C.surface,
  fontFamily: FF,
  fontSize: 14,
};

const td = {
  padding: "14px 16px",
  fontFamily: FF,
  fontSize: 14,
  color: C.txt,
};

export default function App() {
  const [page, setPage] = useState("index");
  const [activeSignalId, setActiveSignalId] = useState(SIGNALS[0].id);
  const [userForecasts, setUserForecasts] = useState({});
  const [forecastRowsBySignal, setForecastRowsBySignal] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchAllForecasts = async () => {
    const { data, error } = await supabase
      .from("forecasts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("FETCH ALL FORECASTS ERROR:", error);
      return;
    }

    const grouped = {};
    for (const row of data || []) {
      const key = String(row.signal_id);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }
    setForecastRowsBySignal(grouped);
  };

  useEffect(() => {
    fetchAllForecasts();
  }, []);

  const activeSignalBase =
    SIGNALS.find((s) => String(s.id) === String(activeSignalId)) || SIGNALS[0];

  const rowsForSignal = forecastRowsBySignal[String(activeSignalId)] || [];

  const liveHuman = useMemo(() => {
    if (!rowsForSignal.length) return activeSignalBase.human;
    const total = rowsForSignal.reduce((sum, row) => sum + Number(row.probability || 0), 0);
    return Math.round(total / rowsForSignal.length);
  }, [rowsForSignal, activeSignalBase.human]);

  const liveContributors = useMemo(() => {
    return rowsForSignal.length > 0 ? rowsForSignal.length : activeSignalBase.contributorCount;
  }, [rowsForSignal, activeSignalBase.contributorCount]);

  const liveCombined = useMemo(() => {
    return Math.round(liveHuman * 0.6 + activeSignalBase.ai * 0.4);
  }, [liveHuman, activeSignalBase.ai]);

  const hydratedSignals = useMemo(() => {
    return SIGNALS.map((signal) => {
      const rows = forecastRowsBySignal[String(signal.id)] || [];
      if (!rows.length) return signal;

      const human = Math.round(
        rows.reduce((sum, row) => sum + Number(row.probability || 0), 0) / rows.length
      );
      const contributorCount = rows.length;
      const combined = Math.round(human * 0.6 + signal.ai * 0.4);

      return {
        ...signal,
        human,
        combined,
        contributorCount,
      };
    });
  }, [forecastRowsBySignal]);

  const handleSaveForecast = async (data) => {
    const probabilityNumber = Number(data.probability);

    if (Number.isNaN(probabilityNumber) || probabilityNumber < 0 || probabilityNumber > 100) {
      setSuccessMessage("");
      return;
    }

    setIsSaving(true);
    setSuccessMessage("");

    const payload = {
      signal_id: activeSignalId,
      name: data.name || null,
      role: data.role || null,
      probability: probabilityNumber,
      confidence: data.confidence,
      rationale: data.rationale || null,
    };

    const { error } = await supabase.from("forecasts").insert([payload]);

    setIsSaving(false);

    if (error) {
      console.error("SUPABASE INSERT ERROR:", error);
      setSuccessMessage(`Error saving forecast: ${error.message}`);
      return;
    }

    setUserForecasts((prev) => ({
      ...prev,
      [activeSignalId]: payload,
    }));

    setIsLoading(true);
    await fetchAllForecasts();
    setIsLoading(false);

    setSuccessMessage("Forecast submitted successfully. Your contribution has been added to this signal.");
    setPage("detail");
  };

  const userForecast = userForecasts[activeSignalId] || null;

  const onNav = (targetPage) => {
    setSuccessMessage("");
    setPage(targetPage);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <TopNav page={page} onNav={onNav} />

      {page === "index" && (
        <SignalsIndexPage
          signals={hydratedSignals}
          userForecasts={userForecasts}
          onOpen={(signal) => {
            setSuccessMessage("");
            setActiveSignalId(signal.id);
            setPage("detail");
          }}
        />
      )}

      {page === "detail" && (
        <SignalDetailPage
          signal={activeSignalBase}
          onBack={() => {
            setSuccessMessage("");
            setPage("index");
          }}
          onSubmit={() => setPage("submit")}
          userForecast={userForecast}
          liveHuman={liveHuman}
          liveContributors={liveContributors}
          liveCombined={liveCombined}
          isLoading={isLoading}
          successMessage={successMessage}
        />
      )}

      {page === "submit" && (
        <SubmitPage
          signal={activeSignalBase}
          onBack={() => {
            setSuccessMessage("");
            setPage("detail");
          }}
          onSave={handleSaveForecast}
          isSaving={isSaving}
        />
      )}

      {page === "leaderboard" && <LeaderboardPage />}
      {page === "models" && <AIModelsPage />}
      {page === "methodology" && <MethodologyPage />}
    </div>
  );
}