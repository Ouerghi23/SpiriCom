# src/api/notification_service.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — Customer Notification Service
# 100% FREE — No credit card, no paid tier
#
# TWO CHANNELS (both free):
#
#  CHANNEL 1: ntfy.sh (Push notifications — recommended for demo)
#    ✅ Completely free, no account needed
#    ✅ Works on Android + iOS (ntfy app, free)
#    ✅ No phone number required — topic-based
#    ✅ Instant push delivery
#    Setup: customer installs ntfy app → subscribes to topic "spiricom_{msisdn}"
#
#  CHANNEL 2: CallMeBot WhatsApp (real WhatsApp messages — optional)
#    ✅ Completely free, no Twilio credit needed
#    ✅ Real WhatsApp messages on customer's phone
#    ✅ Setup: customer sends ONE activation message to +34 644 82 49 12
#             "I allow callmebot to send me messages"
#             They receive their personal apikey by return WhatsApp
#    ⚠️  Requires customer to activate once
#    Reference: https://www.callmebot.com/blog/free-api-whatsapp-messages/
#
# FastAPI endpoint: POST /api/nlp/notify
# Called by NLPAnalysis.jsx sendStatusNotification() on every status update
# ─────────────────────────────────────────────────────────────────────

import os
import httpx
import asyncio
import logging
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nlp", tags=["notifications"])

# ── Configuration (set in .env) ───────────────────────────────────────
# NTFY_BASE_URL:      https://ntfy.sh   (or self-hosted)
# NTFY_TOPIC_PREFIX:  spiricom          (topic = spiricom_{msisdn})
# CALLMEBOT_APIKEY_MAP: JSON map of msisdn→apikey (optional)
#   e.g. '{"21600000001": "1234567", "21699999999": "7654321"}'

NTFY_BASE_URL      = os.getenv("NTFY_BASE_URL",      "https://ntfy.sh")
NTFY_TOPIC_PREFIX  = os.getenv("NTFY_TOPIC_PREFIX",  "spiricom")
# Optional: JSON string mapping msisdn → callmebot apikey
# Load from env or a simple JSON file
import json
_raw = os.getenv("CALLMEBOT_APIKEY_MAP", "{}")
try:
    CALLMEBOT_APIKEY_MAP: dict = json.loads(_raw)
except Exception:
    CALLMEBOT_APIKEY_MAP = {}


# ── Message templates ─────────────────────────────────────────────────
STATUS_MESSAGES = {
    "in_progress": {
        "title":   "📋 Your complaint is being processed",
        "body":    "Our NOC team has started working on your complaint {complaint_id} ({category}). You will be notified once it is resolved.",
        "title_ar": "📋 جاري معالجة شكواك",
        "body_ar":  "بدأ فريق NOC لدينا في العمل على شكواك {complaint_id} ({category}). سيتم إعلامك عند الحل.",
        "title_fr": "📋 Votre réclamation est en cours de traitement",
        "body_fr":  "Notre équipe NOC a commencé à traiter votre réclamation {complaint_id} ({category}). Vous serez notifié dès la résolution.",
        "emoji":   "⏳",
        "priority": "default",
        "tags":    ["construction", "spiricom"],
    },
    "resolved": {
        "title":   "✅ Your complaint has been resolved",
        "body":    "Your complaint {complaint_id} ({category}) has been successfully resolved by the NOC team. Thank you for your patience.",
        "title_ar": "✅ تم حل شكواك",
        "body_ar":  "تم حل شكواك {complaint_id} ({category}) بنجاح من قبل فريق NOC. شكراً على صبرك.",
        "title_fr": "✅ Votre réclamation a été résolue",
        "body_fr":  "Votre réclamation {complaint_id} ({category}) a été résolue avec succès par l'équipe NOC. Merci pour votre patience.",
        "emoji":   "✅",
        "priority": "high",
        "tags":    ["white_check_mark", "spiricom"],
    },
}


# ── Request model ─────────────────────────────────────────────────────
class NotifyRequest(BaseModel):
    complaint_id: str
    status:       str                   # "in_progress" | "resolved"
    msisdn:       Optional[str] = None  # customer phone number
    category:     Optional[str] = None  # complaint category


# ── ntfy.sh push notification ─────────────────────────────────────────
async def send_ntfy(complaint_id: str, status: str, msisdn: Optional[str], category: str):
    """
    Send a push notification via ntfy.sh.

    Customer setup (one-time):
      1. Install ntfy app (Android: Play Store, iOS: App Store) — FREE
      2. Subscribe to topic: spiricom_{their_msisdn_without_+}
         e.g.  spiricom_21612345678
      3. Done — they receive push notifications instantly

    NOC engineer setup: nothing — just run this code
    """
    if not msisdn:
        logger.info("ntfy: no msisdn, skipping push notification")
        return

    msg     = STATUS_MESSAGES.get(status)
    if not msg:
        return

    # Sanitise msisdn for use as topic (remove +, spaces)
    clean_msisdn = msisdn.replace("+", "").replace(" ", "").replace("-", "")
    topic        = f"{NTFY_TOPIC_PREFIX}_{clean_msisdn}"
    cat          = category or "network"

    title = msg["title"]
    body  = msg["body"].format(complaint_id=complaint_id, category=cat)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{NTFY_BASE_URL}/{topic}",
                headers={
                    "Title":    title,
                    "Priority": msg["priority"],
                    "Tags":     ",".join(msg["tags"]),
                    "Content-Type": "text/plain",
                },
                content=body.encode("utf-8"),
            )
        if resp.status_code == 200:
            logger.info(f"ntfy push sent → topic={topic}, status={status}")
        else:
            logger.warning(f"ntfy returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.error(f"ntfy push failed: {e}")


# ── CallMeBot WhatsApp notification ───────────────────────────────────
async def send_whatsapp(complaint_id: str, status: str, msisdn: Optional[str], category: str):
    """
    Send a WhatsApp message via CallMeBot API — COMPLETELY FREE.

    Customer setup (one-time, ~30 seconds):
      1. Add +34 644 82 49 12 to phone contacts as "CallMeBot"
      2. Send this exact WhatsApp message to that number:
            I allow callmebot to send me messages
      3. Receive apikey by return WhatsApp message
      4. Give NOC team the apikey (or submit via complaint form)

    NOC team: store apikey in CALLMEBOT_APIKEY_MAP env variable
    Reference: https://www.callmebot.com/blog/free-api-whatsapp-messages/
    """
    if not msisdn:
        return

    clean_msisdn = msisdn.replace(" ", "").replace("-", "")
    # Look up this customer's CallMeBot apikey
    apikey = CALLMEBOT_APIKEY_MAP.get(clean_msisdn) or CALLMEBOT_APIKEY_MAP.get(msisdn)
    if not apikey:
        logger.debug(f"WhatsApp: no CallMeBot apikey for {clean_msisdn}, skipping")
        return

    msg  = STATUS_MESSAGES.get(status)
    if not msg:
        return

    cat  = category or "network"
    text = f"{msg['emoji']} SpiriCom NOC\n\n{msg['body'].format(complaint_id=complaint_id, category=cat)}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.callmebot.com/whatsapp.php",
                params={
                    "phone":  clean_msisdn,
                    "text":   text,
                    "apikey": apikey,
                },
            )
        if "Message queued" in resp.text or resp.status_code == 200:
            logger.info(f"WhatsApp sent → {clean_msisdn}, status={status}")
        else:
            logger.warning(f"CallMeBot response: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")


# ── FastAPI endpoint ──────────────────────────────────────────────────
@router.post("/notify")
async def notify_customer(req: NotifyRequest, background_tasks: BackgroundTasks):
    """
    POST /api/nlp/notify
    Called by NLPAnalysis.jsx whenever a NOC engineer updates a complaint status.

    Sends notifications in the background (non-blocking) via:
      1. ntfy.sh push notification (always attempted)
      2. CallMeBot WhatsApp (only if apikey registered for msisdn)

    Both channels are 100% free — no paid tier, no credit card.
    Returns immediately; delivery happens in background.
    """
    if req.status not in ("in_progress", "resolved"):
        return {"ok": False, "reason": "status not notifiable"}

    # Fire both notification channels as background tasks
    # Background tasks run after the response is sent — client gets instant 200
    background_tasks.add_task(
        send_ntfy,
        req.complaint_id, req.status, req.msisdn, req.category or "network"
    )
    background_tasks.add_task(
        send_whatsapp,
        req.complaint_id, req.status, req.msisdn, req.category or "network"
    )

    logger.info(f"Notification queued: {req.complaint_id} → {req.status} (msisdn={req.msisdn})")
    return {
        "ok":      True,
        "queued":  ["ntfy", "whatsapp"],
        "status":  req.status,
        "id":      req.complaint_id,
    }