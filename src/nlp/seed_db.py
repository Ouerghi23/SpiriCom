"""
seed_db.py
===========
Bulk-inserts labeled complaint / feedback rows into the SQLite DB
so the supervised ML classifier has enough training data.

Usage:
    python seed_db.py                 # inserts all seed texts (~220 rows)
    python seed_db.py --count 400     # expands to 400 rows by repeating with variation
    python seed_db.py --dry-run       # print what would be inserted, no DB write
    python seed_db.py --stats         # show current DB stats without inserting anything

Each row is run through MultilingualNLPPipeline.analyze() so all NLP fields
(category, sentiment, urgency, city, is_complaint, …) are populated correctly.
The is_complaint field is forced to the label in the seed data — it overrides
the automatic classification so the training set has clean ground truth.

Run from the project root:
    cd /path/to/project
    python seed_db.py
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.nlp.multilingual_nlp_pipeline import MultilingualNLPPipeline
from src.nlp.complaint_db import ComplaintDB


# ══════════════════════════════════════════════════════════════════════════════
# SEED TEXTS
# Each tuple: (text, is_complaint: bool, channel)
# is_complaint=True  → réclamation  (used as positive class in training)
# is_complaint=False → feedback     (used as negative class in training)
# ══════════════════════════════════════════════════════════════════════════════

# ── FRENCH COMPLAINTS (is_complaint = True) ───────────────────────────────────
FR_COMPLAINTS = [
    "Mon réseau 4G coupe tout le temps à Sfax, c'est insupportable !",
    "Pas de signal depuis ce matin dans tout le quartier.",
    "Internet très lent, impossible de charger une page web.",
    "Je n'arrive pas à passer un appel, la ligne coupe en permanence.",
    "Ma facture du mois est incorrecte, j'ai été surfacturé.",
    "Le réseau 4G est indisponible dans ma région depuis 2 jours.",
    "Coupure internet répétée, connexion instable depuis une semaine.",
    "Le débit est tellement faible que je ne peux pas envoyer un email.",
    "Aucun réseau dans ma maison, pourtant je suis en plein centre-ville.",
    "Mon crédit a été débité sans raison, erreur de facturation grave.",
    "Les appels coupent systématiquement après quelques secondes.",
    "Pas de 4G disponible à Tunis depuis hier soir.",
    "Connexion WiFi instable, déconnexions fréquentes toute la journée.",
    "Je ne peux pas envoyer de SMS depuis 3 jours, problème urgent.",
    "Signal très faible dans tout mon immeuble, c'est inacceptable.",
    "Le service client ne répond pas, réclamation non traitée depuis un mois.",
    "Réseau 3G seulement disponible dans ma zone alors que j'ai un forfait 4G.",
    "Ma ligne est bloquée, je ne reçois ni appels ni SMS.",
    "Perturbation réseau grave depuis le week-end, aucune amélioration.",
    "Vitesse de téléchargement 0.1 Mbps alors que mon forfait promet 50 Mbps.",
    "Appel coupé en pleine réunion importante, problème récurrent.",
    "Mon réseau ne marche pas depuis ce matin, c'est catastrophique.",
    "Erreur facturation sur mon dernier relevé, montant incorrect.",
    "Pas de couverture réseau dans la zone industrielle de Sousse.",
    "Internet haut débit souscrit mais je n'ai que du bas débit.",
    "Réseau mobile absent dans ma ville depuis la nuit dernière.",
    "Sms envoyé mais non reçu par le destinataire, problème de livraison.",
    "Coupure totale de service, ni appel ni data, depuis 6 heures.",
    "Ma recharge n'a pas été créditée malgré le paiement effectué.",
    "Impossible d'accéder aux applications en ligne, connexion trop lente.",
    "Le technicien est venu mais le problème de réseau n'est toujours pas résolu.",
    "Signal inexistant dans toute la région de Nabeul ce matin.",
    "Je paie un forfait premium mais le service est de très mauvaise qualité.",
    "Réseau coupé depuis 48 heures, je travaille de chez moi, c'est urgent.",
    "Impossible d'utiliser les applications en streaming, connexion insuffisante.",
    "Mon abonnement a été résilié par erreur, je n'ai rien demandé.",
    "Problème de VoLTE, les appels via 4G ne passent pas du tout.",
    "Le réseau est tellement mauvais que mon GPS ne fonctionne plus.",
    "Débit descendant très faible, moins de 1 Mbps en 4G.",
    "Service indisponible depuis hier, aucun retour du support client.",
    "ca marche pas depuis ce matin mon reseau coupe !!",
    "mon reseau coupe tout le temps impossible de travailler",
    "pas de 4g dans mon quartier depuis 2 jours",
    "internet lent tres lent impossible de faire quoi que ce soit",
    "facture incorrecte ce mois je demande un remboursement",
]

# ── ARABIC COMPLAINTS (is_complaint = True) ───────────────────────────────────
AR_COMPLAINTS = [
    "شبكتي مقطوعة في تونس منذ 3 أيام، لا أستطيع الاتصال بالعمل.",
    "لا إشارة في منطقتي منذ الصباح، هذا غير مقبول.",
    "الأنترنت بطيء جداً، لا أستطيع فتح أي موقع.",
    "المكالمات تنقطع باستمرار، مشكلة كبيرة في الشبكة.",
    "فاتورتي غلط هذا الشهر، تم خصم مبلغ زائد من رصيدي.",
    "الصبيب ضعيف جداً في منطقتي، أقل من 1 ميغابيت.",
    "شبكة 4G غير متوفرة في مدينتي منذ يومين.",
    "لا يمكنني إرسال رسائل منذ 3 أيام، المشكلة مستمرة.",
    "انقطاع متكرر في الشبكة طوال اليوم، وضع كارثي.",
    "رقمي محظور بالخطأ، لم أتلق أي إشعار مسبق.",
    "خدمة الإنترنت المنزلي متوقفة منذ أسبوع كامل.",
    "الصوت مقطع في المكالمات، جودة رديئة جداً.",
    "لا تغطية في منطقة العمل مع أنها وسط المدينة.",
    "الاتصالات الصوتية لا تعمل عبر 4G.",
    "سرعة الأنترنت ضعيفة رغم الاشتراك في الباقة المميزة.",
    "مشكلة في استقبال الرسائل القصيرة منذ أمس.",
    "انقطاع كامل للخدمة في المنطقة الصناعية بصفاقس.",
    "الشبكة تنقطع كل بضع دقائق، مستحيل العمل عن بعد.",
    "لا أستطيع الاتصال بالطوارئ، الشبكة منقطعة تماماً.",
    "تم تجديد اشتراكي بالخطأ دون إذني، أطلب استرداد المبلغ.",
    "الشبكة واقعة في كامل منطقة أريانة منذ الليلة الماضية.",
    "لا إشارة 4g في منطقتي رغم أن الخريطة تقول خلاف ذلك.",
    "الأنترنت تقطع باستمرار عند استخدام التطبيقات.",
    "خصم مجحف من رصيدي بدون سبب واضح.",
    "الشبكة بطيئة جداً لا تصلح للعمل عن بعد.",
]

# ── ENGLISH COMPLAINTS (is_complaint = True) ─────────────────────────────────
EN_COMPLAINTS = [
    "My 4G network keeps dropping in Tunis since yesterday, totally unacceptable!",
    "No signal at all in my area since this morning.",
    "Internet speed is extremely slow, cannot open any webpage.",
    "Calls keep disconnecting after a few seconds, very frustrating.",
    "I was overcharged on my last bill, there is a billing error.",
    "No 4G coverage in my neighborhood for the past 2 days.",
    "Unstable connection, keeps disconnecting throughout the day.",
    "Download speed is less than 0.1 Mbps, my plan promises 50 Mbps.",
    "Cannot send SMS since 3 days, urgent problem.",
    "Very weak signal inside my building despite being downtown.",
    "Customer service not responding, complaint unresolved for a month.",
    "Network outage in the entire Sousse region since last night.",
    "My subscription was cancelled without my request, major error.",
    "VoLTE calls are not working at all on my device.",
    "Complete service outage since 6 hours, no calls and no data.",
    "My recharge was not credited despite successful payment.",
    "Network cut for 48 hours, I work from home, this is critical.",
    "Streaming apps don't work, connection is too slow.",
    "No coverage in the industrial zone, serious network gap.",
    "Signal completely absent in Nabeul region this morning.",
    "my network keeps dropping every few minutes impossible to work !!",
    "no 4g signal since yesterday please fix this urgent",
    "very slow internet cannot do anything connection broken",
    "billing error on my account please investigate",
    "calls dropping constantly bad service",
]

# ── FRENCH FEEDBACK / NON-COMPLAINTS (is_complaint = False) ──────────────────
FR_FEEDBACK = [
    "Merci pour votre excellent service, tout fonctionne parfaitement.",
    "Comment activer le roaming international pour mon voyage en France ?",
    "Quels sont vos forfaits 5G disponibles en ce moment ?",
    "Je voudrais connaître les tarifs des appels vers l'étranger.",
    "Félicitations pour l'amélioration du réseau dans ma région !",
    "Comment transférer mon numéro depuis un autre opérateur ?",
    "Je suis très satisfait du service, bravo à toute l'équipe.",
    "Pouvez-vous m'expliquer comment activer la messagerie vocale ?",
    "Quel est le numéro du service client pour les professionnels ?",
    "Je voudrais passer à un forfait supérieur, comment faire ?",
    "Merci pour votre réponse rapide à ma demande précédente.",
    "Comment vérifier la date d'expiration de mon forfait ?",
    "Le service est excellent dans ma région, très bon signal.",
    "Je souhaite ajouter une ligne supplémentaire à mon compte.",
    "Quand est-ce que la 5G sera disponible à Sfax ?",
    "Super service, je recommande à tous mes amis.",
    "Comment bloquer les appels indésirables sur mon numéro ?",
    "Je voudrais savoir comment partager ma connexion data.",
    "Bonne expérience globale, personnel accueillant en boutique.",
    "Comment consulter ma consommation en temps réel ?",
    "Merci pour la mise à jour du réseau dans mon quartier.",
    "Puis-je garder mon numéro si je change de forfait ?",
    "Excellente couverture réseau lors de mon déplacement à Djerba.",
    "Comment activer le contrôle parental sur ma ligne enfant ?",
    "Je voudrais en savoir plus sur les offres entreprise.",
    "Bonjour, je cherche des informations sur les SIM prépayées.",
    "Combien coûte un appel vers l'Algérie avec mon forfait actuel ?",
    "Très bon service client, problème résolu en moins d'une heure.",
    "Pouvez-vous m'envoyer un récapitulatif de mes consommations ?",
    "Je cherche une offre famille avec plusieurs lignes.",
]

# ── ARABIC FEEDBACK / NON-COMPLAINTS (is_complaint = False) ──────────────────
AR_FEEDBACK = [
    "شكراً على الخدمة الممتازة، أنا راضٍ تماماً.",
    "كيف يمكنني تفعيل التجوال الدولي لسفري إلى فرنسا؟",
    "ما هي باقات 4G المتاحة حالياً؟",
    "أريد معرفة تعريفة المكالمات الدولية.",
    "تهانيّ على تحسين الشبكة في منطقتي!",
    "كيف أنقل رقمي من مشغّل آخر إلى شبكتكم؟",
    "أنا راضٍ جداً عن الخدمة، شكراً للفريق.",
    "ما رقم خدمة العملاء للأعمال التجارية؟",
    "كيف أتحقق من تاريخ انتهاء اشتراكي؟",
    "متى ستتوفر شبكة 5G في صفاقس؟",
    "خدمة ممتازة، أنصح بها الجميع.",
    "كيف أشارك اتصال الإنترنت مع أجهزة أخرى؟",
    "هل يمكنني الاحتفاظ برقمي عند تغيير الباقة؟",
    "تغطية ممتازة خلال رحلتي إلى جربة.",
    "أريد الاشتراك في باقة عائلية، ما الخيارات المتاحة؟",
    "شكراً على الرد السريع على طلبي السابق.",
    "كيف يمكنني تفعيل خدمة البريد الصوتي؟",
    "أريد إضافة خط إضافي لحسابي.",
    "شكراً على تحديث الشبكة في حيّي.",
    "سؤال عن عروض البطاقات المدفوعة مسبقاً.",
]

# ── ENGLISH FEEDBACK / NON-COMPLAINTS (is_complaint = False) ─────────────────
EN_FEEDBACK = [
    "Thank you for your excellent service, everything works perfectly.",
    "How can I activate international roaming for my trip to France?",
    "What are your current 5G plans and prices?",
    "I would like to know the rates for international calls.",
    "Congratulations on improving the network in my area!",
    "How do I transfer my number from another operator?",
    "Very satisfied with the service, great team.",
    "Can you explain how to activate voicemail on my line?",
    "What is the customer service number for business accounts?",
    "How do I upgrade to a higher plan?",
    "Thank you for the quick response to my previous request.",
    "How do I check my data consumption in real time?",
    "Excellent network coverage during my trip to Djerba.",
    "How can I block unwanted calls on my number?",
    "How do I share my internet connection with other devices?",
    "When will 5G be available in Sfax?",
    "Great service, I recommend it to all my friends.",
    "Can I keep my number if I change my plan?",
    "Looking for information on prepaid SIM cards.",
    "How do I add a child line with parental controls?",
    "Very good customer service, issue resolved in under an hour.",
    "Please send me a summary of my recent usage.",
    "Looking for a family plan with multiple lines.",
    "What are the international call rates for my current plan?",
    "Good overall experience, friendly staff at the store.",
]


# ══════════════════════════════════════════════════════════════════════════════
# VARIATION HELPERS
# ══════════════════════════════════════════════════════════════════════════════

_CITIES = [
    "Tunis", "Sfax", "Sousse", "Nabeul", "Bizerte",
    "Monastir", "Gabès", "Ariana", "Gafsa", "Kairouan",
]
_SEGMENTS = ["Standard", "Premium", "VIP", "Enterprise", ""]
_CHANNELS = ["web", "app", "social", "web", "web"]  # weighted toward web

def _vary(text: str, i: int) -> str:
    """Apply light variations to avoid exact duplicates in extended mode."""
    suffixes_fr = ["", " encore une fois.", " depuis plusieurs jours.",
                   " merci de traiter cela rapidement.", " toujours pas résolu."]
    suffixes_en = ["", " Please fix this.", " Still not working.",
                   " This is urgent.", " Happening again."]
    suffixes_ar = ["", " منذ فترة طويلة.", " أرجو الحل السريع.",
                   " هذه ليست المرة الأولى.", " المشكلة مستمرة."]

    if any(ord(c) > 0x0600 for c in text):
        suf = suffixes_ar[i % len(suffixes_ar)]
    elif any(w in text.lower() for w in ["thank","how","what","please","great","looking"]):
        suf = suffixes_en[i % len(suffixes_en)]
    elif any(w in text.lower() for w in ["merci","comment","quels","félicitations","bonjour"]):
        suf = suffixes_fr[i % len(suffixes_fr)]
    else:
        suf = suffixes_fr[i % len(suffixes_fr)]

    return text + suf if i > 0 else text


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def build_seed_list() -> list[tuple[str, bool]]:
    """Return list of (text, is_complaint) from all seed arrays."""
    items = (
        [(t, True)  for t in FR_COMPLAINTS] +
        [(t, True)  for t in AR_COMPLAINTS] +
        [(t, True)  for t in EN_COMPLAINTS] +
        [(t, False) for t in FR_FEEDBACK  ] +
        [(t, False) for t in AR_FEEDBACK  ] +
        [(t, False) for t in EN_FEEDBACK  ]
    )
    return items


def expand_to(items: list, target: int) -> list[tuple[str, bool]]:
    """
    Repeat items with slight text variation until we reach `target` rows.
    Shuffles the base list each pass to vary the order.
    """
    result = list(items)
    rng    = random.Random(42)
    pass_n = 1
    while len(result) < target:
        shuffled = list(items)
        rng.shuffle(shuffled)
        for text, label in shuffled:
            if len(result) >= target:
                break
            result.append((_vary(text, pass_n), label))
        pass_n += 1
    return result[:target]


def seed(target: int = 0, dry_run: bool = False) -> None:
    pipe = MultilingualNLPPipeline(verbose=False)
    db   = ComplaintDB()

    base  = build_seed_list()
    rows  = expand_to(base, target) if target > len(base) else base
    total = len(rows)

    # Stats for summary
    already_in_db = db.count()

    print(f"\n{'[DRY RUN] ' if dry_run else ''}Seeding {total} rows into DB ({already_in_db} rows already present)\n")

    inserted = skipped = 0
    bar_width = 40

    for idx, (text, ground_truth_is_complaint) in enumerate(rows, 1):
        # Progress bar
        done   = int(bar_width * idx / total)
        bar    = "█" * done + "░" * (bar_width - done)
        pct    = int(100 * idx / total)
        print(f"\r  [{bar}] {pct:3d}%  {idx}/{total}", end="", flush=True)

        if dry_run:
            continue

        # Run full NLP pipeline
        nlp = pipe.analyze(text)

        # Override is_complaint with the ground-truth label from seed data
        # This gives the ML trainer clean labeled data, not just auto-predictions
        nlp["is_complaint"] = ground_truth_is_complaint

        # Fake a realistic timestamp spread over the last 90 days
        offset_days = random.randint(0, 90)
        offset_mins = random.randint(0, 1440)
        ts = (datetime.now() - timedelta(days=offset_days, minutes=offset_mins)).isoformat()

        record = {
            "submitted_at": ts,
            "msisdn":       f"216{random.randint(20000000, 99999999)}",
            "city_input":   random.choice(_CITIES),
            "segment":      random.choice(_SEGMENTS),
            "channel":      random.choice(_CHANNELS),
            "text_original": text,
            **nlp,
        }

        try:
            db.insert(record)
            inserted += 1
        except Exception as e:
            skipped += 1

    print()  # newline after progress bar

    # ── Summary ──────────────────────────────────────────────────────────────
    if dry_run:
        c_count = sum(1 for _, label in rows if label)
        f_count = sum(1 for _, label in rows if not label)
        print(f"\n  Would insert {total} rows:")
        print(f"    Réclamations : {c_count}")
        print(f"    Feedback     : {f_count}")
        print(f"    Languages    : FR / AR / EN mixed")
        print("\n  Re-run without --dry-run to write to DB.")
        return

    stats = db.stats()
    new_total = db.count()
    print(f"\n  Done.")
    print(f"  ├── Inserted   : {inserted}")
    print(f"  ├── Skipped    : {skipped}  (duplicate IDs)")
    print(f"  ├── DB total   : {new_total}")
    print(f"  ├── Complaints : {stats.get('complaint_count', '—')}")
    print(f"  ├── Feedback   : {stats.get('non_complaint_count', '—')}")
    print(f"  └── Languages  : {stats.get('by_language', {})}")

    if new_total >= 200:
        print(f"\n  ✓ {new_total} rows available — ready to train the classifier.")
        print(f"    Run: python complaint_classifier_trainer.py")
    else:
        remaining = 200 - new_total
        print(f"\n  Need {remaining} more rows to reach 200.")
        print(f"    Run: python seed_db.py --count {new_total + remaining + 50}")


def show_stats() -> None:
    db    = ComplaintDB()
    stats = db.stats()
    print("\n  Current DB stats")
    print(f"  ├── Total rows  : {stats['total']}")
    print(f"  ├── Complaints  : {stats.get('complaint_count', '—')}")
    print(f"  ├── Feedback    : {stats.get('non_complaint_count', '—')}")
    print(f"  ├── Languages   : {stats.get('by_language', {})}")
    print(f"  └── Categories  : {stats.get('by_category', {})}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed the complaint DB with labeled training data."
    )
    parser.add_argument(
        "--count", type=int, default=0,
        help="Target row count (default: insert all seed texts, ~220 rows)."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be inserted without writing to DB."
    )
    parser.add_argument(
        "--stats", action="store_true",
        help="Show current DB statistics and exit."
    )
    args = parser.parse_args()

    if args.stats:
        show_stats()
    else:
        seed(target=args.count, dry_run=args.dry_run)