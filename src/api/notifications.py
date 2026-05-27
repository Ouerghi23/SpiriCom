"""
src/api/notifications.py
=========================
Automatic notification system for Huawei SpiriComp NOC Dashboard.

Endpoints:
  POST /api/notifications/resolved/{complaint_id}
    → Sends email/SMS to subscriber when complaint is marked resolved.

  POST /api/notifications/feedback-thanks/{complaint_id}
    → Sends thank-you email/SMS when positive feedback is received.

  GET  /api/notifications/status
    → Health check: shows which providers are configured.

Configuration (environment variables — set in .env or shell):
  SMTP_HOST        SMTP server (default: smtp.gmail.com)
  SMTP_PORT        SMTP port   (default: 587)
  SMTP_USER        Sender email address
  SMTP_PASS        Sender email password / app password
  SMTP_FROM_NAME   Display name (default: SpiriComp NOC)
  SMS_PROVIDER     "twilio" | "infobip" | "mock" (default: mock)
  TWILIO_SID       Twilio Account SID
  TWILIO_TOKEN     Twilio Auth Token
  TWILIO_FROM      Twilio phone number (e.g. +12125551234)

Usage:
  # Mount in analytics_api.py:
  from src.api.notifications import router as notif_router
  app.include_router(notif_router)
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from pathlib              import Path
from typing               import Optional

from fastapi             import APIRouter, HTTPException
from pydantic            import BaseModel

logger = logging.getLogger("notifications")

# ── Config from env ───────────────────────────────────────────────────
SMTP_HOST      = os.getenv("SMTP_HOST",      "smtp.gmail.com")
SMTP_PORT      = int(os.getenv("SMTP_PORT",  "587"))
SMTP_USER      = os.getenv("SMTP_USER",      "")
SMTP_PASS      = os.getenv("SMTP_PASS",      "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "SpiriComp NOC — Ooredoo Tunisia")
SMS_PROVIDER   = os.getenv("SMS_PROVIDER",   "mock")  # twilio | infobip | mock
TWILIO_SID     = os.getenv("TWILIO_SID",     "")
TWILIO_TOKEN   = os.getenv("TWILIO_TOKEN",   "")
TWILIO_FROM    = os.getenv("TWILIO_FROM",    "")

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


# ── Pydantic request body ─────────────────────────────────────────────
class NotifyRequest(BaseModel):
    """Optional override — recipient info is usually pulled from the DB."""
    email:         Optional[str] = None  # override DB email
    phone:         Optional[str] = None  # override DB phone (MSISDN)
    custom_message:Optional[str] = None  # custom message override


# ── Email helper ──────────────────────────────────────────────────────
def send_email(to: str, subject: str, html_body: str, text_body: str) -> bool:
    """
    Send an email via SMTP (TLS).
    Returns True on success, False on failure.
    Logs the error but does NOT raise — notifications should never crash the API.
    """
    if not SMTP_USER or not SMTP_PASS:
        logger.warning("Email not configured — set SMTP_USER and SMTP_PASS env vars")
        # In mock mode, just log and pretend it worked
        logger.info("MOCK EMAIL → %s | Subject: %s", to, subject)
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
        msg["To"]      = to

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html",  "utf-8"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, [to], msg.as_string())

        logger.info("Email sent → %s | %s", to, subject)
        return True

    except Exception as exc:
        logger.error("Email failed → %s: %s", to, exc)
        return False


# ── SMS helper ────────────────────────────────────────────────────────
def send_sms(to_phone: str, message: str) -> bool:
    """
    Send SMS. Supports Twilio (production) or mock (development).

    To switch to Twilio:
      1. pip install twilio
      2. Set TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM in env
      3. Set SMS_PROVIDER=twilio

    For Infobip or any other provider, replace the block below.
    """
    if SMS_PROVIDER == "twilio":
        try:
            from twilio.rest import Client          # pip install twilio
            client = Client(TWILIO_SID, TWILIO_TOKEN)
            client.messages.create(
                body=message, from_=TWILIO_FROM, to=to_phone
            )
            logger.info("SMS sent (Twilio) → %s", to_phone)
            return True
        except ImportError:
            logger.error("Twilio not installed — run: pip install twilio")
            return False
        except Exception as exc:
            logger.error("SMS failed (Twilio) → %s: %s", to_phone, exc)
            return False

    elif SMS_PROVIDER == "infobip":
        # Example stub — fill in your Infobip API key and base URL
        import urllib.request, json as json_mod
        INFOBIP_KEY     = os.getenv("INFOBIP_API_KEY", "")
        INFOBIP_BASE    = os.getenv("INFOBIP_BASE_URL", "")
        INFOBIP_FROM    = os.getenv("INFOBIP_FROM",    "SpiriComp")
        if not INFOBIP_KEY:
            logger.warning("Infobip not configured — set INFOBIP_API_KEY env var")
            return False
        payload = json_mod.dumps({
            "messages": [{"destinations": [{"to": to_phone}],
                          "from": INFOBIP_FROM, "text": message}]
        }).encode()
        req = urllib.request.Request(
            f"{INFOBIP_BASE}/sms/2/text/advanced",
            data=payload,
            headers={"Authorization": f"App {INFOBIP_KEY}", "Content-Type": "application/json"},
        )
        try:
            urllib.request.urlopen(req, timeout=10)
            logger.info("SMS sent (Infobip) → %s", to_phone)
            return True
        except Exception as exc:
            logger.error("SMS failed (Infobip) → %s: %s", to_phone, exc)
            return False

    else:
        # Mock mode — log only, no real SMS
        logger.info("MOCK SMS → %s | %s", to_phone, message[:80])
        return True


# ── DB lookup helper ──────────────────────────────────────────────────
def _get_complaint(complaint_id: str) -> dict | None:
    """Fetch one complaint from the NLP SQLite DB."""
    try:
        from src.nlp.complaint_db import ComplaintDB
        db = ComplaintDB()
        df = db.to_dataframe(limit=10000)
        row = df[df["complaint_id"] == complaint_id]
        return row.iloc[0].to_dict() if not row.empty else None
    except Exception as exc:
        logger.error("DB lookup failed for %s: %s", complaint_id, exc)
        return None


# ── Email templates ───────────────────────────────────────────────────

def _resolved_email(complaint_id: str, category: str, lang: str) -> tuple[str, str, str]:
    """Returns (subject, html, text) for a resolved complaint notification."""
    subject = f"✅ Votre réclamation {complaint_id} a été résolue — Ooredoo Tunisia"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)">
      <div style="background:#C7000B;padding:28px 32px;text-align:center">
        <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700">Ooredoo Tunisia</h1>
        <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:14px">SpiriComp Customer Support</p>
      </div>
      <div style="padding:32px">
        <h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px">✅ Réclamation résolue</h2>
        <p style="color:#444;font-size:15px;line-height:1.7">
          Votre réclamation (<strong style="color:#C7000B">{complaint_id}</strong>) concernant
          <strong>{category}</strong> a été traitée et résolue avec succès.
        </p>
        <div style="background:#f4f9f4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin:20px 0">
          <p style="color:#166534;margin:0;font-size:14px">
            🎉 Votre service Ooredoo est maintenant rétabli. Merci de votre patience.
          </p>
        </div>
        <p style="color:#888;font-size:12px">
          Si vous rencontrez encore des problèmes, soumettez une nouvelle réclamation via notre portail.
        </p>
      </div>
      <div style="background:#f8f8f8;padding:16px 32px;text-align:center;border-top:1px solid #eee">
        <p style="color:#aaa;font-size:11px;margin:0">© 2026 Ooredoo Tunisia · SpiriComp NOC Platform</p>
      </div>
    </div>
    """

    text = (
        f"Votre réclamation {complaint_id} ({category}) a été résolue.\n"
        f"Merci de votre confiance — Ooredoo Tunisia / SpiriComp."
    )
    return subject, html, text


def _feedback_thanks_email(complaint_id: str, lang: str) -> tuple[str, str, str]:
    """Returns (subject, html, text) for a positive feedback thank-you."""
    subject = "🙏 Merci pour votre retour — Ooredoo Tunisia"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.1)">
      <div style="background:#C7000B;padding:28px 32px;text-align:center">
        <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700">Ooredoo Tunisia</h1>
      </div>
      <div style="padding:32px">
        <h2 style="color:#1a1a1a;font-size:20px;margin:0 0 16px">🙏 Merci pour votre retour !</h2>
        <p style="color:#444;font-size:15px;line-height:1.7">
          Nous avons bien reçu votre message positif (réf. <strong style="color:#C7000B">{complaint_id}</strong>).
          Votre satisfaction est notre priorité absolue.
        </p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin:20px 0">
          <p style="color:#1e40af;margin:0;font-size:14px">
            💙 Votre avis contribue à améliorer nos services pour tous nos clients en Tunisie.
          </p>
        </div>
      </div>
      <div style="background:#f8f8f8;padding:16px 32px;text-align:center;border-top:1px solid #eee">
        <p style="color:#aaa;font-size:11px;margin:0">© 2026 Ooredoo Tunisia · SpiriComp NOC Platform</p>
      </div>
    </div>
    """

    text = (
        f"Merci pour votre retour positif (réf. {complaint_id}).\n"
        f"Votre satisfaction nous engage — Ooredoo Tunisia."
    )
    return subject, html, text


# ── SMS templates ─────────────────────────────────────────────────────

def _resolved_sms(complaint_id: str, category: str) -> str:
    return (
        f"[Ooredoo] Votre réclamation {complaint_id} ({category}) est résolue. "
        f"Merci de votre patience. Pour toute question: 188"
    )

def _thanks_sms(complaint_id: str) -> str:
    return (
        f"[Ooredoo] Merci pour votre retour positif (réf. {complaint_id}). "
        f"Votre satisfaction est notre priorité !"
    )


# ════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ════════════════════════════════════════════════════════════════════════

@router.post("/resolved/{complaint_id}")
async def notify_resolved(complaint_id: str, body: NotifyRequest = NotifyRequest()):
    """
    Send SMS + Email to the subscriber when their complaint is resolved.

    Call this automatically from the status-update endpoint, or manually
    from the NOC dashboard after marking a ticket as resolved.
    """
    c = _get_complaint(complaint_id)
    if not c:
        raise HTTPException(404, f"Complaint {complaint_id} not found")

    if c.get("status") != "resolved":
        raise HTTPException(400, "Complaint is not yet marked as resolved")

    # Determine recipient
    phone = body.phone or c.get("msisdn")
    # Email: not stored in current schema — use body override or skip
    email = body.email

    category = c.get("nlp_category", "Network Issue")
    lang     = c.get("language", "fr")
    results  = {}

    # ── EMAIL ─────────────────────────────────────────────────────────
    if email:
        subject, html, text = _resolved_email(complaint_id, category, lang)
        if body.custom_message:
            text = body.custom_message
        results["email"] = send_email(email, subject, html, text)
    else:
        results["email"] = False
        results["email_skip_reason"] = "No email address on file — provide via body.email"

    # ── SMS ───────────────────────────────────────────────────────────
    if phone:
        # Normalize Tunisian number: 2161XXXXXXXX → +2161XXXXXXXX
        normalized = phone.strip()
        if not normalized.startswith("+"):
            normalized = "+" + normalized
        sms_msg  = body.custom_message or _resolved_sms(complaint_id, category)
        results["sms"] = send_sms(normalized, sms_msg)
        results["sms_to"] = normalized
    else:
        results["sms"] = False
        results["sms_skip_reason"] = "No MSISDN on file"

    logger.info("notify_resolved %s → %s", complaint_id, results)
    return {
        "complaint_id": complaint_id,
        "status":       "resolved",
        "notifications": results,
    }


@router.post("/feedback-thanks/{complaint_id}")
async def notify_feedback_thanks(complaint_id: str, body: NotifyRequest = NotifyRequest()):
    """
    Send a thank-you SMS + Email when positive feedback is received.
    Call this automatically when is_complaint = False AND sentiment = positif.
    """
    c = _get_complaint(complaint_id)
    if not c:
        raise HTTPException(404, f"Complaint {complaint_id} not found")

    phone = body.phone or c.get("msisdn")
    email = body.email
    lang  = c.get("language", "fr")
    results = {}

    if email:
        subject, html, text = _feedback_thanks_email(complaint_id, lang)
        results["email"] = send_email(email, subject, html, text)
    else:
        results["email"]             = False
        results["email_skip_reason"] = "No email address — provide via body.email"

    if phone:
        normalized = phone.strip()
        if not normalized.startswith("+"):
            normalized = "+" + normalized
        sms_msg       = body.custom_message or _thanks_sms(complaint_id)
        results["sms"]    = send_sms(normalized, sms_msg)
        results["sms_to"] = normalized
    else:
        results["sms"]             = False
        results["sms_skip_reason"] = "No MSISDN on file"

    logger.info("notify_feedback_thanks %s → %s", complaint_id, results)
    return {
        "complaint_id": complaint_id,
        "type":         "feedback_thanks",
        "notifications": results,
    }


@router.get("/status")
async def notification_status():
    """Health check — shows which notification providers are configured."""
    return {
        "email": {
            "configured": bool(SMTP_USER and SMTP_PASS),
            "host":       SMTP_HOST,
            "port":       SMTP_PORT,
            "sender":     SMTP_USER or "not set",
        },
        "sms": {
            "provider":   SMS_PROVIDER,
            "configured": (
                (SMS_PROVIDER == "twilio"  and bool(TWILIO_SID and TWILIO_TOKEN)) or
                (SMS_PROVIDER == "infobip" and bool(os.getenv("INFOBIP_API_KEY"))) or
                SMS_PROVIDER == "mock"
            ),
        },
        "tip": (
            "Set SMTP_USER + SMTP_PASS for email. "
            "Set SMS_PROVIDER=twilio + TWILIO_SID + TWILIO_TOKEN for SMS. "
            "Current mode: MOCK — no real messages sent."
        ) if not SMTP_USER else "Email configured. Check SMS provider.",
    }