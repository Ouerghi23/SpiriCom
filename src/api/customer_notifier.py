# src/nlp/customer_notifier.py
import asyncio, logging, os, httpx
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger("customer_notifier")

STATUS_FR = {
    "open":        "Ouverte",
    "in_progress": "En cours de traitement",
    "resolved":    "Résolue ✅",
    "closed":      "Clôturée",
}

async def notify_customer(
    complaint_id: str,
    msisdn:       Optional[str],
    status:       str,
    category:     str = "Réclamation",
    city:         str = "Tunisie",
    **_kwargs,
) -> dict:
    if status not in ("in_progress", "resolved", "closed"):
        return {"notified": False, "reason": "status_not_actionable"}

    token   = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if not token or not chat_id:
        logger.warning("Telegram not configured — TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID manquants")
        return {"notified": False, "channel": "telegram", "reason": "not_configured"}

    label = STATUS_FR.get(status, status)
    text  = (
        f"📡 *SpiriCom NOC — Mise à jour ticket*\n\n"
        f"🎫 Ticket  : `{complaint_id}`\n"
        f"📱 MSISDN  : `{msisdn or '—'}`\n"
        f"📍 Ville   : {city}\n"
        f"🏷 Catégorie : {category}\n"
        f"🔄 Statut  : *{label}*\n"
        f"🕐 Date    : {datetime.now(timezone.utc).strftime('%d/%m/%Y %H:%M')} UTC"
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
            )
        ok = r.status_code == 200
        if ok:
            logger.info("Telegram ✅ → %s [%s]", msisdn, status)
        else:
            logger.error("Telegram ❌ : %s", r.text)
        return {"notified": ok, "channel": "telegram"}

    except Exception as exc:
        logger.error("Telegram error: %s", exc)
        return {"notified": False, "channel": "telegram", "error": str(exc)}