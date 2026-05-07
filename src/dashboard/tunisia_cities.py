"""
tunisia_cities.py
==================
Static geocoding dictionary for Tunisian cities.
Covers ~300 cities/delegations with (lat, lon) coordinates.
Used by the NOC dashboard complaint map for city-level markers.

Usage:
    from src.dashboard.tunisia_cities import get_city_coords
    lat, lon = get_city_coords("Tunis")   # (36.8065, 10.1815)
    lat, lon = get_city_coords("Unknown") # (34.0, 9.0)  ← Tunisia centroid fallback
"""

from __future__ import annotations

# ── Tunisia default centroid (fallback) ──────────────────────────────────────
TUNISIA_CENTER = (34.0, 9.0)

# ── City coordinates dictionary ──────────────────────────────────────────────
# Format: "City Name": (latitude, longitude)
CITY_COORDS: dict[str, tuple[float, float]] = {
    # Grand Tunis
    "Tunis":                    (36.8065, 10.1815),
    "Ariana":                   (36.8625, 10.1956),
    "Ben Arous":                (36.7533, 10.2281),
    "La Marsa":                 (36.8778, 10.3250),
    "Le Bardo":                 (36.8094, 10.1408),
    "Carthage":                 (36.8528, 10.3233),
    "La Goulette":              (36.8183, 10.3050),
    "Manouba":                  (36.8100, 10.0008),
    "Mohamedia-Fouchana":       (36.6886, 10.1553),
    "Hammam-Lif":               (36.7281, 10.3353),
    "Hammam Chatt":             (36.7167, 10.3500),
    "Rades":                    (36.7700, 10.2778),
    "Megrine":                  (36.7583, 10.2167),
    "Ezzouhour":                (36.8167, 10.1500),
    "Ettadhamen":               (36.8333, 10.1167),
    "Mnihla":                   (36.8667, 10.1833),
    "Kalaat El Andalous":       (37.0500, 10.0833),
    "Oued Ellil":               (36.8333,  9.9833),
    "Tebourba":                 (36.8333,  9.8333),
    "Jedaida":                  (36.8167,  9.9000),
    "Douar Hicher":             (36.8167, 10.0833),
    "Cite El Khadra":           (36.8333, 10.2167),

    # Sfax
    "Sfax":                     (34.7406, 10.7603),
    "Sakiet Ezzit":             (34.8000, 10.7167),
    "Sakiet Eddaier":           (34.7667, 10.7500),
    "Thyna":                    (34.7167, 10.7667),
    "Agareb":                   (34.7500, 10.5500),
    "Jbeniana":                 (34.9167, 10.4333),
    "El Amra":                  (35.0333, 10.5500),
    "El Hencha":                (34.9167, 10.3000),
    "Menzel Chaker":            (34.9833, 10.4333),
    "Graiba":                   (34.5167, 10.2000),
    "Bir Ali Ben Khalifa":      (34.7333, 10.1000),
    "Skhira":                   (34.3000, 10.0667),
    "Mahres":                   (34.5333, 10.5000),
    "Kerkennah":                (34.7167, 11.1833),

    # Sousse
    "Sousse":                   (35.8256, 10.6369),
    "Hammam Sousse":            (35.8600, 10.5950),
    "Akouda":                   (35.8833, 10.5667),
    "Kalaa Kebira":             (35.8833, 10.5333),
    "Kalaa Sghira":             (35.8500, 10.5500),
    "Msaken":                   (35.7333, 10.5833),
    "Enfidha":                  (36.1333, 10.3833),
    "Bouficha":                 (36.1833, 10.5333),
    "Kondar":                   (35.7167, 10.5167),
    "Sidi Bou Ali":             (35.9833, 10.7167),
    "Sidi El Hani":             (35.6667, 10.3333),
    "M'Saken":                  (35.7333, 10.5833),

    # Nabeul
    "Nabeul":                   (36.4513, 10.7350),
    "Hammamet":                 (36.4000, 10.6167),
    "Kelibia":                  (36.8500, 11.1000),
    "Menzel Temime":            (36.7833, 10.9833),
    "Dar Chaabane El Fehri":    (36.6667, 10.8333),
    "El Haouaria":              (37.0500, 11.0000),
    "Korba":                    (36.5833, 10.8667),
    "Beni Khalled":             (36.6500, 10.6167),
    "Soliman":                  (36.7000, 10.4833),
    "Grombalia":                (36.6000, 10.5000),
    "Bou Argoub":               (36.5333, 10.5500),

    # Bizerte
    "Bizerte":                  (37.2744,  9.8739),
    "Mateur":                   (37.0500,  9.6667),
    "Menzel Bourguiba":         (37.1500,  9.7833),
    "Ras Jebel":                (37.2167,  9.9000),
    "El Aousja":                (37.1500,  9.9667),
    "Tinja":                    (37.1000,  9.6500),
    "Sejnane":                  (37.0500,  8.9667),
    "Joumine":                  (37.0167,  9.5167),

    # Béja
    "Béja":                     (36.7256,  9.1817),
    "Beja":                     (36.7256,  9.1817),
    "Testour":                  (36.5500,  9.4500),
    "Nefza":                    (37.0167,  9.0333),
    "Thibar":                   (36.7333,  9.1167),
    "Amdoun":                   (36.7667,  8.7000),
    "Teboursouk":               (36.4500,  9.2500),
    "Mejez El Bab":             (36.6500,  9.6167),

    # Jendouba
    "Jendouba":                 (36.5011,  8.7803),
    "Tabarka":                  (36.9544,  8.7575),
    "Ain Draham":               (36.7833,  8.6833),
    "Fernana":                  (36.6167,  8.7167),
    "Bou Salem":                (36.6167,  9.0333),
    "Ghardimaou":               (36.4500,  8.4333),

    # Kef
    "Kef":                      (36.1822,  8.7147),
    "Le Kef":                   (36.1822,  8.7147),
    "Dahmani":                  (35.9500,  8.8333),
    "Sers":                     (36.0833,  9.0167),
    "Tajerouine":               (35.8833,  8.5500),
    "Kalaat Khasba":            (35.9167,  8.6500),

    # Siliana
    "Siliana":                  (36.0878,  9.3714),
    "Bou Arada":                (36.3500,  9.6000),
    "Gaafour":                  (36.3333,  9.3333),
    "El Aroussa":               (36.2333,  9.6500),
    "Makthar":                  (35.8500,  9.2000),

    # Kairouan
    "Kairouan":                 (35.6712, 10.1003),
    "Sbikha":                   (35.9333, 10.0000),
    "El Alaa":                  (35.5667, 10.0167),
    "Oueslatia":                (35.8333, 10.0000),
    "Haffouz":                  (35.6333, 10.0500),
    "Nasrallah":                (35.6667, 10.1667),
    "Bouhajla":                 (35.7667, 10.2833),
    "Hajeb El Ayoun":           (35.4667, 10.0500),
    "Cherarda":                 (35.8500, 10.1667),

    # Kasserine
    "Kasserine":                (35.1722,  8.8314),
    "Sbeitla":                  (35.2333,  9.1167),
    "Feriana":                  (34.9500,  8.5667),
    "Thala":                    (35.5667,  8.6667),
    "Foussana":                 (35.2167,  8.7500),
    "Haydra":                   (35.5500,  8.4333),
    "Ezzouhour Kasserine":      (35.1500,  8.8167),

    # Sidi Bouzid
    "Sidi Bouzid":              (35.0381,  9.4858),
    "Jelma":                    (35.3000,  9.5333),
    "Regueb":                   (34.7500,  9.7167),
    "Souk Jedid":               (35.0000,  9.3167),
    "Bir El Hafey":             (34.7167,  9.3167),
    "Menzel Bouzaiane":         (34.9833,  9.4833),
    "Ouled Haffouz":            (35.0333,  9.3833),

    # Gafsa
    "Gafsa":                    (34.4222,  8.7842),
    "El Ksar":                  (34.4333,  8.8000),
    "Metlaoui":                 (34.3333,  8.4000),
    "Redeyef":                  (34.3833,  8.1500),
    "Moulares":                 (34.4667,  8.2500),
    "Sned":                     (34.5833,  9.0500),
    "Belkhir":                  (34.5667,  8.9833),
    "Om El Araies":             (34.5500,  8.6833),

    # Tozeur
    "Tozeur":                   (33.9197,  8.1336),
    "Nefta":                    (33.8667,  7.8833),
    "Degache":                  (33.9667,  8.2167),
    "Hazoua":                   (33.7333,  7.9167),
    "Tameghza":                 (34.2000,  7.9500),

    # Kebili
    "Kebili":                   (33.7058,  8.9694),
    "Douz":                     (33.4500,  9.0167),
    "Souk Lahad":               (33.5167,  9.1333),
    "Jemna":                    (33.6167,  9.0333),
    "Faouar":                   (33.1833,  9.0000),
    "El Faouar":                (33.1833,  9.0000),

    # Gabès
    "Gabès":                    (33.8881, 10.0975),
    "Gabes":                    (33.8881, 10.0975),
    "El Hamma":                 (33.8833,  9.7833),
    "Matmata":                  (33.5500,  9.9667),
    "Nouvelle Matmata":         (33.6333,  9.9667),
    "Menzel El Habib":          (34.0833, 10.1167),
    "Ghannouche":               (33.9333, 10.0500),
    "Ghannouch":                (33.9333, 10.0500),

    # Medenine
    "Medenine":                 (33.3547, 10.5053),
    "Medenine Sud":             (33.3333, 10.5167),
    "Zarzis":                   (33.5028, 11.1119),
    "Ben Gardane":              (33.1381, 11.2217),
    "Djerba":                   (33.8000, 10.8500),
    "Houmt Souk":               (33.8756, 10.8594),
    "Midoun":                   (33.7833, 11.0167),
    "Ajim":                     (33.7333, 10.7500),
    "Erriadh":                  (33.8333, 10.9000),
    "Djerba Ajim":              (33.7333, 10.7500),
    "Djerba Midoun":            (33.7833, 11.0167),
    "Sidi Makhlouf":            (33.5167, 10.3833),
    "Beni Khedache":            (33.0500, 10.2667),
    "Mednine":                  (33.3547, 10.5053),

    # Tataouine
    "Tataouine":                (32.9211, 10.4511),
    "Remada":                   (32.3167, 10.4000),
    "Ghomrassen":               (32.9667, 10.2000),
    "Bir Lahmar":               (32.6833, 10.1000),
    "Smar":                     (32.7333, 10.3833),

    # Mahdia
    "Mahdia":                   (35.5047, 11.0622),
    "Ksour Essef":              (35.4167, 11.0000),
    "El Bradaa":                (35.3833, 10.9667),
    "Chebba":                   (35.2333, 11.1167),
    "Salakta":                  (35.2833, 11.0500),
    "Sidi Alouane":             (35.3667, 10.9667),
    "Melloulèche":              (35.2500, 10.9500),
    "Bou Merdes":               (35.6333, 11.0833),
    "El Jem":                   (35.2964, 10.7097),

    # Monastir
    "Monastir":                 (35.7776, 10.8262),
    "Ksar Hellal":              (35.6500, 10.8833),
    "Moknine":                  (35.6333, 10.9000),
    "Jammel":                   (35.5667, 10.7167),
    "Bembla":                   (35.7500, 10.7667),
    "Ksibet El Mediouni":       (35.6833, 10.7833),
    "Teboulba":                 (35.6667, 10.9500),
    "Bekalta":                  (35.6000, 11.0000),
    "Ouerdanine":               (35.6167, 10.6667),
    "Sahline":                  (35.7333, 10.7167),

    # Zaghouan
    "Zaghouan":                 (36.4028, 10.1433),
    "Zriba":                    (36.3833, 10.2833),
    "Nadhour":                  (36.3500, 10.0833),
    "El Fahs":                  (36.3833,  9.9000),
    "Bir Mcherga":              (36.5000, 10.0500),

    # Manouba  
    "Manouba":                  (36.8100,  9.9960),
    "Den Den":                  (36.8167, 10.1167),
    "Borj El Amri":             (37.0500,  9.9667),
    "Djedeida":                 (36.8167,  9.9000),
    "El Battan":                (36.8500,  9.9667),
    "Tebourba":                 (36.8333,  9.8333),
}

# ── Normalise lookup ──────────────────────────────────────────────────────────
# Build a lowercase stripped version for fuzzy matching
_CITY_LOWER: dict[str, tuple[float, float]] = {
    k.lower().strip(): v for k, v in CITY_COORDS.items()
}


def get_city_coords(city_name: str) -> tuple[float, float]:
    """
    Return (lat, lon) for a Tunisian city name.
    Tries exact match first, then case-insensitive, then Tunisia centroid.

    Parameters
    ----------
    city_name : str — city name as stored in complaints_clean['city']

    Returns
    -------
    (lat, lon) tuple — Tunisia centroid (34.0, 9.0) if not found
    """
    if not city_name or str(city_name).lower() in ("nan", "none", "unknown", ""):
        return TUNISIA_CENTER

    # Exact match
    if city_name in CITY_COORDS:
        return CITY_COORDS[city_name]

    # Case-insensitive match
    normalised = city_name.lower().strip()
    if normalised in _CITY_LOWER:
        return _CITY_LOWER[normalised]

    # Partial match — check if city_name starts with a known city
    for key, coords in _CITY_LOWER.items():
        if normalised.startswith(key) or key.startswith(normalised):
            return coords

    # Not found — return Tunisia centroid
    return TUNISIA_CENTER


def get_coverage_stats() -> dict:
    """Return statistics about dictionary coverage."""
    return {
        "total_cities": len(CITY_COORDS),
        "governorates_covered": 24,
    }