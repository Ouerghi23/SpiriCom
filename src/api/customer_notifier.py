# src/nlp/customer_notifier.py
# SpiriCom — Customer Telegram notifier (v3)
# v3: clean SMS-style message — no emojis, professional telecom format

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger("customer_notifier")

STATUS_FR = {
    "open":        "Ouverte",
    "in_progress": "En cours de traitement",
    "resolved":    "Resolue",
    "closed":      "Cloturee",
}

SEGMENT_LABEL = {
    "enterprise":  "Entreprise",
    "simple_user": "Particulier",
    "highenduser": "High-End",
    "hv":          "Grand Compte",
}


def _build_sms_message(
    complaint_id: str,
    msisdn:       Optional[str],
    status:       str,
    category:     str,
    city:         str,
    segment:      Optional[str] = None,
) -> str:
    label     = STATUS_FR.get(status, status.upper())
    date_str  = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")
    seg_label = SEGMENT_LABEL.get((segment or "").lower(), "Particulier")

    return (
        f"<b>OOREDOO TUNISIA</b>\n"
        f"<b>Service Client — SpiriCom NOC</b>\n"
        f"────────────────────────\n\n"

        f"Mise a jour de votre dossier\n\n"

        f"<b>Reference</b>  : <code>{complaint_id}</code>\n"
        f"<b>MSISDN</b>     : <code>{msisdn or 'Non renseigne'}</code>\n"
        f"<b>Ville</b>      : {city}\n"
        f"<b>Categorie</b>  : {category}\n"
        f"<b>Segment</b>    : {seg_label}\n\n"

        f"────────────────────────\n"
        f"<b>STATUT : {label.upper()}</b>\n"
        f"<b>Date   : {date_str}</b>\n"
        f"────────────────────────\n\n"

        f"Pour toute assistance :\n"
        f"  Site    : <a href=\"https://www.ooredoo.tn/Personal/fr/\">ooredoo.tn</a>\n"
        

        f"<i>Ooredoo Tunisia — DIMA M3AK\n"
        
    )


async def notify_customer(
    complaint_id: str,
    msisdn:       Optional[str],
    status:       str,
    category:     str = "Reclamation",
    city:         str = "Tunisie",
    segment:      Optional[str] = None,
    **_kwargs,
) -> dict:
    if status not in ("in_progress", "resolved", "closed"):
        return {"notified": False, "reason": "status_not_actionable"}

    token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        logger.warning("Telegram not configured — set TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID")
        return {"notified": False, "channel": "telegram", "reason": "not_configured"}

    html_text = _build_sms_message(
        complaint_id=complaint_id,
        msisdn=msisdn,
        status=status,
        category=category,
        city=city,
        segment=segment,
    )

    try:
        async with httpx.AsyncClient(timeout=10, verify=False) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id":                  chat_id,
                    "text":                     html_text,
                    "parse_mode":               "HTML",
                    "disable_web_page_preview": True,
                },
            )

        if r.status_code == 200:
            logger.info("Telegram OK → %s [%s] complaint=%s", msisdn, status, complaint_id)
            return {"notified": True, "channel": "telegram"}
        else:
            logger.error("Telegram HTTP %s: %s", r.status_code, r.text[:300])
            return {"notified": False, "channel": "telegram",
                    "error": f"HTTP {r.status_code}: {r.text[:200]}"}

    except httpx.ConnectError as exc:
        logger.error("Telegram ConnectError: %s", exc)
        return {"notified": False, "channel": "telegram", "error": str(exc)}
    except Exception as exc:
        logger.error("Telegram error: %s", exc)
        return {"notified": False, "channel": "telegram", "error": str(exc)}