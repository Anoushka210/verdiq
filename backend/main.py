import os
import json
import uuid
import time
import sqlite3
import pandas as pd
from scipy import stats
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai
from ledger import register_batch, verify_batch, get_record, hash_data

load_dotenv()

app = FastAPI(title="Verdiq API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

DB_PATH = "verdiq.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS batches (
            batch_id TEXT PRIMARY KEY,
            location TEXT,
            parameter TEXT,
            unit TEXT,
            tx_hash TEXT,
            ledger_timestamp REAL,
            analysis_json TEXT
        )
    """)
    conn.commit()
    conn.close()

init_db()

def detect_anomalies(readings, parameter, location, unit):
    values = [r["value"] for r in readings]
    timestamps = [r["timestamp"] for r in readings]
    
    series = pd.Series(values, dtype=float)
    z_scores = stats.zscore(series)
    q1 = series.quantile(0.25)
    q3 = series.quantile(0.75)
    iqr = q3 - q1
    iqr_lower = q1 - 1.5 * iqr
    iqr_upper = q3 + 1.5 * iqr
    rolling_mean = series.rolling(window=5, min_periods=1).mean()

    anomalies = []
    for i, (val, ts) in enumerate(zip(values, timestamps)):
        z = float(z_scores[i])
        is_anomaly = abs(z) > 2.5 or val < iqr_lower or val > iqr_upper
        if is_anomaly:
            mean_val = float(rolling_mean[i])
            explanation = get_gemini_explanation(
                parameter,
                location,
                val,
                mean_val,
                z,
                float(iqr_lower),
                float(iqr_upper),
            )
            anomalies.append({
                "timestamp": ts,
                "value": val,
                "unit": unit,
                "z_score": round(z, 3),
                "iqr_bounds": {"lower": round(iqr_lower, 2), "upper": round(iqr_upper, 2)},
                "rolling_mean": round(mean_val, 2),
                "explanation": explanation,
            })
    return anomalies


def get_gemini_explanation(parameter, location, value, mean, zscore, lower, upper):
    severity = "severe" if abs(zscore) > 4 else "significant"
    direction = "spike" if value > mean else "drop"
    deviation = round(abs(value - mean), 1)
    
    if parameter.lower() == "pm25":
        pollutant_context = (
            "PM2.5 at this level exceeds WHO's 24-hour guideline of 15 µg/m³ by a substantial margin "
            "and falls in the 'Hazardous' category on the AQI scale."
        )
    elif parameter.lower() == "pm10":
        pollutant_context = (
            "PM10 at this level exceeds WHO's 24-hour guideline of 45 µg/m³ "
            "and may indicate dust storms, construction activity, or industrial emissions."
        )
    elif parameter.lower() == "no2":
        pollutant_context = (
            "NO2 at this level suggests heavy traffic emissions or industrial activity nearby."
        )
    else:
        pollutant_context = (
            f"This {parameter} reading warrants investigation against local environmental standards."
        )

    return (
        f"This reading of {value} µg/m³ represents a {severity} {direction} of {deviation} µg/m³ "
        f"above the local rolling mean of {mean} µg/m³, with a z-score of {zscore} — "
        f"statistically unusual at {abs(zscore):.1f} standard deviations from expected values. "
        f"The IQR-based bounds for this batch are {lower}–{upper} µg/m³, placing this reading "
        f"well outside the normal range. {pollutant_context} "
        f"This anomaly at {location} warrants investigation to determine whether it reflects "
        f"a genuine pollution event, sensor malfunction, or data transmission error."
    )

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post("/api/batches")
async def upload_batch(file: UploadFile = File(...)):
    raw_bytes = await file.read()
    
    try:
        data = json.loads(raw_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    
    batch_id = data.get("batch_id", str(uuid.uuid4()))
    location = data.get("location", "Unknown")
    parameter = data.get("parameter", "unknown")
    unit = data.get("unit", "")
    readings = data.get("readings", [])

    if not readings:
        raise HTTPException(status_code=400, detail="No readings found in batch")

    data_hash = hash_data(raw_bytes)
    
    try:
        ledger_record = register_batch(batch_id, data_hash)
    except ValueError:
        ledger_record = get_record(batch_id)

    anomalies = detect_anomalies(readings, parameter, location, unit)

    analysis = {
        "batch_id": batch_id,
        "location": location,
        "parameter": parameter,
        "unit": unit,
        "total_readings": len(readings),
        "anomaly_count": len(anomalies),
        "data_hash": data_hash,
        "tx_hash": ledger_record["tx_hash"],
        "ledger_timestamp": ledger_record["timestamp"],
        "anomalies": anomalies
    }

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        INSERT OR IGNORE INTO batches (batch_id, location, parameter, unit, tx_hash, ledger_timestamp, analysis_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (batch_id, location, parameter, unit,
          ledger_record["tx_hash"], ledger_record["timestamp"],
          json.dumps(analysis)))
    conn.commit()
    conn.close()

    return analysis

@app.get("/api/batches/{batch_id}")
def get_batch(batch_id: str):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT analysis_json FROM batches WHERE batch_id = ?", (batch_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Batch not found")
    return json.loads(row[0])

@app.post("/api/batches/{batch_id}/verify")
async def verify_batch_endpoint(batch_id: str, file: UploadFile = File(...)):
    raw_bytes = await file.read()
    submitted_hash = hash_data(raw_bytes)
    result = verify_batch(batch_id, submitted_hash)
    return result