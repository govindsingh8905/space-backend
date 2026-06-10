"""
backend/main.py
─────────────────────────────────────────────────────────────────────────────
FastAPI orbital debris backend.

Endpoints:
  GET  /health                 → system health check
  GET  /api/tle/fetch          → pull latest TLE data from Space-Track.org
  GET  /api/debris             → full debris field (Cartesian ECI, threat)
  POST /api/simulate           → run 72h forward propagation
  POST /api/conjunctions       → compute conjunction events for a target sat
  POST /api/maneuver/recommend → ML maneuver recommendation
  WS   /ws/debris              → real-time position streaming

Install:
  pip install fastapi uvicorn sgp4 httpx websockets python-dotenv numpy

Run:
  uvicorn main:app --reload --port 8000
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sgp4.api import Satrec, jday

load_dotenv()

# ─── Configuration ────────────────────────────────────────────────────────
SPACETRACK_USER     = os.getenv("SPACETRACK_USER", "")
SPACETRACK_PASSWORD = os.getenv("SPACETRACK_PASS", "")
SPACETRACK_BASE     = "https://www.space-track.org"
EARTH_RADIUS_KM     = 6371.0
MU                  = 398600.4418          # km³/s²

app = FastAPI(title="NEXUS Orbital Debris API", version="2.4.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-domain.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.on_event("startup")
async def startup_event():
    try:
        await fetch_tle(limit=500)
    except Exception:
        pass


# ─── Data Models ─────────────────────────────────────────────────────────

@dataclass
class OrbitalState:
    norad_id: int
    name: str
    x: float          # ECI km
    y: float
    z: float
    vx: float         # km/s
    vy: float
    vz: float
    altitude: float
    threat_level: str
    conjunction_probability: float
    epoch: str


@dataclass
class ConjunctionEvent:
    id: str
    debris_norad: int
    debris_name: str
    target_norad: int
    target_name: str
    tca: str                    # ISO
    miss_distance_km: float
    collision_probability: float
    relative_velocity_kms: float


@dataclass
class ManeuverRecommendation:
    burn_type: str              # prograde | retrograde | radial | normal
    delta_v_ms: float           # m/s
    burn_duration_s: float
    execution_window: str       # ISO
    risk_reduction_pct: float
    post_maneuver_probability: float


# Pydantic request/response models
class SimulateRequest(BaseModel):
    hours_ahead: float = 72.0
    target_norad: int = 25544

class ConjunctionRequest(BaseModel):
    target_norad: int = 25544
    threshold_km: float = 10.0
    hours_ahead: float = 72.0

class ManeuverRequest(BaseModel):
    conjunction_id: str
    debris_norad: int
    target_norad: int
    tca_iso: str
    miss_distance_km: float
    collision_probability: float


# ─── In-memory TLE cache ──────────────────────────────────────────────────

_tle_cache: dict[int, tuple[str, str, str]] = {}  # norad_id → (name, line1, line2)
_cache_time: float = 0.0
CACHE_TTL_SECONDS = 3600  # refresh every hour

def _cache_is_stale() -> bool:
    return time.time() - _cache_time > CACHE_TTL_SECONDS


def generate_mock_tles(limit: int = 500) -> list[tuple[str, str, str]]:
    import random
    tles = []
    
    # Target satellite: ISS (NORAD 25544)
    tles.append((
        "ISS (ZARYA)",
        "1 25544U 98067A   26159.50764120  .00014309  00000-0  25313-3 0  9997",
        "2 25544  51.6416 120.3920 0004817  44.7502  41.9701 15.49830843571212"
    ))
    
    debris_categories = [
        {"alt_min": 400, "alt_max": 600, "inc_min": 50, "inc_max": 98, "weight": 0.25, "name": "COSMOS"},
        {"alt_min": 750, "alt_max": 810, "inc_min": 84, "inc_max": 88, "weight": 0.12, "name": "IRIDIUM DEB"},
        {"alt_min": 790, "alt_max": 860, "inc_min": 96, "inc_max": 100, "weight": 0.20, "name": "FENGYUN"},
        {"alt_min": 375, "alt_max": 425, "inc_min": 50, "inc_max": 53, "weight": 0.10, "name": "FRAG"},
        {"alt_min": 550, "alt_max": 700, "inc_min": 28, "inc_max": 110, "weight": 0.33, "name": "DEBRIS"}
    ]
    
    for i in range(1, limit):
        norad_id = 10000 + i
        rand = random.random()
        cum_weight = 0
        cat = debris_categories[4]
        for c in debris_categories:
            cum_weight += c["weight"]
            if rand < cum_weight:
                cat = c
                break
                
        alt = random.uniform(cat["alt_min"], cat["alt_max"])
        inc = random.uniform(cat["inc_min"], cat["inc_max"])
        raan = random.uniform(0, 360)
        
        r = EARTH_RADIUS_KM + alt
        T = 2 * math.pi * math.sqrt(r**3 / MU)
        mean_motion = 86400.0 / T
        
        l1 = f"1 {norad_id:05d}U 98067A   23001.00000000  .00010000  00000-0  10000-3 0  9993"
        ecc_str = "0005000"
        l2 = f"2 {norad_id:05d} {inc:8.4f} {raan:8.4f} {ecc_str} {random.uniform(0,360):8.4f} {random.uniform(0,360):8.4f} {mean_motion:11.8f}123457"
        
        name = f"{cat['name']} {i:04d}"
        tles.append((name, l1, l2))
        
    return tles


# ─── Space-Track.org client ───────────────────────────────────────────────

async def fetch_tle_from_spacetrack(
    limit: int = 500,
    category: str = "DEBRIS"
) -> list[tuple[str, str, str]]:
    """
    Authenticate with Space-Track.org and download TLE sets.
    Returns list of (name, line1, line2) tuples.
    """
    if not SPACETRACK_USER:
        raise HTTPException(400, "SPACETRACK_USER env var not set")

    async with httpx.AsyncClient(timeout=30) as client:
        # Login
        login_resp = await client.post(
            f"{SPACETRACK_BASE}/ajaxauth/login",
            data={"identity": SPACETRACK_USER, "password": SPACETRACK_PASSWORD},
        )
        if login_resp.status_code != 200:
            raise HTTPException(502, "Space-Track login failed")

        # Query LEO debris TLEs
        url = (
            f"{SPACETRACK_BASE}/basicspacedata/query"
            f"/class/tle_latest/OBJECT_TYPE/{category}"
            f"/PERIOD/0--128"           # LEO: period < 128 min
            f"/orderby/NORAD_CAT_ID/limit/{limit}/format/3le"
        )
        data_resp = await client.get(url)
        if data_resp.status_code != 200:
            raise HTTPException(502, "Failed to fetch TLE data")

        lines = [l.strip() for l in data_resp.text.splitlines() if l.strip()]
        result: list[tuple[str, str, str]] = []
        for i in range(0, len(lines) - 2, 3):
            if lines[i + 1].startswith("1 ") and lines[i + 2].startswith("2 "):
                result.append((lines[i], lines[i + 1], lines[i + 2]))
        return result


def _jday_now(dt: datetime | None = None) -> tuple[float, float]:
    """Return (jd, fr) for sgp4."""
    if dt is None:
        dt = datetime.now(timezone.utc)
    jd, fr = jday(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second + dt.microsecond / 1e6)
    return jd, fr


def propagate_tle(name: str, line1: str, line2: str, dt: datetime | None = None) -> OrbitalState | None:
    """
    Propagate a single TLE to time dt using sgp4.
    Returns OrbitalState or None on error.
    """
    try:
        sat = Satrec.twoline2rv(line1, line2)
        jd, fr = _jday_now(dt)
        e, r, v = sat.sgp4(jd, fr)  # e=0 means success
        if e != 0:
            return None

        x, y, z   = r  # ECI km
        vx, vy, vz = v  # km/s

        alt = math.sqrt(x**2 + y**2 + z**2) - EARTH_RADIUS_KM

        # Simple threat heuristic based on altitude proximity to ISS (408 km)
        iss_alt = 408.0
        alt_diff = abs(alt - iss_alt)
        if alt_diff < 20 and alt > 350:
            threat = "critical"; conj_prob = 0.15 + 0.7 * (1 - alt_diff / 20)
        elif alt_diff < 60 and alt > 350:
            threat = "warning";  conj_prob = 0.02 + 0.1 * (1 - alt_diff / 60)
        else:
            threat = "safe";     conj_prob = 0.001 + 0.02 * max(0, 1 - alt_diff / 200)

        norad_id = int(line1[2:7])
        return OrbitalState(
            norad_id=norad_id, name=name.strip(),
            x=round(x, 3), y=round(y, 3), z=round(z, 3),
            vx=round(vx, 5), vy=round(vy, 5), vz=round(vz, 5),
            altitude=round(alt, 2),
            threat_level=threat,
            conjunction_probability=round(conj_prob, 5),
            epoch=dt.isoformat() if dt else datetime.now(timezone.utc).isoformat(),
        )
    except Exception:
        return None


# ─── Mock ML prediction engine ────────────────────────────────────────────

def ml_conjunction_probability(
    miss_km: float,
    rel_vel_kms: float,
    combined_rcs: float = 1.0,
) -> float:
    """
    Simplified Chan formula approximation for collision probability.
    In production: replace with a trained PyTorch/TensorFlow model.
    """
    sigma = 0.2 * max(miss_km, 0.01)    # combined hard-body radius + uncertainty
    prob  = math.exp(-(miss_km ** 2) / (2 * sigma ** 2))
    prob *= min(1.0, rel_vel_kms / 15.0)  # higher vel = higher energy
    return round(min(prob, 0.9999), 6)


def ml_maneuver_recommendation(req: ManeuverRequest) -> ManeuverRecommendation:
    """
    Mock ML model for maneuver planning.
    In production: call a PyTorch model served via TorchServe / Triton.

    Strategy: retrograde burn reduces altitude → debris passes overhead.
    """
    tca = datetime.fromisoformat(req.tca_iso.replace("Z", "+00:00"))
    exec_time = tca - timedelta(hours=max(1.5, req.miss_distance_km * 0.3))

    # Simple delta-V calc (vis-viva perturbation)
    current_alt_km = 408.0   # assume ISS altitude
    r = EARTH_RADIUS_KM + current_alt_km
    v_circ = math.sqrt(MU / r)                # circular velocity

    # 0.5 km miss → ~0.3 m/s ΔV; 0.05 km miss → ~3 m/s ΔV (rough)
    delta_v_ms = max(0.3, 3.0 / max(req.miss_distance_km, 0.05)) * 1.5
    burn_s      = delta_v_ms / 0.35   # specific impulse ~0.35 m/s² for typical thruster

    post_prob = req.collision_probability * 0.001   # ~99.9% risk reduction

    return ManeuverRecommendation(
        burn_type="retrograde",
        delta_v_ms=round(delta_v_ms, 3),
        burn_duration_s=round(burn_s, 2),
        execution_window=exec_time.isoformat(),
        risk_reduction_pct=round((1 - post_prob / max(req.collision_probability, 1e-9)) * 100, 2),
        post_maneuver_probability=round(post_prob, 8),
    )


# ─── Conjunction detector ─────────────────────────────────────────────────

def detect_conjunctions(
    target_tle: tuple[str, str, str],
    debris_tles: list[tuple[str, str, str]],
    hours: float = 72,
    threshold_km: float = 10.0,
    time_steps: int = 864,    # 5-min intervals over 72h
) -> list[ConjunctionEvent]:
    """
    Brute-force conjunction search over the prediction window.
    Production implementation: use CARA's Monte-Carlo or SOCRATES API.
    """
    events: list[ConjunctionEvent] = []
    t_name, t_l1, t_l2 = target_tle
    target_sat = Satrec.twoline2rv(t_l1, t_l2)
    target_norad = int(t_l1[2:7])

    step_s = (hours * 3600) / time_steps
    now    = datetime.now(timezone.utc)

    for d_name, d_l1, d_l2 in debris_tles[:300]:  # limit for demo
        try:
            debris_sat = Satrec.twoline2rv(d_l1, d_l2)
            debris_norad = int(d_l1[2:7])
            if debris_norad == target_norad:
                continue

            min_dist = float("inf")
            min_dt: datetime | None = None
            min_rv: float = 0.0

            for step in range(time_steps):
                dt = now + timedelta(seconds=step * step_s)
                jd, fr = _jday_now(dt)

                et, tr, tv = target_sat.sgp4(jd, fr)
                ed, dr, dv = debris_sat.sgp4(jd, fr)
                if et != 0 or ed != 0:
                    continue

                # Euclidean miss distance
                dx = tr[0] - dr[0]; dy = tr[1] - dr[1]; dz = tr[2] - dr[2]
                dist = math.sqrt(dx**2 + dy**2 + dz**2)

                if dist < min_dist:
                    min_dist = dist
                    min_dt   = dt
                    # Relative velocity magnitude
                    rvx = tv[0]-dv[0]; rvy = tv[1]-dv[1]; rvz = tv[2]-dv[2]
                    min_rv = math.sqrt(rvx**2 + rvy**2 + rvz**2)

            if min_dist < threshold_km and min_dt:
                prob = ml_conjunction_probability(min_dist, min_rv)
                events.append(ConjunctionEvent(
                    id=f"conj-{target_norad}-{debris_norad}",
                    debris_norad=debris_norad,
                    debris_name=d_name.strip(),
                    target_norad=target_norad,
                    target_name=t_name.strip(),
                    tca=min_dt.isoformat(),
                    miss_distance_km=round(min_dist, 4),
                    collision_probability=prob,
                    relative_velocity_kms=round(min_rv, 4),
                ))
        except Exception:
            continue

    return sorted(events, key=lambda e: e.collision_probability, reverse=True)


# ─── REST Endpoints ───────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "NEXUS Orbital Debris API is running.",
        "docs": "/docs",
        "endpoints": {
            "health": "/health",
            "tle_fetch": "/api/tle/fetch",
            "debris": "/api/debris",
            "simulate": "/api/simulate",
            "conjunctions": "/api/conjunctions",
            "maneuver_recommend": "/api/maneuver/recommend"
        }
    }


@app.get("/health")
async def health():
    return {
        "status": "nominal",
        "version": "2.4.1",
        "tle_cache_size": len(_tle_cache),
        "cache_age_s": round(time.time() - _cache_time),
    }


@app.get("/api/tle/fetch")
async def fetch_tle(limit: int = Query(500, le=2000)):
    """Pull and cache TLE data from Space-Track.org."""
    global _cache_time

    if _cache_is_stale() or not _tle_cache:
        try:
            tles = await fetch_tle_from_spacetrack(limit=limit)
            source = "spacetrack"
        except Exception:
            tles = generate_mock_tles(limit=limit)
            source = "mock_fallback"
            
        _tle_cache.clear()
        for name, l1, l2 in tles:
            norad = int(l1[2:7])
            _tle_cache[norad] = (name, l1, l2)
        _cache_time = time.time()

    return {
        "count": len(_tle_cache),
        "cached_at": datetime.fromtimestamp(_cache_time, tz=timezone.utc).isoformat(),
        "source": source if 'source' in locals() else "cache",
    }


@app.get("/api/debris")
async def get_debris(limit: int = Query(2700, le=5000)):
    """Return full debris field propagated to current time."""
    if not _tle_cache:
        # Use mock data if no TLEs loaded
        return {"objects": [], "source": "cache_empty", "count": 0}

    now = datetime.now(timezone.utc)
    results = []
    for norad_id, (name, l1, l2) in list(_tle_cache.items())[:limit]:
        state = propagate_tle(name, l1, l2, now)
        if state:
            results.append(asdict(state))

    return {"objects": results, "count": len(results), "epoch": now.isoformat()}


@app.post("/api/simulate")
async def simulate(req: SimulateRequest):
    """Project entire debris field N hours into the future."""
    if not _tle_cache:
        raise HTTPException(400, "TLE cache empty — call /api/tle/fetch first")

    future_dt = datetime.now(timezone.utc) + timedelta(hours=req.hours_ahead)
    results = []
    for norad_id, (name, l1, l2) in list(_tle_cache.items())[:2700]:
        state = propagate_tle(name, l1, l2, future_dt)
        if state:
            results.append(asdict(state))

    return {
        "objects": results,
        "count": len(results),
        "hours_ahead": req.hours_ahead,
        "simulation_epoch": future_dt.isoformat(),
    }


@app.post("/api/conjunctions")
async def compute_conjunctions(req: ConjunctionRequest):
    """Run 72-hour conjunction analysis for a target satellite."""
    if not _tle_cache:
        raise HTTPException(400, "TLE cache empty")

    target_norad = req.target_norad
    if target_norad not in _tle_cache:
        raise HTTPException(404, f"NORAD {target_norad} not in cache")

    target_tle  = _tle_cache[target_norad]
    debris_tles = [v for k, v in _tle_cache.items() if k != target_norad]

    events = await asyncio.get_event_loop().run_in_executor(
        None,
        detect_conjunctions,
        target_tle, debris_tles, req.hours_ahead, req.threshold_km,
    )

    return {
        "target_norad": target_norad,
        "conjunction_count": len(events),
        "events": [asdict(e) for e in events],
        "window_hours": req.hours_ahead,
    }


@app.post("/api/maneuver/recommend")
async def recommend_maneuver(req: ManeuverRequest):
    """ML-powered maneuver recommendation for a conjunction event."""
    maneuver = ml_maneuver_recommendation(req)
    return asdict(maneuver)


# ─── WebSocket — Real-time streaming ─────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws) if hasattr(self.active, 'discard') else None
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, data: dict):
        disconnected = []
        for ws in self.active:
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            self.disconnect(ws)


manager = ConnectionManager()


@app.websocket("/ws/debris")
async def websocket_debris(websocket: WebSocket):
    """
    Real-time debris position streaming.

    Messages from client:
      { "type": "fast_forward", "hours": 24, "speed": 72 }
      { "type": "pong" }

    Messages to client:
      { "type": "debris_update", "payload": [{id, x, y, z}, ...] }
      { "type": "full_refresh",  "payload": [OrbitalState, ...] }
      { "type": "ping" }
    """
    await manager.connect(websocket)
    sim_time_offset_hours = 0.0
    update_interval = 2.0   # seconds between position broadcasts

    try:
        while True:
            # Check for incoming messages (non-blocking)
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=0.1)
                if msg.get("type") == "fast_forward":
                    sim_time_offset_hours = msg.get("hours", 0)
                    update_interval = max(0.1, 2.0 / msg.get("speed", 1))
            except asyncio.TimeoutError:
                pass

            # Propagate and stream positions
            if _tle_cache:
                sim_dt = datetime.now(timezone.utc) + timedelta(hours=sim_time_offset_hours)
                updates = []
                for norad_id, (name, l1, l2) in list(_tle_cache.items())[:2700]:
                    state = propagate_tle(name, l1, l2, sim_dt)
                    if state:
                        updates.append({
                            "id":    f"debris-{norad_id}",
                            "x":     state.x,
                            "y":     state.y,
                            "z":     state.z,
                            "threat": state.threat_level,
                        })
                await websocket.send_json({"type": "debris_update", "payload": updates})
            else:
                # Ping to keep connection alive while cache is empty
                await websocket.send_json({"type": "ping"})

            await asyncio.sleep(update_interval)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
