"""
multilingual_nlp_pipeline.py
==============================
Multilingual NLP pipeline for Ooredoo complaint analysis.
Supports Arabic, French, and English without translation.

Each language has its own lexicon — no translation needed.
Language detection is automatic (rule-based, no external API).

Usage:
    from src.nlp.multilingual_nlp_pipeline import MultilingualNLPPipeline
    pipe   = MultilingualNLPPipeline()
    result = pipe.analyze("شبكتي مقطوعة في تونس منذ 3 أيام")
    result = pipe.analyze("Mon réseau coupe à Sfax depuis 3 jours")
    result = pipe.analyze("My 4G network keeps dropping in Tunis")
"""

from __future__ import annotations
import re
from datetime import datetime
import pandas as pd


# ══════════════════════════════════════════════════════════════════════════════
# LANGUAGE DETECTION
# ══════════════════════════════════════════════════════════════════════════════

ARABIC_RANGE = re.compile(r'[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+')
FRENCH_WORDS = {
    "mon","ma","le","la","les","de","du","je","ne","pas","un","une",
    "réseau","internet","appel","connexion","coupure","lent","problème",
    "depuis","jours","impossible","mauvais","bonjour","merci",
}
ENGLISH_WORDS = {
    "my","the","is","not","network","internet","call","connection",
    "slow","problem","since","days","impossible","bad","hello","thanks",
    "signal","drop","weak","no","service","issue","complaint",
}

def detect_language(text: str) -> str:
    """Detect language: 'ar', 'fr', or 'en'."""
    if not text:
        return "fr"
    arabic_chars = len(ARABIC_RANGE.findall(text))
    if arabic_chars > 2:
        return "ar"
    words = set(re.findall(r'\b\w+\b', text.lower()))
    fr_score = len(words & FRENCH_WORDS)
    en_score = len(words & ENGLISH_WORDS)
    if fr_score == 0 and en_score == 0:
        return "fr"
    return "fr" if fr_score >= en_score else "en"


# ══════════════════════════════════════════════════════════════════════════════
# LEXICONS — one per language
# ══════════════════════════════════════════════════════════════════════════════

# ── FRENCH ────────────────────────────────────────────────────────────────────
FR_CATEGORIES = {
    "Réseau / Couverture": [
        "pas de réseau","aucun signal","pas de couverture","zone blanche",
        "hors réseau","réseau indisponible","signal faible","coupure réseau",
        "réseau mobile","antenne","4g","5g","3g","lte","perte réseau",
        "pas de 4g","réseau coupe",
    ],
    "Débit / Internet": [
        "débit faible","internet lent","connexion lente","lenteur","slow",
        "téléchargement lent","mbps","bande passante","accès internet",
        "pas d'internet","internet ne marche pas","coupure internet",
        "déconnexion","connexion instable",
    ],
    "Appels / Voix": [
        "appel coupé","coupure appel","appel impossible","voix haché","echo",
        "bruit","qualité voix","appel échoué","ne peut pas appeler",
        "appel ne passe pas","tonalité","volte","appels coupent",
    ],
    "SMS": [
        "sms non reçu","sms non envoyé","message non délivré","texto",
        "sms bloqué","message échoué",
    ],
    "Facturation": [
        "facture","surfacturation","débit abusif","recharge","solde incorrect",
        "forfait","crédit","tarification","erreur facturation","prélèvement",
    ],
    "Support Client": [
        "service client","attente","conseiller","réclamation non traitée",
        "aucune réponse","problème non résolu","rappel","hotline",
    ],
}

FR_SENTIMENT = {
    "critique": [
        "inacceptable","inadmissible","scandaleux","honteux","catastrophique",
        "nul","terrible","arnaque","résiliation","porter plainte","aberrant",
    ],
    "négatif": [
        "problème","panne","coupure","mauvais","lent","difficile","impossible",
        "ne marche pas","ne fonctionne pas","déçu","insatisfait","gêné",
    ],
    "positif": [
        "merci","bien","bon","excellent","parfait","satisfait","rapide","bravo",
    ],
}

FR_URGENCY = [
    "urgence","immédiatement","tout de suite","bloqué","impossible",
    "hôpital","danger","critique","sos",
]

FR_STOPS = {
    "le","la","les","un","une","des","de","du","en","et","est","au","aux",
    "ce","se","je","tu","il","nous","vous","ils","mon","ma","mes","ton",
    "que","qui","pour","par","avec","sur","dans","ne","pas","plus","très",
    "bien","tout","même","si","mais","depuis","lors","jai","cest","na",
}

# ── ARABIC ────────────────────────────────────────────────────────────────────
AR_CATEGORIES = {
    "الشبكة / التغطية": [
        "لا شبكة","انقطاع الشبكة","ضعف التغطية","لا إشارة","شبكة مقطوعة",
        "لا تغطية","إشارة ضعيفة","الشبكة واقعة","لا 4g","لا 3g",
        "تغطية سيئة","الشبكة لا تعمل","انقطاع متكرر",
    ],
    "الصبيب / الأنترنت": [
        "أنترنت بطيء","صبيب ضعيف","اتصال بطيء","تحميل بطيء",
        "أنترنت منقطع","لا أنترنت","اتصال غير مستقر","سرعة ضعيفة",
        "أنترنت لا يعمل","انقطاع الأنترنت","ميغابت",
    ],
    "المكالمات / الصوت": [
        "المكالمة منقطعة","انقطاع المكالمات","لا يمكن الاتصال",
        "جودة صوت سيئة","صدى","ضجيج","المكالمة لا تمر","فشل المكالمة",
        "مكالمة مقطوعة","لا أسمع","اتصال صوتي",
    ],
    "الفاتورة": [
        "فاتورة","خصم مجحف","رصيد","شحن","خطأ في الفاتورة",
        "تسعير","اشتراك","خصم","رصيد غير صحيح",
    ],
    "دعم العملاء": [
        "خدمة العملاء","انتظار","لا رد","شكوى غير محلولة",
        "لا استجابة","خط ساخن","موظف",
    ],
}

AR_SENTIMENT = {
    "حرج": [
        "لا يقبل","فضيحة","كارثي","مرفوض","سيء جدا","مشكلة كبيرة",
        "غير مقبول","رديء","فاضح",
    ],
    "سلبي": [
        "مشكلة","عطل","انقطاع","بطيء","صعب","مستحيل","لا يعمل",
        "تعطل","غير راضي","متضايق",
    ],
    "إيجابي": [
        "شكرا","ممتاز","جيد","رائع","راضي","سريع","أحسنتم",
    ],
}

AR_URGENCY = [
    "عاجل","فورا","الآن","خطر","حرج","طوارئ","ضروري","مستعجل",
]

AR_CITIES = {
    "تونس","صفاقس","سوسة","القيروان","بنزرت","قابس","أريانة",
    "قفصة","المنستير","بن عروس","نابل","القصرين","سيدي بوزيد",
    "المهدية","منوبة","جندوبة","سليانة","زغوان","باجة","الكاف",
    "قبلي","توزر","تطاوين","مدنين",
}

AR_STOPS = {
    "في","من","إلى","على","عن","مع","هذا","هذه","التي","الذي",
    "و","أو","لكن","لأن","كان","كانت","هو","هي","نحن","أنا",
    "أن","إن","قد","لقد","لا","ما","كل",
}

# ── ENGLISH ───────────────────────────────────────────────────────────────────
EN_CATEGORIES = {
    "Network / Coverage": [
        "no network","no signal","no coverage","dead zone","network down",
        "weak signal","network drop","no 4g","no 3g","network unavailable",
        "signal lost","poor coverage","network cut","out of service",
    ],
    "Data / Internet": [
        "slow internet","slow connection","low speed","buffering","lag",
        "no internet","internet down","connection drop","disconnecting",
        "unstable connection","download slow","mbps","bandwidth",
    ],
    "Calls / Voice": [
        "call drops","call failed","cannot call","voice quality","echo",
        "noise","call cut","call disconnected","no dial tone",
        "can't make calls","volte","call breaking up",
    ],
    "SMS": [
        "sms not received","sms not delivered","message failed",
        "text not sent","sms blocked",
    ],
    "Billing": [
        "invoice","overcharged","billing error","recharge","balance wrong",
        "plan","credit","wrong charge","deducted",
    ],
    "Customer Support": [
        "customer service","waiting","no response","complaint not resolved",
        "hotline","callback","agent","support",
    ],
}

EN_SENTIMENT = {
    "critical": [
        "unacceptable","terrible","awful","outrageous","disgusting",
        "worst","horrible","cancel","lawsuit","scam","fraud",
    ],
    "negative": [
        "problem","issue","broken","slow","bad","impossible","doesn't work",
        "not working","disappointed","unhappy","frustrated","annoyed",
    ],
    "positive": [
        "thank","good","great","excellent","perfect","satisfied","fast",
        "well done","awesome",
    ],
}

EN_URGENCY = [
    "urgent","immediately","right now","blocked","critical","emergency",
    "asap","danger","sos",
]

EN_STOPS = {
    "the","a","an","is","are","was","were","be","been","have","has","had",
    "do","does","did","will","would","could","should","may","might","i",
    "my","your","his","her","our","their","it","this","that","these",
    "those","and","or","but","for","so","yet","nor","in","on","at",
    "to","of","with","by","from","up","about","into","through","during",
}

TN_CITIES_EN = {
    "tunis","sfax","sousse","kairouan","bizerte","gabes","ariana",
    "gafsa","monastir","ben arous","nabeul","kasserine","sidi bouzid",
    "mahdia","manouba","jendouba","siliana","zaghouan","beja","kef",
    "kebili","tozeur","tataouine","medenine","hammamet","zarzis","djerba",
}

TN_CITIES_FR = {
    "tunis","sfax","sousse","kairouan","bizerte","gabès","gabes","ariana",
    "gafsa","monastir","ben arous","nabeul","kasserine","sidi bouzid",
    "mahdia","manouba","jendouba","siliana","zaghouan","béja","beja",
    "kef","kebili","tozeur","tataouine","medenine","mednine","hammamet",
    "zarzis","djerba","la marsa","el kram","carthage",
}

NETWORK_TYPES_ALL = {"4g","5g","3g","2g","volte","lte","wifi","fibre",
                     "4G","5G","3G","2G","LTE","VoLTE"}


# ══════════════════════════════════════════════════════════════════════════════
# PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

class MultilingualNLPPipeline:
    """
    Analyze complaints in Arabic, French, or English.
    No translation — each language uses its own lexicon.
    """

    def analyze(self, text: str) -> dict:
        if not text or not isinstance(text, str) or len(text.strip()) < 3:
            return self._empty(text)

        lang = detect_language(text)
        text_clean = self._preprocess(text, lang)

        category  = self._category(text_clean, lang)
        sentiment = self._sentiment(text_clean, lang)
        urgency   = self._urgency(text_clean, lang, sentiment)
        entities  = self._entities(text_clean, lang)
        keywords  = self._keywords(text_clean, lang)

        # Map Arabic sentiment labels to English for unified storage
        sent_map_ar = {"حرج": "critique", "سلبي": "négatif", "إيجابي": "positif"}
        sent_map_en = {"critical": "critique", "negative": "négatif", "positive": "positif"}
        if lang == "ar":
            sentiment = sent_map_ar.get(sentiment, sentiment)
        elif lang == "en":
            sentiment = sent_map_en.get(sentiment, sentiment)

        return {
            "text":           text,
            "language":       lang,
            "category":       category,
            "sentiment":      sentiment,
            "urgency_score":  urgency["score"],
            "urgency_level":  urgency["level"],
            "city":           entities.get("city"),
            "network_type":   entities.get("network_type"),
            "keywords":       keywords,
            "processed_at":   datetime.now().isoformat(),
        }

    # ── Preprocessing ──────────────────────────────────────────────────────
    def _preprocess(self, text: str, lang: str) -> str:
        if lang == "ar":
            # Normalize Arabic
            text = re.sub(r'[إأآا]', 'ا', text)
            text = re.sub(r'ى', 'ي', text)
            text = re.sub(r'ة', 'ه', text)
            text = re.sub(r'[^\w\s\u0600-\u06FF]', ' ', text)
        else:
            text = text.lower()
            text = re.sub(r'[^\w\s\-\']', ' ', text)
        return re.sub(r'\s+', ' ', text).strip()

    # ── Category ───────────────────────────────────────────────────────────
    def _category(self, text: str, lang: str) -> str:
        lexicon = (AR_CATEGORIES if lang == "ar"
                   else EN_CATEGORIES if lang == "en"
                   else FR_CATEGORIES)
        scores = {cat: sum(1 for kw in kws if kw in text)
                  for cat, kws in lexicon.items()}
        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else ("أخرى" if lang == "ar"
                                               else "Other" if lang == "en"
                                               else "Autre")

    # ── Sentiment ──────────────────────────────────────────────────────────
    def _sentiment(self, text: str, lang: str) -> str:
        lexicon = (AR_SENTIMENT if lang == "ar"
                   else EN_SENTIMENT if lang == "en"
                   else FR_SENTIMENT)
        scores = {s: sum(1 for kw in kws if kw in text)
                  for s, kws in lexicon.items()}
        keys = list(lexicon.keys())
        # Priority: first key = most severe
        for k in keys:
            if scores[k] > 0:
                return k
        return ("محايد" if lang == "ar"
                else "neutral" if lang == "en"
                else "neutre")

    # ── Urgency ────────────────────────────────────────────────────────────
    def _urgency(self, text: str, lang: str, sentiment: str) -> dict:
        base = {
            "critique": 0.7, "négatif": 0.4, "neutre": 0.2, "positif": 0.1,
            "حرج": 0.7, "سلبي": 0.4, "محايد": 0.2, "إيجابي": 0.1,
            "critical": 0.7, "negative": 0.4, "neutral": 0.2, "positive": 0.1,
        }
        score = base.get(sentiment, 0.2)

        urg_kws = (AR_URGENCY if lang == "ar"
                   else EN_URGENCY if lang == "en"
                   else FR_URGENCY)
        for kw in urg_kws:
            if kw in text:
                score = min(score + 0.25, 1.0)

        # Duration boost
        days = re.findall(r'(\d+)\s*(?:days?|jours?|أيام|يوم)', text)
        if days:
            score = min(score + int(days[0]) * 0.04, 1.0)

        score = round(score, 3)
        level = ("très urgent" if score >= 0.8
                 else "urgent" if score >= 0.5
                 else "normal")
        return {"score": score, "level": level}

    # ── Entity extraction ──────────────────────────────────────────────────
    def _entities(self, text: str, lang: str) -> dict:
        ents: dict = {"city": None, "network_type": None}

        # Network type (universal — digits + letters)
        for nt in ["5g","4g","3g","2g","volte","lte","wifi","fibre"]:
            if nt in text.lower():
                ents["network_type"] = nt.upper()
                break

        # City
        if lang == "ar":
            for city in AR_CITIES:
                if city in text:
                    ents["city"] = city
                    break
        elif lang == "en":
            for city in TN_CITIES_EN:
                if city in text.lower():
                    ents["city"] = city.title()
                    break
        else:
            for city in TN_CITIES_FR:
                if city in text.lower():
                    ents["city"] = city.title()
                    break

        return ents

    # ── Keywords ───────────────────────────────────────────────────────────
    def _keywords(self, text: str, lang: str, top_n: int = 5) -> list[str]:
        stops = (AR_STOPS if lang == "ar"
                 else EN_STOPS if lang == "en"
                 else FR_STOPS)
        words = re.findall(r'\b\w{3,}\b', text)
        words = [w for w in words if w not in stops]
        freq  = {}
        for w in words:
            freq[w] = freq.get(w, 0) + 1
        return sorted(freq, key=freq.get, reverse=True)[:top_n]

    def _empty(self, text) -> dict:
        return {
            "text": text, "language": "fr", "category": "Autre",
            "sentiment": "neutre", "urgency_score": 0.0,
            "urgency_level": "normal", "city": None,
            "network_type": None, "keywords": [],
            "processed_at": datetime.now().isoformat(),
        }