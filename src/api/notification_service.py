# src/api/notification_service.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom NOC — Customer Notification Service (v2)
# Channels: ntfy.sh push (free, topic-based) + CallMeBot WhatsApp (free,
# per-customer opt-in apikey).
#
# FIXES vs previous version
# ─────────────────────────
#  NS-1  REAL BUG (every push failed): notification titles containing
#        emoji were sent as the HTTP "Title" header. HTTP headers must
#        be latin-1 encodable, so httpx raised UnicodeEncodeError on
#        every send. Switched to ntfy's JSON publish format (POST to
#        the base URL with a JSON body), which is fully UTF-8 — this
#        is also what makes the Arabic templates deliverable at all.
#  NS-2  REAL BUG (localization dead code): STATUS_MESSAGES defined
#        title_ar/body_ar/title_fr/body_fr but the code only ever sent
#        the English strings. NotifyRequest now accepts `language`
#        ("en" | "fr" | "ar", default "fr" — Tunisian customer base)
#        and the localized template is selected with English fallback.
#        FLAG: NLPAnalysis.jsx sendStatusNotification() should pass
#        the complaint's language field in the POST body.
#  NS-3  PRIVACY: topics were spiricom_{msisdn} on the PUBLIC ntfy.sh
#        server — anyone who knows (or enumerates) a phone number can
#        subscribe and read that customer's complaint notifications.
#        If NTFY_TOPIC_SECRET is set, topics become an HMAC of the
#        msisdn (unguessable); a helper endpoint returns the topic so
#        the complaint portal can display it to the customer. Without
#        the secret it falls back to the plain topic (demo mode) and
#        logs a warning once.
#  NS-4  REAL BUG (false success): CallMeBot returns HTTP 200 even for
#        errors like "APIKey is invalid", and the old check was
#        `"Message queued" in text OR status == 200`, so failures were
#        logged as sent. Now requires 200 AND a success marker.
#  NS-5  Emoji removed from message titles/bodies and the WhatsApp
#        prefix, per project convention (ntfy `tags` stay — they are
#        ASCII tag names and ntfy's native metadata mechanism).
#  NS-6  ntfy JSON priority must be an integer (1-5); mapped from the
#        old string names. Unused asyncio import dropped; json import
#        moved to the top.
#  NS-7  The endpoint validates status against STATUS_MESSAGES keys
#        (single source of truth) instead of a hardcoded tuple.
# ─────────────────────────────────────────────────────────────────────

import os
import json
import hmac
import hashlib
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nlp", tags=["notifications"])

# ── Configuration (set in .env) ───────────────────────────────────────
# NTFY_BASE_URL:       https://ntfy.sh   (or self-hosted)
# NTFY_TOPIC_PREFIX:   spiricom
# NTFY_TOPIC_SECRET:   random string → HMAC topics (NS-3). RECOMMENDED.
# CALLMEBOT_APIKEY_MAP JSON map msisdn→apikey, e.g.
#   '{"21600000001": "1234567"}'

NTFY_BASE_URL     = os.getenv("NTFY_BASE_URL", "https://ntfy.sh").rstrip("/")
NTFY_TOPIC_PREFIX = os.getenv("NTFY_TOPIC_PREFIX", "spiricom")
NTFY_TOPIC_SECRET = os.getenv("NTFY_TOPIC_SECRET", "")

try:
    CALLMEBOT_APIKEY_MAP: dict = json.loads(os.getenv("CALLMEBOT_APIKEY_MAP", "{}"))
except Exception:
    logger.warning("CALLMEBOT_APIKEY_MAP is not valid JSON — WhatsApp disabled")
    CALLMEBOT_APIKEY_MAP = {}

_warned_plain_topic = False

# NS-6: ntfy JSON publishing wants integer priorities (1=min … 5=max)
NTFY_PRIORITY = {"default": 3, "high": 4}

# ── Message templates — NS-5: no emoji in customer copy ───────────────
STATUS_MESSAGES = {
    "in_progress": {
        "title":    "Your complaint is being processed",
        "body":     "Our NOC team has started working on your complaint {complaint_id} ({category}). You will be notified once it is resolved.",
        "title_fr": "Votre réclamation est en cours de traitement",
        "body_fr":  "Notre équipe NOC a commencé à traiter votre réclamation {complaint_id} ({category}). Vous serez notifié dès la résolution.",
        "title_ar": "جاري معالجة شكواك",
        "body_ar":  "بدأ فريق NOC لدينا في العمل على شكواك {complaint_id} ({category}). سيتم إعلامك عند الحل.",
        "priority": "default",
        "tags":     ["construction", "spiricom"],
    },
    "resolved": {
        "title":    "Your complaint has been resolved",
        "body":     "Your complaint {complaint_id} ({category}) has been successfully resolved by the NOC team. Thank you for your patience.",
        "title_fr": "Votre réclamation a été résolue",
        "body_fr":  "Votre réclamation {complaint_id} ({category}) a été résolue avec succès par l'équipe NOC. Merci pour votre patience.",
        "title_ar": "تم حل شكواك",
        "body_ar":  "تم حل شكواك {complaint_id} ({category}) بنجاح من قبل فريق NOC. شكراً على صبرك.",
        "priority": "high",
        "tags":     ["white_check_mark", "spiricom"],
    },
}


def pick_template(status: str, language: Optional[str]):
    """NS-2: localized title/body with English fallback."""
    msg = STATUS_MESSAGES.get(status)
    if not msg:
        return None, None, None
    lang = (language or "en").lower()[:2]
    if lang in ("fr", "ar"):
        title = msg.get(f"title_{lang}") or msg["title"]
        body  = msg.get(f"body_{lang}")  or msg["body"]
    else:
        title, body = msg["title"], msg["body"]
    return msg, title, body


def clean_number(msisdn: str) -> str:
    return msisdn.replace("+", "").replace(" ", "").replace("-", "")


def topic_for(msisdn: str) -> str:
    """NS-3: unguessable HMAC topic when a secret is configured."""
    global _warned_plain_topic
    clean = clean_number(msisdn)
    if NTFY_TOPIC_SECRET:
        digest = hmac.new(NTFY_TOPIC_SECRET.encode(), clean.encode(),
                          hashlib.sha256).hexdigest()[:12]
        return f"{NTFY_TOPIC_PREFIX}_{digest}"
    if not _warned_plain_topic:
        logger.warning(
            "NTFY_TOPIC_SECRET not set — topics are guessable phone-number "
            "topics on a public server. Set a secret for production."
        )
        _warned_plain_topic = True
    return f"{NTFY_TOPIC_PREFIX}_{clean}"


# ── Request model ─────────────────────────────────────────────────────
class NotifyRequest(BaseModel):
    complaint_id: str
    status:       str                       # "in_progress" | "resolved"
    msisdn:       Optional[str] = None      # customer phone number
    category:     Optional[str] = None      # complaint category
    language:     Optional[str] = "fr"      # NS-2: "en" | "fr" | "ar"


# ── ntfy.sh push notification ─────────────────────────────────────────
async def send_ntfy(complaint_id: str, status: str, msisdn: Optional[str],
                    category: str, language: Optional[str]):
    """
    Push via ntfy.sh using JSON publishing (NS-1: UTF-8 safe — the old
    header-based publish crashed on any non-latin-1 title and could
    never have carried the Arabic templates).

    Customer setup (one-time):
      1. Install the free ntfy app (Android/iOS)
      2. Subscribe to the topic shown on the complaint portal
         (GET /api/nlp/notify/topic/{msisdn})
    """
    if not msisdn:
        logger.info("ntfy: no msisdn, skipping push notification")
        return

    msg, title, body_tpl = pick_template(status, language)
    if not msg:
        return

    body  = body_tpl.format(complaint_id=complaint_id,
                            category=category or "network")
    topic = topic_for(msisdn)

    payload = {
        "topic":    topic,
        "title":    title,
        "message":  body,
        "priority": NTFY_PRIORITY.get(msg["priority"], 3),
        "tags":     msg["tags"],
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(NTFY_BASE_URL, json=payload)
        if resp.status_code == 200:
            logger.info(f"ntfy push sent: topic={topic}, status={status}, lang={language}")
        else:
            logger.warning(f"ntfy returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"ntfy push failed: {e}")


# ── CallMeBot WhatsApp notification ───────────────────────────────────
async def send_whatsapp(complaint_id: str, status: str, msisdn: Optional[str],
                        category: str, language: Optional[str]):
    """
    WhatsApp via CallMeBot (free, per-customer opt-in).

    Customer setup (one-time):
      1. Add +34 644 82 49 12 to contacts
      2. Send the WhatsApp message: I allow callmebot to send me messages
      3. Receive a personal apikey by return message
      4. NOC stores it in CALLMEBOT_APIKEY_MAP
    """
    if not msisdn:
        return

    clean = msisdn.replace(" ", "").replace("-", "")
    apikey = CALLMEBOT_APIKEY_MAP.get(clean) or CALLMEBOT_APIKEY_MAP.get(msisdn) \
             or CALLMEBOT_APIKEY_MAP.get(clean_number(msisdn))
    if not apikey:
        logger.debug(f"WhatsApp: no CallMeBot apikey for {clean}, skipping")
        return

    msg, _title, body_tpl = pick_template(status, language)
    if not msg:
        return

    text = "SpiriCom NOC\n\n" + body_tpl.format(
        complaint_id=complaint_id, category=category or "network")

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.callmebot.com/whatsapp.php",
                params={"phone": clean, "text": text, "apikey": apikey},
            )
        # NS-4: CallMeBot answers 200 even on errors ("APIKey is invalid")
        ok = resp.status_code == 200 and (
            "Message queued" in resp.text or "Message Sent" in resp.text
        )
        if ok:
            logger.info(f"WhatsApp sent: {clean}, status={status}")
        else:
            logger.warning(f"CallMeBot did NOT confirm send: {resp.text[:200]}")
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")


# ── FastAPI endpoints ─────────────────────────────────────────────────
@router.post("/notify")
async def notify_customer(req: NotifyRequest, background_tasks: BackgroundTasks):
    """
    POST /api/nlp/notify — called by NLPAnalysis.jsx on status updates.
    Queues both channels as background tasks; client gets an instant 200.
    """
    # NS-7: validate against the template table itself
    if req.status not in STATUS_MESSAGES:
        return {"ok": False, "reason": "status not notifiable"}

    background_tasks.add_task(
        send_ntfy, req.complaint_id, req.status, req.msisdn,
        req.category or "network", req.language,
    )
    background_tasks.add_task(
        send_whatsapp, req.complaint_id, req.status, req.msisdn,
        req.category or "network", req.language,
    )

    logger.info(
        f"Notification queued: {req.complaint_id} -> {req.status} "
        f"(msisdn={req.msisdn}, lang={req.language})"
    )
    return {
        "ok":     True,
        "queued": ["ntfy", "whatsapp"],
        "status": req.status,
        "id":     req.complaint_id,
    }


@router.get("/notify/topic/{msisdn}")
async def get_topic(msisdn: str):
    """
    NS-3: returns the (possibly HMAC) ntfy topic for an msisdn so the
    complaint portal can show the customer what to subscribe to.
    """
    return {"msisdn": msisdn, "topic": topic_for(msisdn), "server": NTFY_BASE_URL}