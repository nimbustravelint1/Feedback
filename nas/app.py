from __future__ import annotations

import csv
import html
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials

APP_VERSION = "2.0.0"
DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
INBOX_CSV = Path(os.getenv("INBOX_CSV", "/inbox/nimbus_feedback_latest.csv"))
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "change-this-password")
IMPORT_INTERVAL = max(30, int(os.getenv("IMPORT_INTERVAL_SECONDS", "120")))
DB_PATH = DATA_DIR / "nimbus_feedback.sqlite3"
RATINGS = ["hotelDesayuno","hotelInstalacion","hotelServicio","restCalidad","restServicio","guiaActitud","satisfaccionGeneral"]

app = FastAPI(title="Nimbus Feedback Dashboard", version=APP_VERSION)
security = HTTPBasic()
lock = threading.Lock()
last_import: dict[str, Any] = {"time": None, "inserted": 0, "error": None}


def auth(credentials: HTTPBasicCredentials = Depends(security)) -> str:
    ok_user = secrets.compare_digest(credentials.username.encode(), ADMIN_USER.encode())
    ok_pass = secrets.compare_digest(credentials.password.encode(), ADMIN_PASSWORD.encode())
    if not (ok_user and ok_pass):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized", headers={"WWW-Authenticate": "Basic"})
    return credentials.username


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as con:
        con.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
          submissionId TEXT PRIMARY KEY, submittedAt TEXT, receivedAt TEXT, language TEXT, formVersion TEXT,
          groupCode TEXT, name TEXT, ciudades TEXT, itinerario TEXT, puntosEscenicos TEXT,
          hotelDesayuno INTEGER, hotelInstalacion INTEGER, hotelServicio INTEGER, restCalidad INTEGER,
          restServicio INTEGER, guiaActitud INTEGER, satisfaccionGeneral INTEGER, comentarios TEXT,
          sourceUrl TEXT, isLowScore TEXT, lowScoreReason TEXT, importedAt TEXT
        )""")
        con.commit()


def clean_row(row: dict[str, str]) -> dict[str, Any] | None:
    sid = (row.get("submissionId") or "").strip()
    if not sid:
        return None
    out: dict[str, Any] = {k: (row.get(k) or "").strip() for k in row}
    for key in RATINGS:
        try:
            out[key] = int(float(out.get(key) or 0))
        except ValueError:
            out[key] = 0
    if not out.get("isLowScore"):
        low = out.get("satisfaccionGeneral", 0) <= 3 or any(out.get(k, 0) <= 2 for k in RATINGS[:-1])
        out["isLowScore"] = "YES" if low else ""
    out["importedAt"] = datetime.now(timezone.utc).isoformat()
    return out


def import_csv() -> int:
    global last_import
    if not INBOX_CSV.exists():
        last_import = {"time": datetime.now().isoformat(timespec="seconds"), "inserted": 0, "error": f"Waiting for {INBOX_CSV}"}
        return 0
    inserted = 0
    columns = ["submissionId","submittedAt","receivedAt","language","formVersion","groupCode","name","ciudades","itinerario","puntosEscenicos","hotelDesayuno","hotelInstalacion","hotelServicio","restCalidad","restServicio","guiaActitud","satisfaccionGeneral","comentarios","sourceUrl","isLowScore","lowScoreReason","importedAt"]
    try:
        with INBOX_CSV.open("r", encoding="utf-8-sig", newline="") as f, lock, connect() as con:
            for raw in csv.DictReader(f):
                row = clean_row(raw)
                if not row:
                    continue
                values = [row.get(c, "") for c in columns]
                cur = con.execute(f"INSERT OR IGNORE INTO feedback ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", values)
                inserted += cur.rowcount
            con.commit()
        last_import = {"time": datetime.now().isoformat(timespec="seconds"), "inserted": inserted, "error": None}
    except Exception as exc:
        last_import = {"time": datetime.now().isoformat(timespec="seconds"), "inserted": 0, "error": str(exc)}
    return inserted


def importer() -> None:
    while True:
        import_csv()
        time.sleep(IMPORT_INTERVAL)


@app.on_event("startup")
def startup() -> None:
    init_db()
    import_csv()
    threading.Thread(target=importer, daemon=True).start()


@app.get("/health")
def health() -> dict[str, Any]:
    with connect() as con:
        count = con.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]
    return {"ok": True, "version": APP_VERSION, "records": count, "inboxExists": INBOX_CSV.exists(), "lastImport": last_import}


def page(rows: list[sqlite3.Row], stats: sqlite3.Row) -> str:
    def esc(v: Any) -> str:
        return html.escape(str(v or ""))
    cards = f"""<div class="stats"><div><b>{stats['total']}</b><span>Total responses</span></div><div><b>{stats['avg'] or '—'}</b><span>Average overall</span></div><div class="alert"><b>{stats['low']}</b><span>Low-score alerts</span></div></div>"""
    table_rows = ''.join(f"""<tr class="{'low' if r['isLowScore']=='YES' else ''}"><td>{esc(r['receivedAt'] or r['submittedAt'])}</td><td>{esc(r['groupCode'])}</td><td>{esc(r['name'])}</td><td>{esc(r['ciudades'])}</td><td><b>{esc(r['satisfaccionGeneral'])}/5</b></td><td>{esc(r['lowScoreReason'])}</td><td>{esc(r['comentarios'])}</td></tr>""" for r in rows)
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nimbus Feedback Dashboard</title><style>body{{margin:0;background:#f5efe7;color:#241b19;font-family:Arial,"Microsoft YaHei",sans-serif}}header{{padding:24px;background:linear-gradient(120deg,#5d0e1a,#971f31);color:white}}header div,main{{max-width:1200px;margin:auto}}h1{{margin:0 0 7px}}header p{{margin:0;color:#efd594}}main{{padding:24px}}.stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}}.stats div{{padding:20px;border-radius:16px;background:#fff;box-shadow:0 7px 24px #66332212}}.stats b{{display:block;font-size:30px;color:#8f1d2c}}.stats span{{color:#766a65}}.stats .alert b{{color:#b42318}}.bar{{display:flex;justify-content:space-between;align-items:center;margin:12px 0}}a,button{{color:#8f1d2c;font-weight:bold}}.table{{overflow:auto;border-radius:16px;background:white;box-shadow:0 7px 24px #66332212}}table{{border-collapse:collapse;width:100%;min-width:1000px}}th,td{{padding:12px;border-bottom:1px solid #eee3d6;text-align:left;vertical-align:top;font-size:13px}}th{{background:#fbf6ee;position:sticky;top:0}}tr.low{{background:#fff0ee}}.status{{font-size:12px;color:#7d706b}}@media(max-width:700px){{.stats{{grid-template-columns:1fr}}main{{padding:14px}}}}</style></head><body><header><div><h1>Nimbus Travel Feedback</h1><p>DuDu-NAS local dashboard</p></div></header><main>{cards}<div class="bar"><span class="status">Last import: {esc(last_import.get('time'))} · New: {esc(last_import.get('inserted'))} · {esc(last_import.get('error'))}</span><a href="/export.csv">Export CSV</a></div><div class="table"><table><thead><tr><th>Time</th><th>Group</th><th>Name</th><th>Cities</th><th>Overall</th><th>Alert reason</th><th>Comments</th></tr></thead><tbody>{table_rows}</tbody></table></div></main></body></html>"""


@app.get("/", response_class=HTMLResponse)
def dashboard(_: str = Depends(auth)) -> HTMLResponse:
    with connect() as con:
        stats = con.execute("SELECT COUNT(*) total, ROUND(AVG(NULLIF(satisfaccionGeneral,0)),2) avg, SUM(CASE WHEN isLowScore='YES' THEN 1 ELSE 0 END) low FROM feedback").fetchone()
        rows = con.execute("SELECT * FROM feedback ORDER BY COALESCE(receivedAt,submittedAt) DESC LIMIT 200").fetchall()
    return HTMLResponse(page(rows, stats))


@app.post("/import")
def manual_import(_: str = Depends(auth)) -> dict[str, Any]:
    return {"ok": True, "inserted": import_csv(), "lastImport": last_import}


@app.get("/export.csv")
def export(_: str = Depends(auth)) -> StreamingResponse:
    with connect() as con:
        rows = con.execute("SELECT * FROM feedback ORDER BY COALESCE(receivedAt,submittedAt) DESC").fetchall()
        headers = [d[0] for d in con.execute("SELECT * FROM feedback LIMIT 0").description]
    def generate():
        import io
        s=io.StringIO(); w=csv.writer(s); w.writerow(headers); yield '\ufeff'+s.getvalue(); s.seek(0); s.truncate(0)
        for row in rows: w.writerow(list(row)); yield s.getvalue(); s.seek(0); s.truncate(0)
    return StreamingResponse(generate(), media_type="text/csv", headers={"Content-Disposition":"attachment; filename=nimbus_feedback_export.csv"})
