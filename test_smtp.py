"""
test_smtp.py — Lance ce script SÉPARÉMENT pour tester Gmail SMTP
sans démarrer tout le serveur FastAPI.

Usage :
  python test_smtp.py
"""
import smtplib, os, sys
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText

# ── Lis les variables (depuis .env si python-dotenv est dispo) ────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅  .env chargé via python-dotenv")
except ImportError:
    print("⚠️   python-dotenv non installé — variables lues depuis l'OS")

GMAIL_USER    = os.getenv("GMAIL_USER",    "")
GMAIL_APPPASS = os.getenv("GMAIL_APPPASS", "")
TO_EMAIL      = os.getenv("GMAIL_USER",    "")   # s'envoie à soi-même pour tester

print(f"\n  GMAIL_USER    = {GMAIL_USER or '❌ VIDE'}")
print(f"  GMAIL_APPPASS = {'*' * len(GMAIL_APPPASS) if GMAIL_APPPASS else '❌ VIDE'} "
      f"({len(GMAIL_APPPASS)} chars)")

if not GMAIL_USER or not GMAIL_APPPASS:
    print("\n❌  Variables manquantes — ajoute-les dans .env puis relance.")
    sys.exit(1)

# ── Test de connexion SMTP ─────────────────────────────────────────────
print("\n⏳  Connexion à smtp.gmail.com:587 …")
try:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "SpiriCom — Test SMTP"
    msg["From"]    = f"SpiriCom NOC <{GMAIL_USER}>"
    msg["To"]      = TO_EMAIL
    msg.attach(MIMEText("Test SMTP SpiriCom — si tu reçois cet email, ça marche ✅", "plain"))

    with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(GMAIL_USER, GMAIL_APPPASS)
        smtp.sendmail(GMAIL_USER, [TO_EMAIL], msg.as_string())

    print(f"✅  Email envoyé à {TO_EMAIL} — vérifie ta boîte (+ spam) !")

except smtplib.SMTPAuthenticationError as e:
    print(f"\n❌  AUTHENTIFICATION ÉCHOUÉE : {e}")
    print("""
  Solutions :
  1. Vérifie que 2-Step Verification est ACTIVÉE sur ton compte Google
  2. Va sur myaccount.google.com/apppasswords
  3. Crée un App Password nommé 'SpiriCom'
  4. Copie les 16 caractères SANS espaces dans .env :
       GMAIL_APPPASS=abcdefghijklmnop
  5. Relance ce script
    """)

except smtplib.SMTPConnectError as e:
    print(f"\n❌  CONNEXION IMPOSSIBLE : {e}")
    print("  Vérifie ta connexion internet ou un firewall bloquant le port 587")

except Exception as e:
    print(f"\n❌  ERREUR : {type(e).__name__}: {e}")