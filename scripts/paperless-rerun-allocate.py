#!/usr/bin/env python3
"""
Careful Paperless re-run for Dovetails FSM.

For each Paperless document linked to an expense (and materials expenses with
local receipt photos):
  1) Optionally re-parse line items from the receipt image (AI)
  2) Re-learn materials catalog from line items
  3) Suggest / auto-assign job + client from OCR text + expense notes
     (PO/JOB NAME, address fragments, client names)

High-confidence unique matches are applied. Ambiguous / low-confidence matches
are reported only — never force-linked.

Usage (from host with compose + env):
  python3 scripts/paperless-rerun-allocate.py --dry-run
  python3 scripts/paperless-rerun-allocate.py --apply
  python3 scripts/paperless-rerun-allocate.py --apply --reparse
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any


ACCOUNT_ID = "aaaaaaaa-0000-0000-0000-000000000001"
OWNER_USER_ID = "aaaaaaaa-0000-0000-0000-000000000002"
COMPOSE = [
    "docker",
    "compose",
    "--env-file",
    "/opt/business/ai-fsm/env/.env",
    "-f",
    "/opt/business/ai-fsm/repo/infra/compose.garonhome.yml",
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    with open("/opt/business/ai-fsm/env/.env", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def mint_token(secret: str) -> str:
    header = b64url(json.dumps({"alg": "HS256"}, separators=(",", ":")).encode())
    now = int(time.time())
    payload = b64url(
        json.dumps(
            {
                "userId": OWNER_USER_ID,
                "accountId": ACCOUNT_ID,
                "role": "owner",
                "iat": now,
                "exp": now + 4 * 3600,
            },
            separators=(",", ":"),
        ).encode()
    )
    sig = b64url(
        hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{sig}"


def psql(sql: str, env: dict[str, str]) -> str:
    cmd = COMPOSE + [
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        env["POSTGRES_USER"],
        "-d",
        env["POSTGRES_DB"],
        "-v",
        "ON_ERROR_STOP=1",
        "-t",
        "-A",
        "-F",
        "\t",
        "-c",
        sql,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr or r.stdout}")
    return r.stdout


def psql_json(sql: str, env: dict[str, str]) -> list[dict[str, Any]]:
    # Use json_agg for structured rows
    wrapped = f"SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) FROM ({sql}) q"
    out = psql(wrapped, env).strip()
    if not out:
        return []
    return json.loads(out)


def paperless_get(env: dict[str, str], path: str) -> Any:
    url = env["PAPERLESS_URL"].rstrip("/") + path
    req = urllib.request.Request(
        url, headers={"Authorization": f"Token {env['PAPERLESS_API_TOKEN']}"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode())


def paperless_list_all(env: dict[str, str]) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    page = 1
    while True:
        data = paperless_get(env, f"/api/documents/?page_size=100&page={page}")
        docs.extend(data.get("results") or [])
        if not data.get("next"):
            break
        page += 1
    return docs


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def extract_job_hints(text: str) -> list[str]:
    """Pull PO/JOB NAME fragments from OCR / notes (strict — avoid title noise)."""
    if not text:
        return []
    hints: list[str] = []
    # Home Depot / similar — allow OCR noise before PO/JOB
    for m in re.finditer(
        r"(?:PO\s*/\s*JOB|PO\s*JOB|JOB\s*NAME|PO\s*NAME)\s*[:\-]?\s*([A-Za-z0-9 .,#/'&\-]{2,50})",
        text,
        re.I,
    ):
        h = m.group(1).strip(" .;|:")
        h = re.split(
            r"\s{2,}|PRO XTRA|SPEND|YOU |CREDIT|TOTAL|SUBTOTAL|THANK|www\.|homedepot",
            h,
            maxsplit=1,
            flags=re.I,
        )[0].strip()
        # Drop pure dates / garbage
        if re.fullmatch(r"[\d./\-]+", h):
            continue
        if "receipt" in h.lower():
            continue
        if len(norm(h)) >= 2:
            hints.append(h)
    # Explicit street-like lines with known street types
    for m in re.finditer(
        r"\b(\d{1,5}\s+[A-Za-z][A-Za-z0-9' \-]{0,28}\s(?:St|Street|Rd|Road|Ave|Avenue|Ln|Lane|Dr|Drive|Way|Ct|Court)\.?)\b",
        text,
        re.I,
    ):
        hints.append(m.group(1).strip())
    seen: set[str] = set()
    out: list[str] = []
    for h in hints:
        k = norm(h)
        if k and k not in seen and len(k) >= 2:
            seen.add(k)
            out.append(h)
    return out[:8]


@dataclass
class Job:
    id: str
    title: str
    status: str
    client_id: str | None
    client_name: str | None
    address: str | None


@dataclass
class Match:
    job: Job
    score: float
    reason: str


def score_job(hint: str, job: Job) -> Match | None:
    nh = norm(hint)
    if not nh or len(nh) < 2:
        return None
    fields = [
        ("title", job.title),
        ("client", job.client_name or ""),
        ("address", job.address or ""),
    ]
    best = 0.0
    reason = ""
    for label, raw in fields:
        nf = norm(raw)
        if not nf:
            continue
        if nh == nf:
            sc = 1.0
        elif nh in nf or nf in nh:
            # Require meaningful length to avoid "st"/"rd" false positives
            if min(len(nh), len(nf)) < 3:
                continue
            sc = 0.85 + 0.1 * min(len(nh), len(nf)) / max(len(nh), len(nf))
        else:
            th, tf = set(nh.split()), set(nf.split())
            # Drop ultra-short tokens
            th = {t for t in th if len(t) >= 3}
            tf = {t for t in tf if len(t) >= 3}
            if not th or not tf:
                continue
            inter = th & tf
            if not inter:
                continue
            sc = 0.55 + 0.4 * (len(inter) / max(len(th), len(tf)))
        if sc > best:
            best = sc
            reason = f"{label}~{hint!r}"
    if best < 0.7:
        return None
    return Match(job=job, score=best, reason=reason)


def job_is_link_noise(job: Job) -> bool:
    """Skip placeholder / non-project jobs for auto-allocation."""
    t = norm(job.title)
    if not t:
        return True
    noise = ("test", "sms inquiry", "referral partner", "payment")
    return any(n in t for n in noise)


def match_jobs_against_text(text: str, jobs: list[Job]) -> list[Match]:
    """Score jobs by whether their address/client/title tokens appear in OCR text."""
    nt = norm(text)
    if not nt:
        return []
    out: list[Match] = []
    for j in jobs:
        if job_is_link_noise(j):
            continue
        best = 0.0
        reason = ""
        # Full address / house# + street token (strongest signal on HD PO/JOB lines)
        if j.address:
            na = norm(j.address)
            if len(na) >= 4 and na in nt:
                best = 0.95
                reason = f"ocr_contains_address~{j.address!r}"
            else:
                parts = na.split()
                if len(parts) >= 2 and parts[0].isdigit() and len(parts[1]) >= 3:
                    key = f"{parts[0]} {parts[1]}"
                    if key in nt:
                        best = 0.92
                        reason = f"ocr_contains~{key!r}"
        if j.client_name:
            nc = norm(j.client_name)
            tokens = [t for t in nc.split() if len(t) >= 4]
            if nc and len(nc) >= 6 and nc in nt:
                if 0.88 > best:
                    best = 0.88
                    reason = f"ocr_contains_client~{j.client_name!r}"
            # last-name-only is not enough alone for auto-link
        if j.title:
            nt_title = norm(j.title)
            skip = {"general", "repairs", "repair", "for", "and", "the", "home", "list", "work"}
            title_tokens = [t for t in nt_title.split() if len(t) >= 5 and t not in skip]
            if title_tokens:
                hit = [t for t in title_tokens if t in nt]
                if len(hit) >= 2:
                    sc = 0.8 + 0.05 * len(hit)
                    if sc > best:
                        best = sc
                        reason = f"ocr_title_tokens~{hit}"
        if best >= 0.8:
            out.append(Match(job=j, score=best, reason=reason))
    return out


def best_job_match(hints: list[str], jobs: list[Job], ocr_text: str = "") -> tuple[Match | None, list[Match]]:
    usable = [j for j in jobs if not job_is_link_noise(j)]
    candidates: list[Match] = []
    for h in hints:
        for j in usable:
            m = score_job(h, j)
            if m:
                candidates.append(m)
    candidates.extend(match_jobs_against_text(ocr_text, usable))
    by_job: dict[str, Match] = {}
    for m in candidates:
        prev = by_job.get(m.job.id)
        if not prev or m.score > prev.score:
            by_job[m.job.id] = m
    ranked = sorted(by_job.values(), key=lambda m: m.score, reverse=True)
    if not ranked:
        return None, []
    top = ranked[0]
    # Only auto-link unique strong matches. Tied address scores (multiple jobs
    # at one property) must stay ambiguous — never pick sort-order winners.
    if top.score >= 0.9 and (len(ranked) == 1 or top.score - ranked[1].score >= 0.05):
        return top, ranked[:3]
    return None, ranked[:3]


def api_json(method: str, url: str, token: str, body: Any | None = None, timeout: int = 180) -> tuple[int, Any]:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Cookie": f"fsm_session={token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw[:500]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Report only (default if neither flag)")
    ap.add_argument("--apply", action="store_true", help="Write job/client links + catalog learn")
    ap.add_argument("--reparse", action="store_true", help="Re-run AI parse on materials expenses with local receipt photos")
    ap.add_argument("--include-completed-jobs", action="store_true", default=True)
    args = ap.parse_args()
    if not args.apply:
        args.dry_run = True

    env = load_env()
    app_url = env.get("APP_BASE_URL", "https://app.mydovetails.com").rstrip("/")
    token = mint_token(env["AUTH_SECRET"])

    # Jobs (open + completed for historical allocation)
    jobs_sql = f"""
      SELECT j.id, j.title, j.status, j.client_id::text,
             c.name AS client_name, p.address
      FROM jobs j
      LEFT JOIN clients c ON c.id = j.client_id
      LEFT JOIN properties p ON p.id = j.property_id
      WHERE j.account_id = '{ACCOUNT_ID}'
        AND j.status NOT IN ('cancelled')
      ORDER BY j.updated_at DESC
      LIMIT 500
    """
    jobs = [
        Job(
            id=r["id"],
            title=r["title"] or "",
            status=r["status"] or "",
            client_id=r.get("client_id"),
            client_name=r.get("client_name"),
            address=r.get("address"),
        )
        for r in psql_json(jobs_sql, env)
    ]

    # Expenses with paperless link and/or receipt photo
    exp_sql = f"""
      SELECT e.id, e.vendor_name, e.category, e.amount_cents, e.expense_date::text AS expense_date,
             e.notes, e.job_id::text AS job_id, e.client_id::text AS client_id,
             e.receipt_url,
             (SELECT d.paperless_doc_id FROM document_links d
              WHERE d.entity_type='expense' AND d.entity_id=e.id
              ORDER BY d.created_at DESC LIMIT 1) AS paperless_doc_id,
             (SELECT count(*) FROM expense_line_items eli WHERE eli.expense_id=e.id) AS line_count
      FROM expenses e
      WHERE e.account_id = '{ACCOUNT_ID}'
        AND (
          (e.receipt_url IS NOT NULL AND btrim(e.receipt_url) <> '')
          OR EXISTS (
            SELECT 1 FROM document_links d
            WHERE d.entity_type='expense' AND d.entity_id=e.id
          )
        )
      ORDER BY e.expense_date DESC NULLS LAST
    """
    expenses = psql_json(exp_sql, env)

    # Paperless docs for OCR text
    try:
        pl_docs = {d["id"]: d for d in paperless_list_all(env)}
    except Exception as e:
        print(f"WARN: could not list Paperless docs: {e}", file=sys.stderr)
        pl_docs = {}

    report: dict[str, Any] = {
        "mode": "apply" if args.apply else "dry-run",
        "reparse": args.reparse,
        "paperless_docs": len(pl_docs),
        "expenses_in_scope": len(expenses),
        "jobs_considered": len(jobs),
        "actions": [],
        "summary": {
            "reparses_ok": 0,
            "reparses_fail": 0,
            "auto_linked": 0,
            "already_linked": 0,
            "ambiguous": 0,
            "no_match": 0,
            "skipped_non_materials": 0,
        },
    }

    for e in expenses:
        eid = e["id"]
        category = e.get("category") or "other"
        vendor = e.get("vendor_name") or ""
        notes = e.get("notes") or ""
        pl_id = e.get("paperless_doc_id")
        pl = pl_docs.get(pl_id) if pl_id else None
        pl_content = (pl or {}).get("content") or ""
        pl_title = (pl or {}).get("title") or ""

        text_blob = "\n".join([pl_title, pl_content, notes, vendor])
        hints = extract_job_hints(text_blob)

        action: dict[str, Any] = {
            "expense_id": eid,
            "date": e.get("expense_date"),
            "vendor": vendor,
            "category": category,
            "amount_cents": e.get("amount_cents"),
            "paperless_doc_id": pl_id,
            "line_count_before": e.get("line_count") or 0,
            "job_id_before": e.get("job_id"),
            "client_id_before": e.get("client_id"),
            "hints": hints,
        }

        # Re-parse materials with local photo
        if args.reparse and category == "materials" and e.get("receipt_url"):
            if args.apply:
                status, body = api_json(
                    "POST",
                    f"{app_url}/api/v1/expenses/{eid}/parse-line-items",
                    token,
                    body={},
                    timeout=180,
                )
                action["reparse_http"] = status
                if status == 200:
                    data = body.get("data") or {}
                    lines = data.get("line_items") or []
                    action["line_count_after"] = len(lines)
                    action["catalog_learned"] = data.get("catalog_learned")
                    action["reconciliation"] = data.get("reconciliation")
                    report["summary"]["reparses_ok"] += 1
                    # PUT again is redundant if parse learns; parse now learns on prod after deploy
                else:
                    action["reparse_error"] = body
                    report["summary"]["reparses_fail"] += 1
            else:
                action["reparse"] = "would_reparse"
                report["summary"]["reparses_ok"] += 1
        elif category != "materials":
            report["summary"]["skipped_non_materials"] += 1

        # Allocation
        if e.get("job_id") and e.get("client_id"):
            action["allocation"] = "already_linked"
            report["summary"]["already_linked"] += 1
        else:
            auto, ranked = best_job_match(hints, jobs, ocr_text=text_blob)
            action["candidates"] = [
                {
                    "job_id": m.job.id,
                    "title": m.job.title,
                    "client": m.job.client_name,
                    "address": m.job.address,
                    "score": round(m.score, 3),
                    "reason": m.reason,
                    "status": m.job.status,
                }
                for m in ranked
            ]
            if auto:
                action["allocation"] = "auto"
                action["assign"] = {
                    "job_id": auto.job.id,
                    "client_id": auto.job.client_id,
                    "title": auto.job.title,
                    "score": round(auto.score, 3),
                    "reason": auto.reason,
                }
                if args.apply:
                    patch = {"job_id": auto.job.id}
                    if auto.job.client_id:
                        patch["client_id"] = auto.job.client_id
                    status, body = api_json(
                        "PATCH",
                        f"{app_url}/api/v1/expenses/{eid}",
                        token,
                        body=patch,
                        timeout=60,
                    )
                    action["assign_http"] = status
                    if status not in (200, 201):
                        action["assign_error"] = body
                    else:
                        report["summary"]["auto_linked"] += 1
                else:
                    report["summary"]["auto_linked"] += 1
            elif ranked:
                action["allocation"] = "ambiguous"
                report["summary"]["ambiguous"] += 1
            else:
                action["allocation"] = "no_match"
                report["summary"]["no_match"] += 1

        report["actions"].append(action)
        if args.reparse and args.apply and category == "materials" and e.get("receipt_url"):
            time.sleep(1.5)  # rate limit AI

    # Paperless docs with no expense link — try match expense by date+vendor, then job
    linked_pl = {e.get("paperless_doc_id") for e in expenses if e.get("paperless_doc_id")}
    orphan_docs = []
    report["summary"]["orphan_linked"] = 0
    report["summary"]["orphan_job_assigned"] = 0

    def vendor_from_title(title: str) -> str:
        t = title.lower()
        if "home depot" in t or "homedepot" in t:
            return "home depot"
        if "lowe" in t:
            return "lowe"
        if "ace" in t:
            return "ace"
        if "benson" in t:
            return "benson"
        if "speedway" in t or "circle k" in t or "irving" in t or "dunkin" in t:
            return "fuel"
        if "derry" in t:
            return "derry"
        if "harbor" in t:
            return "harbor"
        return norm(title)[:20]

    for did, d in pl_docs.items():
        if did in linked_pl:
            continue
        title = d.get("title") or ""
        content = d.get("content") or ""
        created = (d.get("created_date") or d.get("created") or "")[:10]
        hints = extract_job_hints(title + "\n" + content)
        auto, ranked = best_job_match(hints, jobs, ocr_text=title + "\n" + content)
        vkey = vendor_from_title(title)

        # Find expense same day + similar vendor, prefer unlinked paperless.
        # Never auto-pick when top candidates are tied (same score) — that would
        # attach receipts to an arbitrary expense under --apply.
        candidates_exp = []
        known_vendor_keys = {"home depot", "lowe", "benson", "derry", "fuel", "harbor"}
        for e in expenses:
            ed = (e.get("expense_date") or "")[:10]
            if created and ed and ed != created:
                continue
            ev = (e.get("vendor_name") or "").lower()
            if vkey == "home depot" and "depot" not in ev:
                continue
            if vkey == "lowe" and "lowe" not in ev:
                continue
            if vkey == "benson" and "benson" not in ev:
                continue
            if vkey == "derry" and "derry" not in ev:
                continue
            if vkey == "fuel" and not any(x in ev for x in ("speedway", "circle", "irving", "dunkin", "shell", "gas")):
                continue
            if vkey == "harbor" and "harbor" not in ev:
                continue
            # Unsupported / short vendor keys (e.g. "ace"): require a vendor substring
            # match so we do not link every same-day expense.
            if vkey and vkey not in known_vendor_keys:
                tokens = [t for t in vkey.split() if len(t) >= 3]
                if not tokens or not any(t in ev for t in tokens):
                    continue
            score = 1.0 if not e.get("paperless_doc_id") else 0.5
            candidates_exp.append((score, e))
        candidates_exp.sort(key=lambda x: -x[0])
        match_exp = None
        if len(candidates_exp) == 1:
            match_exp = candidates_exp[0][1]
        elif len(candidates_exp) >= 2 and candidates_exp[0][0] > candidates_exp[1][0]:
            match_exp = candidates_exp[0][1]
        # else: empty or tied top scores → leave unmatched (report only)

        entry = {
            "paperless_doc_id": did,
            "title": title,
            "created": created,
            "hints": hints,
            "matched_expense_id": match_exp["id"] if match_exp else None,
            "matched_expense_vendor": match_exp.get("vendor_name") if match_exp else None,
            "suggested_job": (
                {
                    "job_id": auto.job.id,
                    "client_id": auto.job.client_id,
                    "title": auto.job.title,
                    "client": auto.job.client_name,
                    "score": round(auto.score, 3),
                }
                if auto
                else None
            ),
            "candidates": [
                {"title": m.job.title, "score": round(m.score, 3)} for m in ranked[:3]
            ],
        }

        if args.apply and match_exp:
            # Create document_link (bypass RLS as table owner via postgres)
            title_esc = title.replace("'", "''")[:200]
            fn = (d.get("original_file_name") or "receipt.jpg").replace("'", "''")[:200]
            sql = f"""
            SELECT set_config('app.current_account_id', '{ACCOUNT_ID}', true);
            SELECT set_config('app.current_user_id', '{OWNER_USER_ID}', true);
            INSERT INTO document_links
              (account_id, entity_type, entity_id, paperless_doc_id, title, original_filename, created_by, document_type)
            VALUES
              ('{ACCOUNT_ID}', 'expense', '{match_exp["id"]}', {did}, '{title_esc}', '{fn}',
               '{OWNER_USER_ID}', 'receipt')
            ON CONFLICT DO NOTHING;
            """
            try:
                psql(sql, env)
                entry["link_created"] = True
                report["summary"]["orphan_linked"] += 1
            except Exception as ex:
                entry["link_error"] = str(ex)[:200]

            # Assign job if expense lacks job and we have confident match
            if auto and not match_exp.get("job_id"):
                patch = {"job_id": auto.job.id}
                if auto.job.client_id:
                    patch["client_id"] = auto.job.client_id
                status, body = api_json(
                    "PATCH",
                    f"{app_url}/api/v1/expenses/{match_exp['id']}",
                    token,
                    body=patch,
                    timeout=60,
                )
                entry["assign_http"] = status
                if status in (200, 201):
                    report["summary"]["orphan_job_assigned"] += 1
                else:
                    entry["assign_error"] = body
        elif not match_exp:
            entry["note"] = "No expense matched by date+vendor — create expense manually if needed"

        orphan_docs.append(entry)

    report["orphan_paperless_docs"] = orphan_docs
    report["summary"]["orphan_paperless"] = len(orphan_docs)

    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
