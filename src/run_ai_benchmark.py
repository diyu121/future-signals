import json
import os
import re
import statistics
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError, field_validator

# Optional Supabase support
try:
    from supabase import create_client
except ImportError:
    create_client = None

load_dotenv()

print("OPENAI:", "OK" if os.getenv("OPENAI_API_KEY") else "MISSING")
print("ANTHROPIC:", "OK" if os.getenv("ANTHROPIC_API_KEY") else "MISSING")
print("SUPABASE_URL:", "OK" if os.getenv("SUPABASE_URL") else "MISSING")
print("SUPABASE_SERVICE_ROLE_KEY:", "OK" if os.getenv("SUPABASE_SERVICE_ROLE_KEY") else "MISSING")


# ---------- Config ----------

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-6")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

OUTPUT_DIR = "outputs"
os.makedirs(OUTPUT_DIR, exist_ok=True)

PROMPT_VERSION = "v2_profiles_critique"

SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create_client)

supabase = None
if SUPABASE_ENABLED:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    print("SUPABASE: ENABLED")
else:
    print("SUPABASE: DISABLED")


# ---------- Schema ----------

class ForecastResponse(BaseModel):
    probability: int = Field(description="Integer from 0 to 100")
    rationale: str = Field(description="Max 3 sentences")
    assumptions: List[str] = Field(description="2 to 5 short assumptions")
    confidence: float = Field(description="Number from 0 to 1")

    @field_validator("probability")
    @classmethod
    def validate_probability(cls, v: int) -> int:
        if not 0 <= v <= 100:
            raise ValueError("probability must be between 0 and 100")
        return v

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if not 0 <= v <= 1:
            raise ValueError("confidence must be between 0 and 1")
        return v

    @field_validator("assumptions")
    @classmethod
    def validate_assumptions(cls, v: List[str]) -> List[str]:
        if not 2 <= len(v) <= 5:
            raise ValueError("assumptions must have 2 to 5 items")
        return v


FORECAST_JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "probability": {"type": "integer", "minimum": 0, "maximum": 100},
        "rationale": {"type": "string"},
        "assumptions": {
            "type": "array",
            "minItems": 2,
            "maxItems": 5,
            "items": {"type": "string"},
        },
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "required": ["probability", "rationale", "assumptions", "confidence"],
}


# ---------- Inputs ----------

QUESTIONS = [
    {
        "id": "q1_open_source_parity",
        "text": "By Dec 31, 2027, will open-source models match or exceed the performance of the leading closed models on most enterprise-relevant benchmarks?",
        "resolution_criteria": (
            "Resolve YES if open-source models are generally recognized by major benchmark "
            "evaluations and enterprise production adoption studies as matching or exceeding "
            "leading closed models on most enterprise-relevant benchmark suites by 2027-12-31."
        ),
        "deadline": "2027-12-31",
        "domain": "AI",
    },
]

PROFILES = {
    "base": {
        "label": "Base",
        "prompt": """You are a balanced forecaster synthesizing two opposing views: a skeptical deployment view and an optimistic capability view.

Your job is to reconcile them into a calibrated final probability.

Required in your reasoning:
1. State the single strongest upside driver (why this could happen)
2. State the single strongest downside driver (why this could fail)
3. Explain why your final probability sits between the optimistic and skeptical extremes — or, if it doesn't, explain what makes the evidence one-sided

Do not let either view dominate without justification. Aim for the probability that best reflects the actual balance of evidence.""",
    },

    "investor": {
        "label": "Investor",
        "prompt": """You are a skeptical investor. Your prior is that technical capability does not translate into enterprise deployment on the same timeline.

Reason from:
- Switching costs and integration burden: who has to change workflows, systems, or contracts
- Compliance and reliability requirements: what certifications, SLAs, or liability constraints block adoption
- Procurement and budget cycles: how long enterprise buying actually takes
- Historical overestimation: AI and software timelines routinely slip 2–5x; assume this holds unless you have strong evidence otherwise

Required in your reasoning:
- Argue specifically why technical capability may NOT translate to deployment on this timeline
- Name the most likely bottleneck (organizational, regulatory, economic, or technical)
- State your skeptical adjustment: why your probability is lower than a naive capability-based estimate would suggest""",
    },

    "researcher": {
        "label": "Researcher",
        "prompt": """You are an optimistic ML researcher. Your prior is that benchmark progress is a leading indicator of real-world capability, and that technical capability advances faster than business adoption expects.

Reason from:
- Benchmark convergence: how quickly models are closing gaps on relevant tasks
- Scaling trends: compute, data, and algorithmic efficiency improvements over the horizon
- Architecture improvements: new methods that change the capability trajectory
- Open-weight catch-up dynamics: how open models narrow proprietary leads and accelerate accessibility

Required in your reasoning:
- Argue specifically why technical capability may advance faster than business adoption timelines suggest
- Name the most likely capability accelerant (a scaling trend, architectural shift, or open-weight dynamic)
- State your optimistic adjustment: why your probability is higher than a deployment-friction-focused estimate would suggest""",
    },
}

# Start small. Add Anthropic later once OpenAI works.
PROVIDERS = ["openai"]
RUNS_PER_PROVIDER = 3
SLEEP_SECONDS = 3.0

PROFILE_WEIGHTS: Dict[str, float] = {"investor": 0.4, "base": 0.3, "researcher": 0.3}


# ---------- Prompting ----------

SYSTEM_PROMPT = """You are making a calibrated probabilistic forecast.

Return JSON only.
Do not use markdown fences.
Do not hedge with ranges.
Use the exact deadline and resolution criteria.
Avoid overconfidence.
"""

def build_evidence_brief_prompt(question: Dict[str, str]) -> str:
    return f"""Before a probabilistic forecast is made on the following question, provide a short evidence brief.

Question:
{question["text"]}

Deadline: {question["deadline"]}
Domain: {question["domain"]}

Summarize the most relevant facts, trends, and data points a forecaster should know. Include:
- Recent developments that bear directly on this question
- Historical base rates or analogous outcomes if applicable
- Key uncertainties or contested claims
- Any known milestones or deadlines relevant to resolution

Be concise and factual. 150–250 words. Plain text only.""".strip()


def generate_evidence_brief(provider: str, question: Dict[str, str]) -> str:
    """Generate a short evidence brief for a question using the LLM's knowledge."""
    try:
        brief = _call_raw_text(
            provider,
            system="You are a research analyst preparing background context for a forecasting exercise.",
            user=build_evidence_brief_prompt(question),
        )
        return brief.strip()
    except Exception as e:
        print(f"  [WARN] Evidence brief generation failed ({e}), proceeding without it")
        return ""


def _evidence_block(evidence_brief: str) -> str:
    if not evidence_brief:
        return ""
    return f"\nEvidence brief:\n{evidence_brief}\n"


def build_initial_user_prompt(
    question: Dict[str, str],
    profile_name: str,
    profile_instruction: str,
    evidence_brief: str = "",
) -> str:
    return f"""Question:
{question["text"]}

Resolution criteria:
{question["resolution_criteria"]}

Deadline:
{question["deadline"]}

Domain:
{question["domain"]}
{_evidence_block(evidence_brief)}
Profile: {profile_name}
{profile_instruction}

Requirements:
- Your rationale MUST cite at least one specific fact or trend from the evidence brief above.
- At least one assumption must be grounded in a specific piece of evidence from the brief.
- Do not reason generically. If your rationale could apply to any question without reading the evidence, it is not acceptable.

Return JSON with exactly these fields:
- probability: integer from 0 to 100
- rationale: string, max 3 sentences — must include: what evidence most influenced your estimate and why
- assumptions: array of 2 to 5 short strings — at least one must reference a specific fact from the evidence brief
- confidence: number from 0 to 1""".strip()


def build_critique_prompt(
    question: Dict[str, str],
    initial_parsed: Dict[str, Any],
    evidence_brief: str = "",
) -> str:
    return f"""Review this probabilistic forecast for the question:

"{question["text"]}"
{_evidence_block(evidence_brief)}
Forecast:
- probability: {initial_parsed["probability"]}
- rationale: {initial_parsed["rationale"]}
- assumptions: {json.dumps(initial_parsed["assumptions"])}
- confidence: {initial_parsed["confidence"]}

Critique it. Be specific and direct about:
1. Weak or underexamined assumptions
2. Overconfidence or underconfidence (is the confidence score justified?)
3. Important factors that were ignored or underweighted
4. Any reasoning errors or anchoring bias
5. Whether the rationale and assumptions actually engage with the evidence brief, or rely on generic reasoning that ignores it

Plain text only. No JSON.""".strip()


def build_revision_prompt(
    question: Dict[str, str],
    profile_name: str,
    profile_instruction: str,
    initial_parsed: Dict[str, Any],
    critique_text: str,
    evidence_brief: str = "",
) -> str:
    return f"""You made an initial forecast and received a critique. Produce a revised forecast.

Question:
{question["text"]}

Resolution criteria:
{question["resolution_criteria"]}

Deadline:
{question["deadline"]}
{_evidence_block(evidence_brief)}
Profile: {profile_name}
{profile_instruction}

Your initial forecast:
- probability: {initial_parsed["probability"]}
- rationale: {initial_parsed["rationale"]}
- assumptions: {json.dumps(initial_parsed["assumptions"])}
- confidence: {initial_parsed["confidence"]}

Critique:
{critique_text}

Revision rules:
- Only change probability if the critique identifies a specific flaw in the reasoning that justifies it.
- Any probability change must be grounded in a specific fact from the evidence brief — not a general reframing.
- Sharpen assumptions: remove vague ones, add any the critique flagged as missing; at least one must cite specific evidence.
- If the critique identifies overconfidence, lower the confidence score accordingly.
- Do not change the probability just to appear responsive to the critique.

Return JSON with exactly these fields:
- probability: integer from 0 to 100
- rationale: string, max 3 sentences — must cite what evidence most influenced the estimate
- assumptions: array of 2 to 5 short strings — at least one must reference a specific fact from the evidence brief
- confidence: number from 0 to 1""".strip()


# ---------- Utilities ----------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def strip_code_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()

def extract_first_json_object(text: str) -> str:
    text = strip_code_fences(text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"No JSON object found in response: {text[:300]}")
    return text[start:end + 1]

def _extract_openai_text(data: Dict[str, Any]) -> str:
    """
    Extract text from an OpenAI Responses API result.
    1. Tries top-level output_text.
    2. Walks output[].content[] — matches known type strings first, then any block with a text field.
    3. Raises ValueError with a full content-structure debug summary if nothing found.
    """
    if data.get("output_text"):
        return data["output_text"]

    known_types = {"output_text", "text"}
    fallback: Optional[str] = None

    for item in data.get("output", []):
        for block in item.get("content", []):
            text = block.get("text", "")
            if not text:
                continue
            if block.get("type") in known_types:
                return text          # preferred path
            if fallback is None:
                fallback = text      # accept any block with text as last resort

    if fallback:
        return fallback

    top_keys = list(data.keys())
    content_shapes = [
        {"output_type": item.get("type"), "content": [{"type": b.get("type"), "has_text": bool(b.get("text"))} for b in item.get("content", [])]}
        for item in data.get("output", [])
    ]
    raise ValueError(
        f"Could not extract text from OpenAI response. "
        f"status={data.get('status')!r} top_keys={top_keys} "
        f"output_structure={json.dumps(content_shapes)}"
    )

def validate_forecast(data: Dict[str, Any]) -> ForecastResponse:
    return ForecastResponse.model_validate(data)

def write_json(path: str, payload: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

def _weighted_profile_avg(profile_avgs: Dict[str, float], weights: Dict[str, float]) -> Optional[float]:
    total_weight = sum(weights[p] for p in weights if p in profile_avgs)
    if not total_weight:
        return None
    val = sum(profile_avgs[p] * weights[p] for p in weights if p in profile_avgs) / total_weight
    return round(val, 1)


def summarize_results(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_provider: Dict[str, List[int]] = {}
    by_profile: Dict[str, List[int]] = {}

    for row in rows:
        if row.get("status") != "ok" or "parsed" not in row:
            continue
        by_provider.setdefault(row["provider"], []).append(row["parsed"]["probability"])
        by_profile.setdefault(row["profile"], []).append(row["parsed"]["probability"])

    provider_summary = {
        provider: {
            "n": len(vals),
            "avg_probability": round(statistics.mean(vals), 1),
            "stdev_probability": round(statistics.pstdev(vals), 1) if len(vals) > 1 else 0.0,
        }
        for provider, vals in by_provider.items()
    }

    profile_summary = {
        profile: {
            "n": len(vals),
            "avg_probability": round(statistics.mean(vals), 1),
            "stdev_probability": round(statistics.pstdev(vals), 1) if len(vals) > 1 else 0.0,
        }
        for profile, vals in by_profile.items()
    }

    all_probs = [row["parsed"]["probability"] for row in rows if row.get("status") == "ok" and "parsed" in row]

    conf_pairs = [
        (row["parsed"]["probability"], row["parsed"]["confidence"])
        for row in rows
        if row.get("status") == "ok" and "parsed" in row
        and row["parsed"].get("confidence") is not None
    ]
    if conf_pairs:
        total_conf = sum(c for _, c in conf_pairs)
        conf_weighted = round(sum(p * c for p, c in conf_pairs) / total_conf, 1) if total_conf else None
    else:
        conf_weighted = None

    profile_avgs = {
        profile: round(statistics.mean(vals), 1)
        for profile, vals in by_profile.items()
    }
    highest_profile = max(profile_avgs, key=lambda p: profile_avgs[p]) if profile_avgs else None
    lowest_profile = min(profile_avgs, key=lambda p: profile_avgs[p]) if profile_avgs else None

    overall = {
        "n": len(all_probs),
        "ai_baseline_probability": round(statistics.mean(all_probs), 1) if all_probs else None,
        "weighted_ai_baseline_probability": _weighted_profile_avg(profile_avgs, PROFILE_WEIGHTS),
        "confidence_weighted_baseline": conf_weighted,
        "ai_spread_stdev": round(statistics.pstdev(all_probs), 1) if len(all_probs) > 1 else 0.0,
        "min_probability": min(all_probs) if all_probs else None,
        "max_probability": max(all_probs) if all_probs else None,
        "disagreement_score": (max(all_probs) - min(all_probs)) if all_probs else None,
        "highest_profile": highest_profile,
        "lowest_profile": lowest_profile,
    }

    return {
        "prompt_version": PROMPT_VERSION,
        "provider_summary": provider_summary,
        "profile_summary": profile_summary,
        "overall": overall,
    }


# ---------- Supabase helpers ----------

def insert_raw_forecast(
    question: Dict[str, str],
    provider: str,
    model: str,
    profile_name: str,
    run_idx: int,
    parsed: Dict[str, Any],
    prompt_version: str = PROMPT_VERSION,
) -> None:
    if not supabase:
        return

    base_payload = {
        "question_id": question["id"],
        "question_text": question["text"],
        "provider": provider,
        "model": model,
        "profile": profile_name,
        "run_number": run_idx,
        "probability": parsed["probability"],
        "confidence": parsed["confidence"],
        "rationale": parsed["rationale"],
        "assumptions": parsed["assumptions"],
    }
    try:
        supabase.table("ai_forecasts").insert({**base_payload, "prompt_version": prompt_version}).execute()
    except Exception:
        supabase.table("ai_forecasts").insert(base_payload).execute()

def upsert_summary(question: Dict[str, str], summary: Dict[str, Any]) -> None:
    if not supabase:
        return

    payload = {
        "question_id": question["id"],
        "question_text": question["text"],
        "ai_baseline_probability": summary["overall"]["ai_baseline_probability"],
        "summary": summary,
        "updated_at": now_iso(),
        "prompt_version": summary.get("prompt_version"),
    }
    supabase.table("ai_forecast_summaries").upsert(
        payload,
        on_conflict="question_id",
        ignore_duplicates=False,
    ).execute()


def upsert_signal(question: Dict[str, str], summary: Dict[str, Any]) -> None:
    if not supabase:
        return

    overall = summary.get("overall", {})
    score = overall.get("disagreement_score")
    ai_consensus = overall.get("weighted_ai_baseline_probability") or overall.get("ai_baseline_probability")

    if score is None:
        signal_strength = None
    elif score <= 5:
        signal_strength = "low"
    elif score <= 15:
        signal_strength = "moderate"
    else:
        signal_strength = "high"

    payload = {
        "id":              question["id"],
        "question":        question["text"],
        "category":        question.get("domain"),
        "status":          "active",
        "resolution_date": question.get("deadline"),
        "ai_consensus":    ai_consensus,
        "combined_signal": ai_consensus,
        "divergence":      score,
        "signal_strength": signal_strength,
    }
    supabase.table("signals").upsert(
        payload,
        on_conflict="id",
        ignore_duplicates=False,
    ).execute()


# ---------- Provider Calls ----------

def _openai_post(url: str, headers: Dict[str, str], payload: Dict[str, Any]) -> requests.Response:
    """POST to OpenAI with up to 3 retries on 429 or 5xx. Exponential backoff: 1s, 2s, 4s."""
    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        resp = requests.post(url, headers=headers, json=payload, timeout=90)
        if resp.status_code not in (429, 500, 502, 503, 504) or attempt == max_attempts:
            return resp
        wait = 2 ** (attempt - 1)
        print(f"  [RETRY] OpenAI HTTP {resp.status_code} — attempt {attempt}/{max_attempts}, waiting {wait}s")
        time.sleep(wait)
    return resp  # unreachable but satisfies type checker

def call_openai(question: Dict[str, str], profile_name: str, profile_instruction: str, evidence_brief: str = "") -> Dict[str, Any]:
    if not OPENAI_API_KEY:
        raise RuntimeError("Missing OPENAI_API_KEY")

    url = "https://api.openai.com/v1/responses"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": OPENAI_MODEL,
        "input": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": build_initial_user_prompt(question, profile_name, profile_instruction, evidence_brief),
            },
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "forecast_response",
                "schema": FORECAST_JSON_SCHEMA,
                "strict": True,
            }
        },
    }

    print(f"  [openai] calling {OPENAI_MODEL} profile={profile_name}")
    resp = _openai_post(url, headers, payload)
    resp.raise_for_status()
    data = resp.json()

    output_text = _extract_openai_text(data)
    parsed = validate_forecast(json.loads(output_text))
    print(f"  [openai] extracted text OK — p={parsed.probability} conf={parsed.confidence}")
    return {"raw": data, "parsed": parsed.model_dump(), "model_name": OPENAI_MODEL, "initial_raw_text": output_text}


def call_anthropic(question: Dict[str, str], profile_name: str, profile_instruction: str, evidence_brief: str = "") -> Dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("Missing ANTHROPIC_API_KEY")

    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    payload = {
        "model": ANTHROPIC_MODEL,
        "max_tokens": 500,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": build_initial_user_prompt(question, profile_name, profile_instruction, evidence_brief),
            }
        ],
    }

    resp = requests.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()

    parts = data.get("content", [])
    text_chunks = [p.get("text", "") for p in parts if p.get("type") == "text"]
    text = "\n".join(text_chunks).strip()
    parsed_json = json.loads(extract_first_json_object(text))
    parsed = validate_forecast(parsed_json)

    return {"raw": data, "parsed": parsed.model_dump(), "initial_raw_text": text, "model_name": ANTHROPIC_MODEL}


def run_single(
    provider: str,
    question: Dict[str, str],
    profile_name: str,
    profile_instruction: str,
    evidence_brief: str = "",
) -> Dict[str, Any]:
    if provider == "openai":
        return call_openai(question, profile_name, profile_instruction, evidence_brief)
    if provider == "anthropic":
        return call_anthropic(question, profile_name, profile_instruction, evidence_brief)
    raise ValueError(f"Unknown provider: {provider}")


def _call_raw_text(provider: str, system: str, user: str) -> str:
    """Make a provider call that returns plain text (used for critique)."""
    if provider == "openai":
        if not OPENAI_API_KEY:
            raise RuntimeError("Missing OPENAI_API_KEY")
        resp = _openai_post(
            "https://api.openai.com/v1/responses",
            {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            {"model": OPENAI_MODEL, "input": [{"role": "system", "content": system}, {"role": "user", "content": user}]},
        )
        resp.raise_for_status()
        return _extract_openai_text(resp.json())

    if provider == "anthropic":
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("Missing ANTHROPIC_API_KEY")
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 600,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        parts = resp.json().get("content", [])
        return "\n".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()

    raise ValueError(f"Unknown provider: {provider}")


def _call_forecast_with_prompt(provider: str, user_prompt: str) -> Dict[str, Any]:
    """
    Call provider with a pre-built user prompt and return parsed forecast + raw text.
    Used for the revision step where the prompt is already fully constructed.
    """
    if provider == "openai":
        if not OPENAI_API_KEY:
            raise RuntimeError("Missing OPENAI_API_KEY")
        resp = _openai_post(
            "https://api.openai.com/v1/responses",
            {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            {
                "model": OPENAI_MODEL,
                "input": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "text": {"format": {"type": "json_schema", "name": "forecast_response", "schema": FORECAST_JSON_SCHEMA, "strict": True}},
            },
        )
        resp.raise_for_status()
        output_text = _extract_openai_text(resp.json())
        parsed = validate_forecast(json.loads(output_text))
        return {"parsed": parsed.model_dump(), "raw_text": output_text}

    if provider == "anthropic":
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("Missing ANTHROPIC_API_KEY")
        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": ANTHROPIC_MODEL,
                "max_tokens": 600,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_prompt}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        parts = resp.json().get("content", [])
        text = "\n".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()
        parsed = validate_forecast(json.loads(extract_first_json_object(text)))
        return {"parsed": parsed.model_dump(), "raw_text": text}

    raise ValueError(f"Unknown provider: {provider}")


def run_with_critique(
    provider: str,
    question: Dict[str, str],
    profile_name: str,
    profile_instruction: str,
    evidence_brief: str = "",
) -> Dict[str, Any]:
    """
    Run initial forecast → critique → revised forecast.
    Falls back to initial if critique or revision fails.
    Returns: parsed, initial_parsed, initial_raw_text, revision_raw_text, critique_text, stage_used, model_name.
    """
    initial_result = run_single(provider, question, profile_name, profile_instruction, evidence_brief)
    initial_parsed: Dict[str, Any] = initial_result["parsed"]
    initial_raw_text: Optional[str] = initial_result.get("initial_raw_text")
    model_name: str = initial_result["model_name"]

    critique_text: Optional[str] = None
    revision_raw_text: Optional[str] = None
    final_parsed = initial_parsed
    stage_used = "initial_fallback"

    try:
        critique_text = _call_raw_text(
            provider,
            system="You are a critical reviewer of probabilistic forecasts.",
            user=build_critique_prompt(question, initial_parsed, evidence_brief),
        )

        revision_prompt = build_revision_prompt(
            question, profile_name, profile_instruction, initial_parsed, critique_text, evidence_brief
        )
        revision_result = _call_forecast_with_prompt(provider, revision_prompt)
        final_parsed = revision_result["parsed"]
        revision_raw_text = revision_result.get("raw_text")
        stage_used = "revised"

    except Exception as e:
        print(f"  [WARN] Critique/revision failed ({e}), using initial forecast")

    return {
        "parsed": final_parsed,
        "initial_parsed": initial_parsed,
        "initial_raw_text": initial_raw_text,
        "revision_raw_text": revision_raw_text,
        "critique_text": critique_text,
        "stage_used": stage_used,
        "model_name": model_name,
    }


# ---------- Main Runner ----------

def main() -> None:
    all_results: List[Dict[str, Any]] = []

    for question in QUESTIONS:
        question_runs: List[Dict[str, Any]] = []

        evidence_provider = PROVIDERS[0]
        print(f"[EVIDENCE] Generating brief for {question['id']} via {evidence_provider}...")
        evidence_brief = generate_evidence_brief(evidence_provider, question)
        if evidence_brief:
            print(f"[EVIDENCE] Brief generated ({len(evidence_brief)} chars)")

        for profile_name, profile_data in PROFILES.items():
            profile_instruction = profile_data["prompt"]
            for provider in PROVIDERS:
                for run_idx in range(1, RUNS_PER_PROVIDER + 1):
                    record: Dict[str, Any] = {
                        "timestamp_utc": now_iso(),
                        "question_id": question["id"],
                        "question_text": question["text"],
                        "provider": provider,
                        "profile": profile_name,
                        "run_number": run_idx,
                        "prompt_version": PROMPT_VERSION,
                        "status": "ok",
                    }

                    try:
                        result = run_with_critique(provider, question, profile_name, profile_instruction, evidence_brief)
                        record["parsed"] = result["parsed"]
                        record["initial_parsed"] = result["initial_parsed"]
                        if evidence_brief:
                            record["evidence_brief"] = evidence_brief
                        record["model_name"] = result["model_name"]
                        record["stage_used"] = result["stage_used"]
                        record["critique_text"] = result["critique_text"]
                        if result.get("initial_raw_text"):
                            record["initial_raw_text"] = result["initial_raw_text"]
                        if result.get("revision_raw_text"):
                            record["revision_raw_text"] = result["revision_raw_text"]

                        insert_raw_forecast(
                            question=question,
                            provider=provider,
                            model=result["model_name"],
                            profile_name=profile_name,
                            run_idx=run_idx,
                            parsed=result["parsed"],
                        )

                        print(
                            f"[OK] {question['id']} | {profile_name} | {provider} | run {run_idx} "
                            f"-> p={result['parsed']['probability']} ({result['stage_used']})"
                        )

                    except Exception as e:
                        record["status"] = "error"
                        record["error"] = str(e)
                        print(
                            f"[ERR] {question['id']} | {profile_name} | {provider} | run {run_idx} "
                            f"-> {type(e).__name__}: {e}"
                        )

                    question_runs.append(record)
                    all_results.append(record)
                    time.sleep(SLEEP_SECONDS)

            time.sleep(1.5)

        ok_runs = [r for r in question_runs if r.get("status") == "ok" and "parsed" in r]
        print(f"[SUMMARY] {question['id']}: {len(ok_runs)}/{len(question_runs)} runs succeeded")
        summary = summarize_results(question_runs)

        write_json(
            os.path.join(OUTPUT_DIR, f"{question['id']}_runs.json"),
            question_runs,
        )
        write_json(
            os.path.join(OUTPUT_DIR, f"{question['id']}_summary.json"),
            summary,
        )

        try:
            upsert_summary(question, summary)
        except Exception as e:
            print(f"[WARN] Failed to upsert summary to Supabase for {question['id']}: {e}")

        try:
            upsert_signal(question, summary)
        except Exception as e:
            print(f"[WARN] Failed to upsert signal to Supabase for {question['id']}: {e}")

    write_json(os.path.join(OUTPUT_DIR, "all_runs.json"), all_results)

    overall_by_question: Dict[str, Any] = {}
    for question in QUESTIONS:
        rows = [r for r in all_results if r["question_id"] == question["id"]]
        overall_by_question[question["id"]] = {
            "question_text": question["text"],
            "summary": summarize_results(rows),
        }

    write_json(os.path.join(OUTPUT_DIR, "overall_summary.json"), overall_by_question)
    print(f"\nDone. Wrote results to ./{OUTPUT_DIR}/")


if __name__ == "__main__":
    main()