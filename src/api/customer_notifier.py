# src/nlp/customer_notifier.py
# ─────────────────────────────────────────────────────────────────────
# SpiriCom — Customer Telegram notifier (v2)
#
# v2 fixes:
#  TG-1  verify=False — Huawei corporate proxy uses self-signed SSL cert
#         which blocks httpx from reaching api.telegram.org (same issue
#         as Groq, same fix).
#  TG-2  parse_mode switched from Markdown to HTML — Markdown breaks
#         silently if category/city contain *, _, `, [ characters.
#  TG-3  Professional Ooredoo-branded message with logo link, site URL,
#         support number, and NOC footer.
#  TG-4  segment parameter added to message.
#  TG-5  Better error logging with HTTP status + response body.
# ─────────────────────────────────────────────────────────────────────

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger("customer_notifier")

STATUS_FR = {
    "open":        "Ouverte",
    "in_progress": "En cours de traitement ⚙️",
    "resolved":    "Résolue ✅",
    "closed":      "Clôturée 🔒",
}

SEGMENT_LABEL = {
    "enterprise":  "Entreprise 🏢",
    "simple_user": "Particulier 👤",
    "highenduser": "High-End User ⭐",
    "hv":          "HV Client 💎",
}


def _build_html_message(
    complaint_id: str,
    msisdn:       Optional[str],
    status:       str,
    category:     str,
    city:         str,
    segment:      Optional[str] = None,
) -> str:
    """
    Build a professional HTML-formatted Telegram message with Ooredoo branding.
    HTML parse_mode is more robust than Markdown — no risk of formatting breaks
    from special characters in category/city names.
    """
    label       = STATUS_FR.get(status, status)
    date_str    = datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M UTC")
    msisdn_disp = msisdn or "—"
    seg_label   = SEGMENT_LABEL.get((segment or "").lower(), segment or "Particulier")

    # Emoji indicator per status
    status_emoji = {
        "open":        "🔵",
        "in_progress": "🟡",
        "resolved":    "🟢",
        "closed":      "⚫",
    }.get(status, "🔵")

    return (
        # Header — Ooredoo branding
        f'🔴 <b>Ooredoo Tunisia — SpiriCom NOC</b>\n'
        f'━━━━━━━━━━━━━━━━━━━━━━━━\n\n'

        # Title
        f'📋 <b>Mise à jour de votre ticket</b>\n\n'

        # Ticket details
        f'🎫 <b>Ticket :</b>  <code>{complaint_id}</code>\n'
        f'📱 <b>MSISDN :</b>  <code>{msisdn_disp}</code>\n'
        f'📍 <b>Ville :</b>   {city}\n'
        f'🏷 <b>Catégorie :</b> {category}\n'
        f'👤 <b>Segment :</b>  {seg_label}\n\n'

        # Status (prominent)
        f'━━━━━━━━━━━━━━━━━━━━━━━━\n'
        f'{status_emoji} <b>Statut :</b>  <b>{label}</b>\n'
        f'🕐 <b>Date :</b>    {date_str}\n'
        f'━━━━━━━━━━━━━━━━━━━━━━━━\n\n'

        # Ooredoo links & support
        f'🌐 <a href="https://www.ooredoo.tn/Personal/fr/">ooredoo.tn</a>  '
        

        # Footer
        f'<i>SpiriCom NOC Intelligence\n'
        f'Huawei Technologies Tunisia · PFE 2026</i>'
    )


async def notify_customer(
    complaint_id: str,
    msisdn:       Optional[str],
    status:       str,
    category:     str = "Réclamation",
    city:         str = "Tunisie",
    segment:      Optional[str] = None,   # TG-4: new parameter
    **_kwargs,
) -> dict:
    """
    Send a Telegram notification to the NOC channel when a complaint
    status changes to in_progress, resolved or closed.
    """
    # Only notify on actionable transitions
    if status not in ("in_progress", "resolved", "closed"):
        return {"notified": False, "reason": "status_not_actionable"}

    token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        logger.warning(
            "Telegram not configured — "
            "set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env"
        )
        return {"notified": False, "channel": "telegram", "reason": "not_configured"}

    html_text = _build_html_message(
        complaint_id=complaint_id,
        msisdn=msisdn,
        status=status,
        category=category,
        city=city,
        segment=segment,
    )

    try:
        # TG-1: verify=False — corporate Huawei proxy uses self-signed cert
        async with httpx.AsyncClient(timeout=10, verify=False) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id":                  chat_id,
                    "text":                     html_text,
                    "parse_mode":               "HTML",         # TG-2
                    "disable_web_page_preview": True,
                },
            )

        # TG-5: log full response on failure
        if r.status_code == 200:
            logger.info(
                "Telegram ✅ → %s [%s] complaint=%s",
                msisdn, status, complaint_id
            )
            return {"notified": True, "channel": "telegram"}
        else:
            logger.error(
                "Telegram ❌ HTTP %s: %s", r.status_code, r.text[:300]
            )
            return {
                "notified": False,
                "channel":  "telegram",
                "error":    f"HTTP {r.status_code}: {r.text[:200]}",
            }

    except httpx.ConnectError as exc:
        logger.error("Telegram ConnectError (proxy/SSL?): %s", exc)
        return {"notified": False, "channel": "telegram", "error": str(exc)}
    except Exception as exc:
        logger.error("Telegram unexpected error: %s", exc)
        return {"notified": False, "channel": "telegram", "error": str(exc)}