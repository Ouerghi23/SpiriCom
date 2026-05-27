"""
SpiriCom – KPI Synthetic Generator (Real Complaints Edition)
=============================================================
Reads real_complaints.csv → extracts MSISDNs + complaint metadata
→ generates one degraded KPI row per complaint
→ adds healthy background rows (40%)
→ outputs kpi_from_real.csv with the EXACT column schema requested.

Usage:
    python generate_kpi_from_real.py \
        --complaints real_complaints.csv \
        --output     kpi_from_real.csv \
        --healthy_ratio 0.4
"""

import argparse
import pandas as pd
import numpy as np
import random
import string
from datetime import datetime, timedelta

# ═══════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

# Exact output column order (as requested)
OUTPUT_COLUMNS = [
    "TIMEE","imsi","msisdn","usim_flag","mcc","mnc","roaming_direction",
    "tac","model","tertype","brand","sim_capability","generation","volte_flag",
    "traffic_2g","traffic_3g","traffic_4g","reserved_field3","duration",
    "voice_onlinetime_3g","voice_onlinetime_2g","Dou_Total","game_traffic",
    "Streaming_traffic","IM_traffic","Web_Browsing_traffic","Other_traffic",
    "VoIP_traffic","SMS_traffic","TikTok_traffic","Instagram_traffic",
    "Facebook_traffic","Facebook_Messenger_traffic","HTTPS_traffic",
    "QUIC_IETF_traffic","YouTube_traffic","Google_Common_traffic",
    "WhatsApp_traffic","GoogleSearch_traffic","FreeFire_traffic","PUBG_traffic",
    "night_traffic","day_traffic","late_night_traffic","usertype","home_cell",
    "home_site","SITE_NAME","LAYER1NAME","LAYER2NAME","LAYER3NAME",
    "RAN_NE_VENDOR","longitude","latitude",
    "video_streaming_download_throughput","Video_xkb_start_delay",
    "Video_Streaming_Start_Success_Rate","Video_Streaming_Start_Delay",
    "Video_Streaming_Stall_Frequency","Page_Response_Success_Rate",
    "Page_Response_Delay","Page_Browsing_Success_Rate","Page_Browsing_Delay",
    "Page_Download_Throughput","VoIP_Voice_Uplink_Throughput",
    "VoIP_Voice_Downlink_Throughput","VoIP_Video_Uplink_Throughput",
    "VoIP_Video_Downlink_Throughput","File_Sharing_Response_Delay",
    "File_Sharing_Upload_Throughput","File_Sharing_Download_Throughput",
    "Multimedia_Response_Delay","Multimedia_Uplink_Throughput",
    "Multimedia_Downlink_Throughput","e2e_delay_ms","client_rtt_ms",
    "server_rtt_ms","Client_Packet_Loss_Rate","SERVER_Packet_Loss_Rate",
    "IM_interactive_delay","TCP_connection_sr","SYN_ACK_ACK_delay",
    "SYN_SYN_ACK_delay","Https_Handshake_Success_Rate",
    "UDP_Uplink_Packet_Intervals_ms","UDP_Downlink_Packet_Intervals_ms",
    "UDP_Uplink_Jitter","UDP_Downlink_Jitter","QUIC_Uplink_Packet_Loss_Rate",
    "QUIC_Downlink_Packet_Loss_Rate","QUIC_Uplink_Out_of_Order_Rate",
    "QUIC_Downlink_Out_of_Order_Rate","E_RAB_SR","S1_MME_SR","S1_MME_Auth_SR",
    "S1_MME_DF_EPS_Bearer_Context_Activation_SR","Iu_Attach_SR",
    "IU_PDP_Context_Procedure_Activation_SR","IU_Paging_SR",
    "IU_Auth_ciphering_SR","Gb_Attach_SR",
    "GB_PDP_Context_Procedure_Activation_SR","GB_Paging_SR",
    "GB_Auth_ciphering_SR","S6a_Auth_Info_Obtai_SR","S6a_update_location_SR",
    "CCR_I","CCR_U","CCR_I_GX","CCR_U_GX",
    "Gr_Send_Authentication_Information_SR","Gr_Update_Location_SR",
    "S5_S8_Default_Bearer_Creation_SR","S3S10Context_SR",
    "GnGpCreate_PDP_Context_Procedure_SR","SGs_Location_Update_Success_Rate",
    "SGs_Paging_Success_Rate","SGs_SMS_Origination_Success_Rate",
    "SGs_SMS_Termination_Success_Rate","User_Class","number_of_regions",
    "mobility_class","dns_delay","DNS_SR","reserved_field4","reserved_field5",
    "Speedtest_traffic","nPerf_traffic","apn","reserved_field1","reserved_field2",
    "MSISDN",
]

# ═══════════════════════════════════════════════════════════════════════════
# BASELINE KPI VALUES (healthy network – Tunisia LTE typical)
# ═══════════════════════════════════════════════════════════════════════════

BASELINE = {
    # ── Traffic (MB) ──────────────────────────────────────────────────────
    "traffic_2g":                    (0.5,    0.8,    0,     None),
    "traffic_3g":                    (12.0,   15.0,   0,     None),
    "traffic_4g":                    (250.0,  180.0,  0,     None),
    "Dou_Total":                     (280.0,  190.0,  0,     None),
    "duration":                      (3600,   2400,   0,     None),
    "voice_onlinetime_3g":           (120,    180,    0,     None),
    "voice_onlinetime_2g":           (30,     60,     0,     None),
    # ── App traffic (MB) ──────────────────────────────────────────────────
    "game_traffic":                  (15.0,   25.0,   0,     None),
    "Streaming_traffic":             (80.0,   90.0,   0,     None),
    "IM_traffic":                    (5.0,    8.0,    0,     None),
    "Web_Browsing_traffic":          (30.0,   35.0,   0,     None),
    "Other_traffic":                 (10.0,   15.0,   0,     None),
    "VoIP_traffic":                  (3.0,    5.0,    0,     None),
    "SMS_traffic":                   (0.1,    0.05,   0,     None),
    "TikTok_traffic":                (40.0,   55.0,   0,     None),
    "Instagram_traffic":             (20.0,   28.0,   0,     None),
    "Facebook_traffic":              (12.0,   18.0,   0,     None),
    "Facebook_Messenger_traffic":    (4.0,    6.0,    0,     None),
    "HTTPS_traffic":                 (60.0,   50.0,   0,     None),
    "QUIC_IETF_traffic":             (20.0,   25.0,   0,     None),
    "YouTube_traffic":               (60.0,   80.0,   0,     None),
    "Google_Common_traffic":         (8.0,    10.0,   0,     None),
    "WhatsApp_traffic":              (8.0,    12.0,   0,     None),
    "GoogleSearch_traffic":          (5.0,    7.0,    0,     None),
    "FreeFire_traffic":              (6.0,    9.0,    0,     None),
    "PUBG_traffic":                  (5.0,    8.0,    0,     None),
    "night_traffic":                 (60.0,   80.0,   0,     None),
    "day_traffic":                   (140.0,  100.0,  0,     None),
    "late_night_traffic":            (40.0,   55.0,   0,     None),
    "Speedtest_traffic":             (5.0,    8.0,    0,     None),
    "nPerf_traffic":                 (2.0,    3.0,    0,     None),
    # ── QoE – Video ───────────────────────────────────────────────────────
    "video_streaming_download_throughput": (8000,  3000,  0,  None),  # kbps
    "Video_xkb_start_delay":         (800,   400,    0,     None),    # ms
    "Video_Streaming_Start_Success_Rate": (98.0, 1.5,   0,   100),    # %
    "Video_Streaming_Start_Delay":   (1500,  600,    0,     None),    # ms
    "Video_Streaming_Stall_Frequency":(0.02, 0.03,   0,     None),    # stalls/min
    # ── QoE – Web ─────────────────────────────────────────────────────────
    "Page_Response_Success_Rate":    (97.5,  2.0,    0,     100),
    "Page_Response_Delay":           (300,   150,    0,     None),
    "Page_Browsing_Success_Rate":    (97.0,  2.5,    0,     100),
    "Page_Browsing_Delay":           (800,   400,    0,     None),
    "Page_Download_Throughput":      (5000,  2500,   0,     None),
    # ── QoE – VoIP ────────────────────────────────────────────────────────
    "VoIP_Voice_Uplink_Throughput":  (64,    10,     0,     None),
    "VoIP_Voice_Downlink_Throughput":(64,    10,     0,     None),
    "VoIP_Video_Uplink_Throughput":  (512,   100,    0,     None),
    "VoIP_Video_Downlink_Throughput":(512,   100,    0,     None),
    # ── QoE – File sharing ────────────────────────────────────────────────
    "File_Sharing_Response_Delay":   (200,   100,    0,     None),
    "File_Sharing_Upload_Throughput":(2000,  1000,   0,     None),
    "File_Sharing_Download_Throughput":(4000,2000,   0,     None),
    # ── QoE – Multimedia ──────────────────────────────────────────────────
    "Multimedia_Response_Delay":     (250,   100,    0,     None),
    "Multimedia_Uplink_Throughput":  (1500,  700,    0,     None),
    "Multimedia_Downlink_Throughput":(3000,  1500,   0,     None),
    # ── Latency / RTT ─────────────────────────────────────────────────────
    "e2e_delay_ms":                  (80,    40,     0,     None),
    "client_rtt_ms":                 (45,    25,     0,     None),
    "server_rtt_ms":                 (35,    20,     0,     None),
    "dns_delay":                     (50,    30,     0,     None),
    "SYN_ACK_ACK_delay":             (60,    30,     0,     None),
    "SYN_SYN_ACK_delay":             (40,    20,     0,     None),
    "IM_interactive_delay":          (120,   60,     0,     None),
    # ── Packet loss ───────────────────────────────────────────────────────
    "Client_Packet_Loss_Rate":       (0.005, 0.008,  0,     None),
    "SERVER_Packet_Loss_Rate":       (0.003, 0.005,  0,     None),
    # ── TCP / HTTPS ───────────────────────────────────────────────────────
    "TCP_connection_sr":             (98.5,  1.5,    0,     100),
    "Https_Handshake_Success_Rate":  (98.0,  2.0,    0,     100),
    "DNS_SR":                        (99.0,  1.0,    0,     100),
    # ── UDP ───────────────────────────────────────────────────────────────
    "UDP_Uplink_Jitter":             (8,     5,      0,     None),
    "UDP_Downlink_Jitter":           (10,    6,      0,     None),
    "UDP_Uplink_Packet_Intervals_ms":(20,    8,      0,     None),
    "UDP_Downlink_Packet_Intervals_ms":(22,  9,      0,     None),
    # ── QUIC ──────────────────────────────────────────────────────────────
    "QUIC_Uplink_Packet_Loss_Rate":  (0.01,  0.02,   0,     None),
    "QUIC_Downlink_Packet_Loss_Rate":(0.01,  0.02,   0,     None),
    "QUIC_Uplink_Out_of_Order_Rate": (0.02,  0.03,   0,     None),
    "QUIC_Downlink_Out_of_Order_Rate":(0.02, 0.03,   0,     None),
    # ── Network SR (%) ────────────────────────────────────────────────────
    "E_RAB_SR":                      (98.5,  1.5,    0,     100),
    "S1_MME_SR":                     (99.0,  0.8,    0,     100),
    "S1_MME_Auth_SR":                (99.2,  0.7,    0,     100),
    "S1_MME_DF_EPS_Bearer_Context_Activation_SR": (98.8, 0.9, 0, 100),
    "Iu_Attach_SR":                  (97.5,  2.0,    0,     100),
    "IU_PDP_Context_Procedure_Activation_SR": (97.0, 2.5, 0,  100),
    "IU_Paging_SR":                  (96.5,  2.5,    0,     100),
    "IU_Auth_ciphering_SR":          (98.0,  1.5,    0,     100),
    "Gb_Attach_SR":                  (95.0,  3.5,    0,     100),
    "GB_PDP_Context_Procedure_Activation_SR": (94.5, 4.0, 0,  100),
    "GB_Paging_SR":                  (94.0,  4.5,    0,     100),
    "GB_Auth_ciphering_SR":          (96.0,  3.0,    0,     100),
    "S6a_Auth_Info_Obtai_SR":        (99.5,  0.4,    0,     100),
    "S6a_update_location_SR":        (99.4,  0.5,    0,     100),
    "CCR_I":                         (98.0,  1.5,    0,     100),
    "CCR_U":                         (97.5,  2.0,    0,     100),
    "CCR_I_GX":                      (98.0,  1.5,    0,     100),
    "CCR_U_GX":                      (97.5,  2.0,    0,     100),
    "Gr_Send_Authentication_Information_SR": (98.5, 1.0, 0,  100),
    "Gr_Update_Location_SR":         (98.0,  1.5,    0,     100),
    "S5_S8_Default_Bearer_Creation_SR": (98.0, 1.5,  0,     100),
    "S3S10Context_SR":               (97.0,  2.0,    0,     100),
    "GnGpCreate_PDP_Context_Procedure_SR": (96.5, 2.5, 0,   100),
    "SGs_Location_Update_Success_Rate": (98.5, 1.2,  0,     100),
    "SGs_Paging_Success_Rate":       (97.5,  1.8,    0,     100),
    "SGs_SMS_Origination_Success_Rate": (99.0, 0.8,  0,     100),
    "SGs_SMS_Termination_Success_Rate": (98.5, 1.0,  0,     100),
}

# ═══════════════════════════════════════════════════════════════════════════
# DEGRADATION PROFILES  (sub_category → {kpi: (multiplier, noise_std)})
# multiplier < 1 → decrease (throughput, SR)
# multiplier > 1 → increase (delay, loss, jitter)
# ═══════════════════════════════════════════════════════════════════════════

DEGRADATION = {
    "Réclamation Réseau Mobile Voix": {
        "E_RAB_SR":                        (0.88, 2.5),
        "S1_MME_SR":                       (0.90, 2.0),
        "S1_MME_Auth_SR":                  (0.89, 2.0),
        "voice_onlinetime_3g":             (0.60, 50),
        "voice_onlinetime_2g":             (0.55, 20),
        "e2e_delay_ms":                    (2.20, 30),
        "client_rtt_ms":                   (1.80, 20),
        "server_rtt_ms":                   (1.70, 15),
        "VoIP_Voice_Uplink_Throughput":    (0.70, 15),
        "VoIP_Voice_Downlink_Throughput":  (0.70, 15),
        "UDP_Uplink_Jitter":               (3.0,  8),
        "UDP_Downlink_Jitter":             (3.0,  8),
        "SGs_Location_Update_Success_Rate":(0.85, 3),
        "SGs_Paging_Success_Rate":         (0.82, 4),
        "IU_Paging_SR":                    (0.80, 5),
        "Iu_Attach_SR":                    (0.85, 4),
        "duration":                        (0.65, 600),
    },
    "Réclamation Réseau Mobile Data": {
        "Page_Response_Delay":             (3.50, 150),
        "Page_Browsing_Delay":             (3.00, 200),
        "Page_Download_Throughput":        (0.35, 800),
        "Page_Response_Success_Rate":      (0.88, 3),
        "Page_Browsing_Success_Rate":      (0.86, 4),
        "client_rtt_ms":                   (2.50, 40),
        "server_rtt_ms":                   (2.30, 35),
        "e2e_delay_ms":                    (2.80, 50),
        "TCP_connection_sr":               (0.82, 4),
        "Https_Handshake_Success_Rate":    (0.83, 4),
        "DNS_SR":                          (0.90, 3),
        "dns_delay":                       (3.0,  40),
        "Client_Packet_Loss_Rate":         (5.0,  0.02),
        "SERVER_Packet_Loss_Rate":         (4.0,  0.01),
        "S1_MME_DF_EPS_Bearer_Context_Activation_SR": (0.87, 3),
        "E_RAB_SR":                        (0.91, 2),
        "traffic_4g":                      (0.60, 80),
        "Dou_Total":                       (0.62, 90),
        "File_Sharing_Download_Throughput":(0.40, 800),
        "File_Sharing_Response_Delay":     (2.5,  80),
        "SYN_ACK_ACK_delay":               (2.5,  30),
        "SYN_SYN_ACK_delay":               (2.2,  25),
        "HTTPS_traffic":                   (0.55, 20),
    },
    "G504-Réclamation Réseau Mobile Data 5G": {
        "video_streaming_download_throughput": (0.30, 1500),
        "Video_Streaming_Start_Delay":     (4.0,  500),
        "Video_Streaming_Stall_Frequency": (8.0,  0.05),
        "Video_Streaming_Start_Success_Rate": (0.78, 5),
        "Video_xkb_start_delay":           (3.5,  200),
        "QUIC_Uplink_Packet_Loss_Rate":    (6.0,  0.03),
        "QUIC_Downlink_Packet_Loss_Rate":  (6.0,  0.03),
        "QUIC_Uplink_Out_of_Order_Rate":   (5.0,  0.04),
        "QUIC_Downlink_Out_of_Order_Rate": (5.0,  0.04),
        "QUIC_IETF_traffic":               (0.35, 8),
        "Page_Download_Throughput":        (0.40, 1000),
        "client_rtt_ms":                   (2.0,  30),
        "UDP_Uplink_Jitter":               (4.0,  10),
        "UDP_Downlink_Jitter":             (4.0,  10),
        "Streaming_traffic":               (0.50, 20),
        "YouTube_traffic":                 (0.45, 15),
        "TikTok_traffic":                  (0.45, 12),
    },
    "Réclamation Internet Mobile": {
        "DNS_SR":                          (0.75, 5),
        "dns_delay":                       (5.0,  60),
        "Page_Response_Success_Rate":      (0.72, 8),
        "Page_Response_Delay":             (5.0,  200),
        "TCP_connection_sr":               (0.75, 5),
        "Https_Handshake_Success_Rate":    (0.74, 5),
        "client_rtt_ms":                   (3.5,  60),
        "e2e_delay_ms":                    (4.0,  80),
        "SYN_SYN_ACK_delay":               (4.0,  40),
        "SYN_ACK_ACK_delay":               (4.0,  40),
    },
    "Réclamation Qualité De Réseau Voix": {
        "VoIP_Voice_Uplink_Throughput":    (0.55, 20),
        "VoIP_Voice_Downlink_Throughput":  (0.55, 20),
        "UDP_Uplink_Jitter":               (5.0,  12),
        "UDP_Downlink_Jitter":             (5.0,  12),
        "UDP_Uplink_Packet_Intervals_ms":  (2.5,  10),
        "UDP_Downlink_Packet_Intervals_ms":(2.5,  10),
        "e2e_delay_ms":                    (3.0,  50),
        "IM_interactive_delay":            (2.5,  80),
        "Client_Packet_Loss_Rate":         (4.0,  0.015),
    },
    "B20-Réclamation Réseau 4G Box/Mifi": {
        "traffic_4g":                      (0.25, 50),
        "Page_Download_Throughput":        (0.30, 600),
        "E_RAB_SR":                        (0.80, 5),
        "S1_MME_SR":                       (0.82, 4),
        "client_rtt_ms":                   (3.0,  50),
        "DNS_SR":                          (0.85, 4),
        "video_streaming_download_throughput": (0.40, 1000),
        "Video_Streaming_Stall_Frequency": (5.0,  0.04),
    },
    "001-Echec E/R Sms Internat.": {
        "SGs_SMS_Origination_Success_Rate":(0.50, 10),
        "SGs_SMS_Termination_Success_Rate":(0.55, 10),
        "SGs_Paging_Success_Rate":         (0.75, 6),
        "SMS_traffic":                     (0.30, 0.02),
    },
    "G505-Réclamation Réseau Mobile Voix 5G": {
        "VoIP_Voice_Uplink_Throughput":    (0.60, 15),
        "VoIP_Voice_Downlink_Throughput":  (0.60, 15),
        "UDP_Uplink_Jitter":               (4.0,  10),
        "e2e_delay_ms":                    (2.5,  40),
        "E_RAB_SR":                        (0.85, 3),
        "voice_onlinetime_3g":             (0.70, 30),
    },
    "474-Réc Internet Mobile 3G/4G": {
        "traffic_3g":                      (0.45, 8),
        "traffic_4g":                      (0.50, 60),
        "Iu_Attach_SR":                    (0.78, 5),
        "IU_PDP_Context_Procedure_Activation_SR": (0.75, 5),
        "Gb_Attach_SR":                    (0.75, 6),
        "GB_PDP_Context_Procedure_Activation_SR": (0.72, 6),
        "Page_Response_Delay":             (2.5,  100),
        "e2e_delay_ms":                    (2.0,  40),
        "dns_delay":                       (2.0,  30),
    },
}

# Default profile for unknown sub-categories (generic data degradation)
DEGRADATION["__default__"] = {
    "Page_Response_Delay":  (2.0, 100),
    "e2e_delay_ms":         (1.8, 30),
    "client_rtt_ms":        (1.8, 25),
    "TCP_connection_sr":    (0.90, 3),
    "E_RAB_SR":             (0.92, 2),
}

# ═══════════════════════════════════════════════════════════════════════════
# GEOGRAPHIC LOOKUP  (Tunisia city → lat/lon)
# ═══════════════════════════════════════════════════════════════════════════

CITY_COORDS = {
    "Tunis":(36.8190,10.1658),"La Marsa":(36.8783,10.3246),
    "Le Bardo":(36.8094,10.1500),"La Goulette":(36.8192,10.3046),
    "Sfax":(34.7405,10.7603),"Sakiet Eddaier":(34.8100,10.7500),
    "Sousse":(35.8254,10.6360),"Hammam Sousse":(35.8583,10.5958),
    "Monastir":(35.7772,10.8262),"Msaken":(35.7302,10.5855),
    "Bizerte":(37.2749,9.8740),"Nabeul":(36.4567,10.7350),
    "Hammamet":(36.3996,10.6157),"Kairouan":(35.6781,10.0963),
    "Gafsa":(34.4250,8.7842),"Metlaoui":(34.3225,8.4037),
    "Gabes":(33.8881,10.0975),"Manouba":(36.8100,10.0983),
    "Ben Arous":(36.7533,10.2181),"Ariana":(36.8625,10.1956),
    "Kasserine":(35.1672,8.8299),"Sidi Bouzid":(35.0381,9.4850),
    "Beja":(36.7256,9.1817),"Jendouba":(36.5011,8.7803),
    "Tabarka":(36.9544,8.7580),"Le Kef":(36.1825,8.7148),
    "Siliana":(36.0847,9.3706),"Medenine":(33.3547,10.5053),
    "Djerba":(33.8075,10.8535),"Zarzis":(33.5040,11.1120),
    "Ben Gardane":(33.1392,11.2189),"Tataouine":(32.9289,10.4511),
    "Mahdia":(35.5047,11.0622),"Kebili":(33.7042,8.9652),
    "Tozeur":(33.9197,8.1335),"Zaghouan":(36.4027,10.1434),
    "Hammam Lif":(36.7278,10.3272),"Rades":(36.7697,10.2744),
    "Den Den":(36.8228,10.0811),"Raoued":(36.8880,10.2283),
    "La Soukra":(36.9061,10.2189),"Ksar Hellal":(35.7090,10.8930),
    "Enfidha":(36.1355,10.3776),"El Hamma":(33.8883,9.7992),
    "Redeyef":(34.3775,8.1529),"Moulares":(34.4814,8.2883),
}

SITE_PREFIXES = ["TN_SF","TN_TU","TN_SU","TN_MO","TN_BZ","TN_KA","TN_GA","TN_GF"]
VENDORS       = ["Huawei","Ericsson","Nokia","ZTE"]
VENDOR_W      = [0.55, 0.25, 0.15, 0.05]
LAYERS        = ["L700","L1800","L2100","L2600","L3500","N3500"]
GENERATIONS   = ["2G","3G","4G","5G"]
GEN_W         = [0.02, 0.08, 0.78, 0.12]
BRANDS        = ["Samsung","Huawei","Apple","Xiaomi","OPPO","Tecno","Nokia","Other"]
BRAND_W       = [0.28, 0.22, 0.18, 0.12, 0.08, 0.05, 0.04, 0.03]
USER_TYPES    = ["Heavy","Medium","Light","Inactive"]
UT_W          = [0.20, 0.40, 0.30, 0.10]
MOB_CLASSES   = ["Static","Low","Medium","High"]
USER_CLASSES  = ["Residential","Business","Visitor"]
APNS          = ["internet","mms","ims","corporate"]

# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _clamp(val, lo, hi):
    if lo is not None: val = max(lo, val)
    if hi is not None: val = min(hi, val)
    return val

def _base_row():
    row = {}
    for kpi, (mu, sigma, lo, hi) in BASELINE.items():
        v = np.random.normal(mu, sigma)
        row[kpi] = round(_clamp(v, lo, hi), 4)
    return row

def _degrade(row, sub_cat):
    profile = DEGRADATION.get(sub_cat, DEGRADATION["__default__"])
    for kpi, (mult, noise) in profile.items():
        if kpi not in row:
            continue
        lo = BASELINE[kpi][2] if kpi in BASELINE else 0
        hi = BASELINE[kpi][3] if kpi in BASELINE else None
        v  = row[kpi] * mult + np.random.normal(0, noise)
        row[kpi] = round(_clamp(v, lo, hi), 4)
    return row

def _get_coords(city):
    """Return (lat, lon) with small random jitter."""
    base = None
    if city:
        for k in CITY_COORDS:
            if k.lower() in str(city).lower() or str(city).lower() in k.lower():
                base = CITY_COORDS[k]
                break
    if base is None:
        base = (36.8 + np.random.uniform(-3, 3), 9.8 + np.random.uniform(-2, 2))
    return (round(base[0] + np.random.normal(0, 0.025), 6),
            round(base[1] + np.random.normal(0, 0.025), 6))

def _random_imsi():
    return "60501" + "".join(random.choices(string.digits, k=10))

def _random_site():
    return random.choice(SITE_PREFIXES) + f"_{random.randint(1000,9999)}"

def _categorical_fields(msisdn, timee, city=None):
    gen = random.choices(GENERATIONS, GEN_W)[0]
    lat, lon = _get_coords(city)
    return {
        "imsi":              _random_imsi(),
        "usim_flag":         random.choice([1, 0]),
        "mcc":               605,
        "mnc":               1,
        "roaming_direction": random.choices(["NONE","INBOUND","OUTBOUND"],
                                            weights=[0.92, 0.04, 0.04])[0],
        "tac":               random.randint(20000, 29999),
        "model":             f"Model_{random.randint(100,999)}",
        "tertype":           "Smartphone",
        "brand":             random.choices(BRANDS, BRAND_W)[0],
        "sim_capability":    "4G" if gen in ["4G","5G"] else gen,
        "generation":        gen,
        "volte_flag":        random.choice([1, 0]),
        "usertype":          random.choices(USER_TYPES, UT_W)[0],
        "home_cell":         f"CELL_{random.randint(10000,99999)}",
        "home_site":         _random_site(),
        "SITE_NAME":         _random_site(),
        "LAYER1NAME":        random.choice(LAYERS),
        "LAYER2NAME":        random.choice(LAYERS),
        "LAYER3NAME":        random.choice(LAYERS),
        "RAN_NE_VENDOR":     random.choices(VENDORS, VENDOR_W)[0],
        "longitude":         lon,
        "latitude":          lat,
        "User_Class":        random.choice(USER_CLASSES),
        "number_of_regions": random.randint(1, 5),
        "mobility_class":    random.choice(MOB_CLASSES),
        "apn":               random.choice(APNS),
        # Reserved / null fields
        "reserved_field1":   np.nan,
        "reserved_field2":   np.nan,
        "reserved_field3":   np.nan,
        "reserved_field4":   np.nan,
        "reserved_field5":   np.nan,
        # Identity
        "TIMEE":             timee,
        "msisdn":            str(msisdn),
        "MSISDN":            str(msisdn),
    }

# ═══════════════════════════════════════════════════════════════════════════
# COLUMN DETECTION  – handles different complaint CSV column names
# ═══════════════════════════════════════════════════════════════════════════

def _detect_col(df, candidates):
    """Return first column name from candidates that exists in df (case-insensitive)."""
    lower_map = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
    return None

def _get_complaint_fields(df):
    """Auto-detect column names for the complaint dataset."""
    return {
        "msisdn":   _detect_col(df, ["msisdn","MSISDN","phone","phone_number","numero"]),
        "datetime": _detect_col(df, ["case open datetime","case_open_datetime",
                                     "open_date","date","datetime","TIMEE"]),
        "sub_cat":  _detect_col(df, ["sub category","sub_category","sub_cat",
                                     "sous_categorie","sous categorie"]),
        "city":     _detect_col(df, ["city","ville","City"]),
        "province": _detect_col(df, ["province","Province","gouvernorat"]),
    }

# ═══════════════════════════════════════════════════════════════════════════
# MAIN GENERATOR
# ═══════════════════════════════════════════════════════════════════════════

def generate(complaints_path: str,
             output_path:    str,
             healthy_ratio:  float = 0.40) -> pd.DataFrame:

    print(f"\n{'='*60}")
    print(" SpiriCom – KPI Synthetic Generator")
    print(f"{'='*60}")

    # ── 1. Load complaints ─────────────────────────────────────────────────
    print(f"\n[1/5] Loading complaints: {complaints_path}")
    try:
        df_c = pd.read_csv(complaints_path, encoding="utf-8")
    except UnicodeDecodeError:
        df_c = pd.read_csv(complaints_path, encoding="latin-1")

    print(f"      {len(df_c):,} rows × {df_c.shape[1]} columns")
    print(f"      Columns: {list(df_c.columns)}")

    fields = _get_complaint_fields(df_c)
    print(f"\n      Detected columns:")
    for k, v in fields.items():
        status = "✅" if v else "⚠️  NOT FOUND"
        print(f"        {k:12s} → {v or status}")

    # ── 2. Extract key fields ──────────────────────────────────────────────
    print("\n[2/5] Extracting MSISDNs and complaint metadata...")

    msisdn_col  = fields["msisdn"]
    dt_col      = fields["datetime"]
    subcat_col  = fields["sub_cat"]
    city_col    = fields["city"]

    if msisdn_col is None:
        raise ValueError("Cannot find MSISDN column in complaints file. "
                         "Expected one of: msisdn, MSISDN, phone, numero")

    # Parse datetime
    if dt_col:
        df_c[dt_col] = pd.to_datetime(df_c[dt_col], errors="coerce")

    unique_msisdns = df_c[msisdn_col].dropna().unique()
    print(f"      Unique MSISDNs : {len(unique_msisdns):,}")
    print(f"      Total rows     : {len(df_c):,}")

    # ── 3. Generate degraded KPI rows (one per complaint row) ──────────────
    print("\n[3/5] Generating degraded KPI rows (1 per complaint)...")
    kpi_rows = []

    for i, (_, comp) in enumerate(df_c.iterrows()):
        if i % 5000 == 0:
            print(f"      Processing row {i:,}/{len(df_c):,} ...", end="\r")

        msisdn  = str(comp[msisdn_col])
        timee   = (comp[dt_col].strftime("%Y-%m-%d %H:%M:%S")
                   if dt_col and pd.notnull(comp.get(dt_col)) else
                   datetime(2025, 1, 1).strftime("%Y-%m-%d %H:%M:%S"))
        sub_cat = comp[subcat_col] if subcat_col and pd.notnull(comp.get(subcat_col)) else "__default__"
        city    = comp[city_col]   if city_col   and pd.notnull(comp.get(city_col))   else None

        row = _base_row()
        row = _degrade(row, sub_cat)
        row.update(_categorical_fields(msisdn, timee, city))
        row["has_complaint"]   = 1
        row["complaint_subcat"] = sub_cat
        kpi_rows.append(row)

    print(f"\n      ✅ {len(kpi_rows):,} degraded rows generated")

    # ── 4. Add healthy background rows ────────────────────────────────────
    n_healthy = int(len(df_c) * healthy_ratio)
    print(f"\n[4/5] Generating {n_healthy:,} healthy rows (ratio={healthy_ratio})...")

    start = df_c[dt_col].min() if dt_col else datetime(2025, 1, 1)
    end   = df_c[dt_col].max() if dt_col else datetime(2025, 6, 30)
    if pd.isnull(start): start = datetime(2025, 1, 1)
    if pd.isnull(end):   end   = datetime(2025, 6, 30)
    span_sec = max(int((end - start).total_seconds()), 86400)

    sample_cities = list(CITY_COORDS.keys())

    for _ in range(n_healthy):
        dt  = start + timedelta(seconds=random.randint(0, span_sec))
        ms  = "216" + "".join(random.choices(string.digits, k=10))
        city = random.choice(sample_cities)
        row = _base_row()
        row.update(_categorical_fields(ms, dt.strftime("%Y-%m-%d %H:%M:%S"), city))
        row["has_complaint"]   = 0
        row["complaint_subcat"] = None
        kpi_rows.append(row)

    print(f"      ✅ {n_healthy:,} healthy rows generated")

    # ── 5. Build DataFrame with exact output schema ────────────────────────
    print(f"\n[5/5] Building final DataFrame...")
    df_kpi = pd.DataFrame(kpi_rows)

    # Add any missing columns (fill with NaN)
    for col in OUTPUT_COLUMNS:
        if col not in df_kpi.columns:
            df_kpi[col] = np.nan

    # Select & reorder to exact schema
    df_out = df_kpi[OUTPUT_COLUMNS].copy()

    # Shuffle rows
    df_out = df_out.sample(frac=1, random_state=SEED).reset_index(drop=True)

    df_out.to_csv(output_path, index=False)

    print(f"\n{'='*60}")
    print(f" OUTPUT SUMMARY")
    print(f"{'='*60}")
    print(f"  Rows (total)     : {len(df_out):,}")
    print(f"  Rows (degraded)  : {int(df_kpi.get('has_complaint', pd.Series([0])).sum()):,}")
    print(f"  Rows (healthy)   : {n_healthy:,}")
    print(f"  Columns          : {len(OUTPUT_COLUMNS)}")
    print(f"  File saved to    : {output_path}")
    print(f"  File size        : ~{df_out.memory_usage(deep=True).sum()/(1024**2):.1f} MB in memory")

    # ── Sub-category distribution ──────────────────────────────────────────
    if subcat_col:
        print(f"\n  Sub-category distribution (from complaints):")
        vc = df_c[subcat_col].value_counts()
        for sc, cnt in vc.items():
            print(f"    {str(sc)[:55]:<55} {cnt:>6,}  ({cnt/len(df_c)*100:.1f}%)")

    print(f"\n{'='*60}\n")
    return df_out


# ═══════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SpiriCom KPI Synthetic Generator")
    parser.add_argument("--complaints",    default="real_complaints.csv",
                        help="Path to complaints CSV file")
    parser.add_argument("--output",        default="kpi_from_real.csv",
                        help="Output KPI CSV path")
    parser.add_argument("--healthy_ratio", type=float, default=0.40,
                        help="Ratio of healthy (no-complaint) rows to add (default 0.40)")
    args = parser.parse_args()

    generate(
        complaints_path=args.complaints,
        output_path=args.output,
        healthy_ratio=args.healthy_ratio,
    )