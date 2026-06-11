"""Fetch Alberta 511 alerts and normalize them for the API.

This is a minimal, resilient client that maps the external feed into a
small JSON shape used by the frontend. It intentionally tolerates a few
different key names returned by the upstream API to avoid brittle
parsing.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

import requests


DEFAULT_API = os.environ.get("WEATHER_API_URL") or "https://511.alberta.ca/api/v2/get/alerts"


def _boolish(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in ("1", "true", "yes")


def fetch_alerts(api_url: str | None = None, timeout: int = 10) -> List[Dict[str, Any]]:
    """Call the Alberta 511 alerts endpoint and return a normalized list.

    Returns list of objects with at least: id, title, message, send_notification.
    """
    url = api_url or DEFAULT_API
    try:
        res = requests.get(url, timeout=timeout)
        res.raise_for_status()
    except Exception:
        return []

    data = None
    try:
        data = res.json()
    except Exception:
        return []

    # Try common shapes: a list, or dict with 'Alerts' / 'alerts' / 'Items' keys.
    candidates = []
    if isinstance(data, list):
        candidates = data
    elif isinstance(data, dict):
        for k in ("Alerts", "alerts", "items", "Items", "results"):
            if k in data and isinstance(data[k], list):
                candidates = data[k]
                break
        # if no key matched, maybe a single object with alert properties
        if not candidates:
            # try to detect a single-alert dict
            if any(k.lower() in ("id", "title", "message") for k in data.keys()):
                candidates = [data]

    out: List[Dict[str, Any]] = []
    for a in candidates:
        if not isinstance(a, dict):
            continue
        # Best-effort extraction of fields from various key names.
        aid = a.get("AlertID") or a.get("id") or a.get("ID") or a.get("alert_id") or a.get("Alert_Id") or str(a.get("id") or "")
        title = a.get("Title") or a.get("title") or a.get("AlertTitle") or a.get("alert_title") or a.get("ShortDescription") or "Alert"
        # message / description fields
        message = a.get("Message") or a.get("message") or a.get("Description") or a.get("description") or a.get("LongDescription") or a.get("long_description") or ""
        # Some feeds include a boolean flag for notifications
        send_flag = a.get("SendNotification") if "SendNotification" in a else a.get("send_notification") if "send_notification" in a else a.get("sendNotify") if "sendNotify" in a else a.get("send") if "send" in a else None
        send_notification = _boolish(send_flag)

        # regions / areas
        regions = []
        for k in ("Regions", "regions", "Areas", "areas", "AffectedAreas", "affected_areas"):
            v = a.get(k)
            if isinstance(v, list):
                regions = [str(x) for x in v]
                break
            if isinstance(v, str) and v.strip():
                regions = [v.strip()]
                break

        published = a.get("Published") or a.get("published") or a.get("StartDate") or a.get("start") or None

        out.append({
            "id": str(aid),
            "title": str(title),
            "message": str(message),
            "send_notification": bool(send_notification),
            "regions": regions,
            "published_at": published,
            "raw": a,
        })

    return out
