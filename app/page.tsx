"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const ROLES = [
  "AI researcher",
  "Founder / operator",
  "VC / investor",
  "Engineer / builder",
  "Product / business",
  "Other",
];

const YEARS = ["< 3", "3–7", "7–15", "15+"];

const LEVELS = [0, 25, 50, 75, 100];

const MARKETS = [
  {
    id: "q1",
    ticker: "MODEL-MOAT",
    title: "Foundation Model Commoditization",
    text: "Will AI foundation models become a commoditized infrastructure layer with minimal durable economic moats?",
  },
  {
    id: "q2",
    ticker: "OSS-PARITY",
    title: "Open-Source Frontier Parity",
    text: "Will open-source AI models match the leading proprietary frontier models?",
  },
  {
    id: "q3",
    ticker: "COMPUTE-10B",
    title: "Frontier Model Cost Escalation",
    text: "Will the cost of training a frontier AI model exceed $10B?",
  },
  {
    id: "q4",
    ticker: "COST-CRASH",
    title: "Training Cost Collapse",
    text: "Will the cost of training frontier AI models fall by more than 90%?",
  },
  {
    id: "q5",
    ticker: "CODE-50",
    title: "AI Coding Automation",
    text: "Will AI systems generate more than 50% of new production code at large tech companies?",
  },
  {
    id: "q6",
    ticker: "AI-REV-25",
    title: "AI Market Share Expansion",
    text: "Will AI companies capture more than 25% of global software revenue?",
  },
  {
    id: "q7",
    ticker: "REG-SHOCK",
    title: "AI Regulatory Shock",
    text: "Will a major AI safety incident trigger strict regulatory restrictions?",
  },
  {
    id: "q8",
    ticker: "COG-AUTO",
    title: "Human-Level Economic Automation",
    text: "Will AI outperform humans across most economically valuable cognitive work?",
  },
];

type Step = "background" | `m:${number}` | "extras" | "identity" | "done";

type State = {
  role: string;
  years: string;
  probs: Record<string, number>;
  reasons: Record<string, string>;
  overlooked: string;
  name: string;
  email: string;
  linkedin: string;
};

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-medium ${
        active
          ? "border-black bg-black text-white"
          : "border-slate-200 bg-white hover:border-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

function ProgressLabel(step: Step) {
  if (step === "background") return " ";
  if (step.startsWith("m:")) {
    const idx = Number(step.split(":")[1]);
    return `Question ${idx + 1} of ${MARKETS.length}`;
  }
  if (step === "extras") return "Extras";
  if (step === "identity") return "Optional info";
  return "Complete";
}

function Shell({
  children,
  step,
  goBack,
  goNext,
}: {
  children: React.ReactNode;
  step: Step;
  goBack: () => void;
  goNext: () => void | Promise<void>;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl p-8">
<h1 className="text-2xl font-semibold mb-4">Future Signals</h1>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">
              {ProgressLabel(step)}
            </div>

            {step.startsWith("m:") && (
              <div className="flex items-center gap-2">
                {Array.from({ length: MARKETS.length }).map((_, i) => {
                  const idx = Number(step.split(":")[1]);
                  const active = i === idx;
                  const done = i < idx;

                  return (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full ${
                        active ? "bg-black" : done ? "bg-slate-400" : "bg-slate-200"
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6">{children}</div>
        </div>

        {step !== "done" && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={goBack}
              disabled={step === "background"}
              className="flex-1 rounded-xl border px-4 py-3 disabled:opacity-40"
            >
              Back
            </button>

            <button
              onClick={() => void goNext()}
              className="flex-1 rounded-xl bg-black text-white px-4 py-3"
            >
              {step === "identity" ? "Submit" : "Next"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  const initial: State = useMemo(() => {
    const probs: Record<string, number> = {};
    const reasons: Record<string, string> = {};

    MARKETS.forEach((m) => {
      probs[m.id] = 50;
      reasons[m.id] = "";
    });

    return {
      role: "",
      years: "",
      probs,
      reasons,
      overlooked: "",
      name: "",
      email: "",
      linkedin: "",
    };
  }, []);

  const [s, setS] = useState<State>(initial);
  const [step, setStep] = useState<Step>("background");

  async function goNext() {
    if (step === "background") {
      if (!s.role || !s.years) return;
      setStep("m:0");
      return;
    }

    if (step.startsWith("m:")) {
      const idx = Number(step.split(":")[1]);
      if (idx < MARKETS.length - 1) setStep(`m:${idx + 1}`);
      else setStep("extras");
      return;
    }

    if (step === "extras") {
      setStep("identity");
      return;
    }

    if (step === "identity") {
      const payload = {
        role: s.role,
        years: s.years,
        probs: s.probs,
        reasons: s.reasons,
        overlooked: s.overlooked || null,
        name: s.name || null,
        email: s.email || null,
        linkedin: s.linkedin || null,
      };

      const { error } = await supabase.from("forecasts").insert([payload]);

      if (error) {
        console.error("Insert failed:", JSON.stringify(error, null, 2), error);
        alert("Submission failed");
        return;
      }

      setStep("done");
    }
  }

  function goBack() {
    if (step.startsWith("m:")) {
      const idx = Number(step.split(":")[1]);
      if (idx === 0) setStep("background");
      else setStep(`m:${idx - 1}`);
      return;
    }

    if (step === "extras") {
      setStep(`m:${MARKETS.length - 1}`);
      return;
    }

    if (step === "identity") {
      setStep("extras");
    }
  }

  if (step === "background") {
    return (
      <Shell step={step} goBack={goBack} goNext={goNext}>
        <div className="rounded-2xl bg-slate-50 p-6">
         <h2 className="text-3xl font-semibold text-slate-900">
  Where AI Experts Disagree
</h2>

<div className="mt-4 space-y-4 text-sm text-slate-700 max-w-prose">
  <p className="font-semibold text-slate-900">
    8 forecasts • ~60 seconds
  </p>

  <p className="font-medium text-slate-900">
    How accurate are AI experts at predicting the future of AI?
  </p>

  <p>
    We’re running a short forecasting experiment comparing:
  </p>

  <ul className="list-disc ml-5 space-y-1">
    <li>expert predictions</li>
    <li>AI model forecasts</li>
    <li>areas of disagreement</li>
  </ul>

  <p>
    Submit probabilistic predictions on a few key questions about AI progress.
  </p>
  <p>
    Results will appear in the inaugural{" "}
    <span className="font-medium text-slate-900">
      Future Signals AI Forecast Report
    </span>.
  </p>

  <p>
    Participants receive a forecast score and can opt to appear on the{" "}
    <span className="font-medium text-slate-900">
      AI Forecast Leaderboard
    </span>.
  </p>
</div>
        </div>

        <div className="my-8 h-px bg-slate-200" />

        <h2 className="text-lg font-semibold">Quick Background</h2>

        <label className="block mt-4 text-sm font-medium">
          Which best describes you?
        </label>

        <select
          className="mt-2 w-full border rounded-xl p-3"
          value={s.role}
       onChange={(e) => {
  const role = e.target.value;
  const updated = { ...s, role };
  setS(updated);

  if (role && updated.years) setStep("m:0");
}}
        >
          <option value="">Select</option>
          {ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>

        <label className="block mt-6 text-sm font-medium">
          Years working in AI
        </label>

        <select
          className="mt-2 w-full border rounded-xl p-3"
          value={s.years}
       onChange={(e) => {
  const years = e.target.value;
  const updated = { ...s, years };
  setS(updated);

  if (updated.role && years) setStep("m:0");
}}
        >
          <option value="">Select</option>
          {YEARS.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </Shell>
    );
  }

  if (step.startsWith("m:")) {
    const idx = Number(step.split(":")[1]);
    const m = MARKETS[idx];
    const prob = s.probs[m.id];
    const side = prob <= 25 ? "NO" : "YES";

    return (
      <Shell step={step} goBack={goBack} goNext={goNext}>
        <div className="mt-3 text-sm text-slate-500 font-medium">{m.title}</div>

        <h2 className="mt-1 text-xl font-semibold text-slate-900 leading-snug">
          {m.text}
        </h2>

        <div className="mt-6 bg-slate-50 p-5 rounded-xl border">
          <div className="text-xs text-slate-500 uppercase">
            Implied probability ({side})
          </div>

          <div className="text-5xl font-semibold mt-2">{prob}%</div>

          <div className="flex gap-2 mt-5 flex-wrap">
            {LEVELS.map((v) => (
              <Chip
                key={v}
                active={v === prob}
                onClick={() =>
                  setS((p) => ({
                    ...p,
                    probs: { ...p.probs, [m.id]: v },
                  }))
                }
              >
                {v}%
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium text-slate-700">
            Reasoning (optional)
          </div>

          <textarea
            className="mt-2 w-full border rounded-xl p-3"
            rows={3}
            placeholder="Why do you think so?"
            value={s.reasons[m.id]}
            onChange={(e) =>
              setS((p) => ({
                ...p,
                reasons: { ...p.reasons, [m.id]: e.target.value },
              }))
            }
          />
        </div>
      </Shell>
    );
  }

  if (step === "extras") {
    return (
      <Shell step={step} goBack={goBack} goNext={goNext}>
        <h2 className="text-lg font-semibold">
          What AI question are people getting wrong or overlooking?
        </h2>

        <p className="mt-2 text-sm text-slate-500">Optional</p>

        <textarea
          className="mt-4 w-full border rounded-xl p-3"
          rows={4}
          placeholder="Your question..."
          value={s.overlooked}
          onChange={(e) => setS({ ...s, overlooked: e.target.value })}
        />
      </Shell>
    );
  }

  if (step === "identity") {
    return (
      <Shell step={step} goBack={goBack} goNext={goNext}>
        <h2 className="text-lg font-semibold">Optional Contact Info</h2>

        <p className="mt-2 text-sm text-slate-600">
          Optional — include your info if you'd like attribution in the report or
          to appear in the top predictor leaderboard.
        </p>

        <label className="block mt-6 text-sm font-medium">Name</label>
        <input
          className="mt-2 w-full border rounded-xl p-3"
          placeholder="Your name"
          value={s.name}
          onChange={(e) => setS({ ...s, name: e.target.value })}
        />

        <label className="block mt-5 text-sm font-medium">Email</label>
        <input
          className="mt-2 w-full border rounded-xl p-3"
          placeholder="you@email.com"
          value={s.email}
          onChange={(e) => setS({ ...s, email: e.target.value })}
        />

        <label className="block mt-5 text-sm font-medium">LinkedIn</label>
        <input
          className="mt-2 w-full border rounded-xl p-3"
          placeholder="https://linkedin.com/in/..."
          value={s.linkedin}
          onChange={(e) => setS({ ...s, linkedin: e.target.value })}
        />
      </Shell>
    );
  }

  return (
    <Shell step={step} goBack={goBack} goNext={goNext}>
      <h2 className="text-xl font-semibold">Thanks for participating</h2>

      <p className="mt-2 text-slate-600 text-sm">
        Your forecast has been submitted. Results will appear in the Future
        Signals AI Forecast Report.
      </p>
    </Shell>
  );
}