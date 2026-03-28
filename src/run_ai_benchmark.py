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
    "base": (
        "Use a balanced, evidence-weighted forecast. Consider technical, economic, "
        "and adoption constraints."
    ),
}

# Start small. Add Anthropic later once OpenAI works.
PROVIDERS = ["openai"]
RUNS_PER_PROVIDER = 1
SLEEP_SECONDS = 3.0


# ---------- Prompting ----------

SYSTEM_PROMPT = """You are making a calibrated probabilistic forecast.

Return JSON only.
Do not use markdown fences.
Do not hedge with ranges.
Use the exact deadline and resolution criteria.
Avoid overconfidence.
"""

def build_user_prompt(question: Dict[str, str], profile_name: str, profile_instruction: str) -> str:
    return f"""
Question:
{question["text"]}

Resolution criteria:
{question["resolution_criteria"]}

Deadline:
{question["deadline"]}

Domain:
{question["domain"]}

Profile:
{profile_name}

Profile instructions:
{profile_instruction}

Return JSON with exactly these fields:
- probability: integer from 0 to 100
- rationale: string, max 3 sentences
- assumptions: array of 2 to 5 short strings
- confidence: number from 0 to 1
""".strip()


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

def validate_forecast(data: Dict[str, Any]) -> ForecastResponse:
    return ForecastResponse.model_validate(data)

def write_json(path: str, payload: Any) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

def summarize_results(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    by_provider: Dict[str, List[int]] = {}
    by_profile: Dict[str, List[int]] = {}

    for row in rows:
        if row.get("status") != "ok":
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

    all_probs = [row["parsed"]["probability"] for row in rows if row.get("status") == "ok"]
    overall = {
        "n": len(all_probs),
        "ai_baseline_probability": round(statistics.mean(all_probs), 1) if all_probs else None,
        "ai_spread_stdev": round(statistics.pstdev(all_probs), 1) if len(all_probs) > 1 else 0.0,
    }

    return {
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
) -> None:
    if not supabase:
        return

    supabase.table("ai_forecasts").insert({
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
    }).execute()

def upsert_summary(question: Dict[str, str], summary: Dict[str, Any]) -> None:
    if not supabase:
        return

    supabase.table("ai_forecast_summaries").upsert({
        "question_id": question["id"],
        "question_text": question["text"],
        "ai_baseline_probability": summary["overall"]["ai_baseline_probability"],
        "summary": summary,
        "updated_at": now_iso(),
    }).execute()


# ---------- Provider Calls ----------

def call_openai(question: Dict[str, str], profile_name: str, profile_instruction: str) -> Dict[str, Any]:
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
                "content": build_user_prompt(question, profile_name, profile_instruction),
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

    resp = requests.post(url, headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    data = resp.json()

    output_text = data.get("output_text")
    if not output_text:
        raise ValueError(f"OpenAI response missing output_text: {json.dumps(data)[:500]}")

    parsed = validate_forecast(json.loads(output_text))
    return {"raw": data, "parsed": parsed.model_dump(), "model_name": OPENAI_MODEL}


def call_anthropic(question: Dict[str, str], profile_name: str, profile_instruction: str) -> Dict[str, Any]:
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
                "content": build_user_prompt(question, profile_name, profile_instruction),
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

    return {"raw": data, "parsed": parsed.model_dump(), "raw_text": text, "model_name": ANTHROPIC_MODEL}


def run_single(provider: str, question: Dict[str, str], profile_name: str, profile_instruction: str) -> Dict[str, Any]:
    if provider == "openai":
        return call_openai(question, profile_name, profile_instruction)
    if provider == "anthropic":
        return call_anthropic(question, profile_name, profile_instruction)
    raise ValueError(f"Unknown provider: {provider}")


# ---------- Main Runner ----------

def main() -> None:
    all_results: List[Dict[str, Any]] = []

    for question in QUESTIONS:
        question_runs: List[Dict[str, Any]] = []

        for profile_name, profile_instruction in PROFILES.items():
            for provider in PROVIDERS:
                for run_idx in range(1, RUNS_PER_PROVIDER + 1):
                    record = {
                        "timestamp_utc": now_iso(),
                        "question_id": question["id"],
                        "question_text": question["text"],
                        "provider": provider,
                        "profile": profile_name,
                        "run_number": run_idx,
                        "status": "ok",
                    }

                    try:
                        result = run_single(provider, question, profile_name, profile_instruction)
                        record["parsed"] = result["parsed"]
                        record["raw"] = result["raw"]
                        record["model_name"] = result["model_name"]

                        if "raw_text" in result:
                            record["raw_text"] = result["raw_text"]

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
                            f"-> p={result['parsed']['probability']}"
                        )

                    except (requests.HTTPError, requests.Timeout, ValidationError, ValueError, RuntimeError) as e:
                        record["status"] = "error"
                        record["error"] = str(e)
                        print(
                            f"[ERR] {question['id']} | {profile_name} | {provider} | run {run_idx} "
                            f"-> {e}"
                        )

                    question_runs.append(record)
                    all_results.append(record)
                    time.sleep(SLEEP_SECONDS)

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