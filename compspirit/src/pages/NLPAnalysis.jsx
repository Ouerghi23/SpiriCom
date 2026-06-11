// src/pages/NLPAnalysis.jsx
// ─────────────────────────────────────────────────────────────────────
// SpiriCom NOC Dashboard — NLP Complaint Feed (v2, UI.jsx aligned)
//
// MIGRATION (vs previous version):
//  NL-1  Duplicated HW / gapColor / SectionLabel / StatBlock /
//        ChartPanel removed — imported from components/UI. Modal and
//        Toast use useTranslation/useTheme internally (T/t/mode props
//        dropped). nlp-pulse → noc-pulse; hover lifts via noc-stat /
//        noc-panel classes from <NocBaseStyles/>.
//  NL-2  SEVERITY DATA NOW USES THE ALARM LADDER:
//        · Urgency: très urgent→critical, urgent→major, normal→normal
//        · Sentiment: critique→critical, négatif→major, neutre→muted,
//          positif→normal
//        · Status: open→critical, in_progress→minor, resolved→normal
//        One URGENCY/SENT/STATUS map drives toasts, modal, table
//        chips, KPI tiles and charts — no per-surface drift.
//  NL-3  LANGUAGE IS CATEGORICAL, NOT SEVERITY. Arabic was rendered
//        in alarm red (and French cyan / English green) — wrong
//        semantics. Languages now use neutral categorical hues:
//        ar→blue, fr→purple, en→teal; table badges follow.
//  NL-4  Red discipline: table accent, complaint-ID color, pagination
//        active/hover, refresh button → blue (chrome/selection, not
//        alarm). Complaint rows get an URGENCY-colored left edge —
//        the table now scans by severity at a glance. Toast accent =
//        urgency severity for complaints, blue for feedback. The hero
//        h1 italic accent stays the page's one brand-red element.
//        Delete stays red — destructive action is the convention.
//  NL-5  catChart red-family ramp → blueRamp (counts are magnitude);
//        typeChart complaint slice → ALARM.critical vs feedback blue.
//  NL-6  ActionBtn ghost/default used hardcoded white-alpha — invisible
//        text in light mode. Theme-aware now; variants renamed to
//        semantic tokens (minor/normal/critical/criticalSolid/blue/
//        ghost); hover via CSS class.
//  NL-7  Polling fixed: the 5s auto-refresh no longer flips the
//        global `loading` flag (silent background fetch) and skips
//        ticks while the tab is hidden. alert() error popups →
//        inline fetchError banner. Lucide ChevronLeft/Right replace
//        inline pagination SVGs. ● glyph → dot span.
//  NL-8  Typography floor ≥10px for data labels.
// ─────────────────────────────────────────────────────────────────────

import { Link, useLocation }            from 'react-router-dom'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation }               from 'react-i18next'
import ReactApexChart                   from 'react-apexcharts'
import {
  MessageSquare, Globe, AlertTriangle, Check, X, RefreshCw,
  ExternalLink, Trash2, Filter, ArrowUpDown, Tag, Percent,
  ChevronDown, ChevronLeft, ChevronRight, Phone, Calendar, Wifi,
  User, Hash, MapPin, Zap, Key, Radio, Search, Bell,
} from 'lucide-react'
import {
  HW, ALARM, FONT, gapColor, gridLine, blueRamp,
  SectionLabel, StatBlock, ChartPanel, GapGrid,
  Badge, Spinner, EmptyState, baseChartOptions, sevDim, sevBd,
} from '../components/UI'
import { useTheme } from '../context/ThemeContext'
import { nlpApi }   from '../api/client'

// ── NL-2: severity maps — one source for every surface ───────────────
const URGENCY = {
  'très urgent': ALARM.critical,
  'urgent':      ALARM.major,
  'normal':      ALARM.normal,
}
const urgencyStyle = level => {
  const c = URGENCY[level] || ALARM.normal
  return { background: sevDim(c, '12'), color: c, border: `1px solid ${sevBd(c)}` }
}

const SENT_COLORS = {
  critique: ALARM.critical,
  'négatif': ALARM.major,
  neutre:   ALARM.unknown,
  positif:  ALARM.normal,
}
const SENT_BADGE = {
  critique: 'critical', 'négatif': 'major', positif: 'normal', neutre: 'gray',
}

const STATUS_COLOR = {
  open:        ALARM.critical,
  in_progress: ALARM.minor,
  resolved:    ALARM.normal,
}

// ── NL-3: language is categorical — neutral identity hues ────────────
const LANG_COLORS = { ar: HW.blue, fr: '#8B5CF6', en: '#14B8A6' }
const LANG_BADGE  = { ar: 'blue',  fr: 'purple',  en: 'cyan'    }
const LANG_LABELS = { ar: 'Arabic', fr: 'French', en: 'English' }

// ── Notification helper — POST /api/nlp/notify (ntfy.sh / WhatsApp) ──
async function sendStatusNotification(complaintId, newStatus, msisdn, category) {
  try {
    await fetch('/api/nlp/notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ complaint_id: complaintId, status: newStatus, msisdn, category }),
    })
  } catch {
    console.warn('Notification delivery failed (non-fatal)')
  }
}

// ── Action button (page-local, tokenized — NL-6) ──────────────────────
const ActionBtn = ({ onClick, disabled, children, variant = 'ghost', small = true }) => {
  const { theme: T } = useTheme()
  const V = {
    minor:         { bg: sevDim(ALARM.minor, '14'),    bd: sevBd(ALARM.minor),    fg: ALARM.minor    },
    normal:        { bg: sevDim(ALARM.normal, '14'),   bd: sevBd(ALARM.normal),   fg: ALARM.normal   },
    critical:      { bg: sevDim(ALARM.critical, '12'), bd: sevBd(ALARM.critical), fg: ALARM.critical },
    criticalSolid: { bg: ALARM.critical,               bd: 'transparent',         fg: '#fff'         },
    blue:          { bg: HW.blueDim,                   bd: HW.blueBd,             fg: HW.blue        },
    blueSolid:     { bg: HW.blue,                      bd: 'transparent',         fg: '#fff'         },
    ghost:         { bg: 'transparent',                bd: T.border,              fg: T.textMuted    },
  }
  const v = V[variant] || V.ghost
  return (
    <button className="nlp-action" onClick={onClick} disabled={disabled} style={{
      background: v.bg, border: `1px solid ${v.bd}`, color: v.fg,
      padding: small ? '5px 10px' : '8px 18px', fontSize: 10, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
      transition: 'opacity .2s', display: 'inline-flex', alignItems: 'center', gap: 5,
      whiteSpace: 'nowrap', fontFamily: FONT.body, letterSpacing: '.3px',
    }}>
      {children}
    </button>
  )
}

// ── NotificationToast — NL-4: accent = urgency severity ──────────────
function NotificationToast({ notif, onDismiss }) {
  const { theme: T } = useTheme()
  const { t }        = useTranslation()
  const [progress, setProgress] = useState(100)
  const isComplaint = notif.is_complaint === true
  const accent      = isComplaint
    ? (URGENCY[notif.urgency_level] || ALARM.major)
    : HW.blue
  const DURATION = 8000

  useEffect(() => {
    const start = Date.now()
    const timer = setInterval(() => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / DURATION * 100))
      setProgress(pct)
      if (pct === 0) { clearInterval(timer); onDismiss(notif.id) }
    }, 60)
    return () => clearInterval(timer)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${accent}50`,
      boxShadow: `0 8px 32px rgba(0,0,0,.45)`,
      width: 320, position: 'relative', overflow: 'hidden',
      animation: 'nlp-toast-in .35s cubic-bezier(.22,1,.36,1)', flexShrink: 0 }}>
      <div style={{ height: 2,
        background: `linear-gradient(90deg, ${accent}, ${accent}40, transparent)` }}/>
      <div style={{ padding: '10px 14px 8px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={12} color={accent}/>
          <span style={{ fontSize: 10, fontWeight: 800, color: accent,
            letterSpacing: '2px', textTransform: 'uppercase' }}>
            {isComplaint ? t('nlp.newComplaint') : t('nlp.newFeedback')}
          </span>
        </div>
        <button className="nlp-iconbtn" aria-label="Dismiss"
          onClick={() => onDismiss(notif.id)}
          style={{ background: 'none', border: 'none', color: T.textDim,
            cursor: 'pointer', padding: 2, display: 'flex' }}>
          <X size={12}/>
        </button>
      </div>
      <div style={{ padding: '10px 14px 12px' }}>
        <div style={{ fontFamily: FONT.display, fontSize: 20, fontWeight: 900,
          color: T.text, letterSpacing: '-.3px', marginBottom: 10 }}>
          {notif.complaint_id}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {[
            { label: t('nlp.notifCategory'),  value: notif.category,
              color: HW.blue },
            { label: t('nlp.notifUrgency'),   value: notif.urgency_level,
              color: URGENCY[notif.urgency_level] || ALARM.normal },
            { label: t('nlp.notifLanguage'),  value: notif.language_detected,
              color: LANG_COLORS[notif.language_detected] || T.textMuted },
            { label: t('nlp.notifSentiment'), value: notif.sentiment,
              color: SENT_COLORS[notif.sentiment] || T.textMuted },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 9, color: T.textDim, letterSpacing: '1.5px',
                textTransform: 'uppercase', marginBottom: 2, fontWeight: 700 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: item.color,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.value || '—'}
              </div>
            </div>
          ))}
        </div>
        {notif.city_detected && (
          <div style={{ marginTop: 8, fontSize: 10, color: T.textMuted,
            display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin size={10}/> {notif.city_detected}
          </div>
        )}
        {isComplaint && notif.urgency_level && (
          <div style={{ marginTop: 8 }}>
            <span style={{ ...urgencyStyle(notif.urgency_level), padding: '3px 10px',
              fontSize: 9, fontWeight: 800, letterSpacing: '1px',
              textTransform: 'uppercase', display: 'inline-block' }}>
              {notif.urgency_level}
            </span>
          </div>
        )}
      </div>
      <div style={{ height: 2, background: T.border }}>
        <div style={{ height: '100%', background: accent, width: `${progress}%`,
          transition: 'width .06s linear' }}/>
      </div>
    </div>
  )
}

// ── ComplaintModal — NL-1: hooks internal · NL-4: blue chrome ─────────
function ComplaintModal({ complaint: c, onClose, onStatusUpdate, onDelete,
  actionLoading, confirmDelete, setConfirmDelete }) {
  const { theme: T } = useTheme()
  const { t }        = useTranslation()
  if (!c) return null

  const GAP         = gapColor(T)
  const isActioning = actionLoading === c.complaint_id
  const isComplaint = c.is_complaint !== undefined ? c.is_complaint : null
  const statusLabel = { open: t('nlp.statusOpen'),
    in_progress: t('nlp.statusInProgress'), resolved: t('nlp.statusResolved') }
  const keywords = Array.isArray(c.nlp_keywords) ? c.nlp_keywords : []
  const urgColor = URGENCY[c.nlp_urgency_level] || ALARM.normal

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.bgCard,
        border: `1px solid ${T.border}`, width: '100%', maxWidth: 680,
        maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}>
        {/* NL-4: panel chrome accent — blue */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', padding: '22px 24px 18px',
          borderBottom: `1px solid ${T.border}` }}>
          <div>
            <div style={{ fontSize: 10, color: HW.blue, letterSpacing: '2.5px',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>
              {t('nlp.popupTitle')}
            </div>
            <div style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 900,
              color: T.text, letterSpacing: '-.5px', lineHeight: 1 }}>
              {c.complaint_id}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isComplaint === true  && <Badge variant="critical">{t('nlp.reclamation')}</Badge>}
            {isComplaint === false && <Badge variant="blue">{t('nlp.feedbackBadge')}</Badge>}
            <button className="nlp-close" onClick={onClose} aria-label="Close"
              style={{ background: 'transparent', border: `1px solid ${T.border}`,
                color: T.textMuted, cursor: 'pointer', width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={12}/>
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex',
          flexDirection: 'column', gap: 18 }}>
          {/* Original text */}
          <div style={{ background: T.bgCardHover, border: `1px solid ${T.border}`,
            padding: '14px 16px' }}>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: 10 }}>
              {t('nlp.popupText')}
            </div>
            <p style={{ fontSize: 13, color: T.text, lineHeight: 1.7, margin: 0,
              wordBreak: 'break-word' }}>
              {c.text_original}
            </p>
          </div>

          {/* Contact info */}
          <div style={{ background: T.bgCardHover,
            border: `1px solid ${HW.blueBd}`,
            padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: 12 }}>
              {t('nlp.popupContact')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, background: HW.blueDim,
                  border: `1px solid ${HW.blueBd}`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, borderRadius: 4 }}>
                  <Phone size={14} color={HW.blue}/>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
                    textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>
                    {t('nlp.popupMsisdn')}
                  </div>
                  <div style={{ fontFamily: FONT.display, fontSize: 18,
                    fontWeight: 800, color: HW.blue, letterSpacing: '.5px' }}>
                    {c.msisdn || <span style={{ fontSize: 12, color: T.textDim }}>
                      {t('nlp.popupUnknown')}</span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32,
                  background: 'rgba(139,92,246,.14)',
                  border: '1px solid rgba(139,92,246,.3)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, borderRadius: 4 }}>
                  <User size={14} color="#8B5CF6"/>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
                    textTransform: 'uppercase', fontWeight: 700, marginBottom: 3 }}>
                    {t('nlp.popupSegment')}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textMuted }}>
                    {c.segment || t('nlp.popupUnknown')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* NLP metadata grid */}
          <div>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: 10 }}>
              {t('nlp.popupNlp')}
            </div>
            <GapGrid columns="repeat(3,1fr)">
              {[
                { label: t('nlp.language'),
                  value: LANG_LABELS[c.language] || c.language?.toUpperCase(),
                  color: LANG_COLORS[c.language] || T.textMuted, Icon: Globe },
                { label: t('nlp.category'), value: c.nlp_category,
                  color: HW.blue, Icon: Tag },
                { label: t('nlp.sentiment'), value: c.nlp_sentiment,
                  color: SENT_COLORS[c.nlp_sentiment] || T.textMuted, Icon: Zap },
                { label: t('nlp.popupScore'),
                  value: c.nlp_urgency_score?.toFixed(2) ?? '—',
                  color: urgColor, Icon: Percent },
                { label: t('nlp.city'),
                  value: c.nlp_city || t('nlp.popupUnknown'),
                  color: T.textMuted, Icon: MapPin },
                { label: t('nlp.popupNetwork'),
                  value: c.nlp_network_type || t('nlp.popupUnknown'),
                  color: HW.blueLight, Icon: Wifi },
              ].map(({ label, value, color, Icon }) => (
                <div key={label} style={{ background: T.bgCardHover,
                  padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%',
                    height: 1,
                    background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}/>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 6 }}>
                    <Icon size={10} color={color}/>
                    <span style={{ fontSize: 10, color: T.textDim,
                      letterSpacing: '1.5px', fontWeight: 700,
                      textTransform: 'uppercase' }}>{label}</span>
                  </div>
                  <div style={{ fontFamily: FONT.display, fontSize: 16,
                    fontWeight: 800, color, letterSpacing: '-.3px' }}>{value}</div>
                </div>
              ))}
            </GapGrid>
          </div>

          {/* Urgency */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
              fontWeight: 800, textTransform: 'uppercase' }}>{t('nlp.tableUrg')}</span>
            <span style={{ ...urgencyStyle(c.nlp_urgency_level), padding: '4px 12px',
              fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
              textTransform: 'uppercase' }}>
              {c.nlp_urgency_level}
            </span>
          </div>

          {/* Keywords */}
          {keywords.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
                fontWeight: 800, textTransform: 'uppercase', marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <Key size={10} color={T.textDim}/>{t('nlp.popupKeywords')}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {keywords.map((kw, i) => (
                  <span key={i} style={{ fontSize: 10, padding: '3px 10px',
                    fontWeight: 600,
                    background: T.mode === 'dark'
                      ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)',
                    border: `1px solid ${T.border}`, color: T.textMuted }}>
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div>
            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '2px',
              fontWeight: 800, textTransform: 'uppercase', marginBottom: 10 }}>
              {t('nlp.popupMeta')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {[
                { label: t('nlp.popupDate'),
                  value: c.submitted_at?.slice(0, 16)?.replace('T', ' ') || '—',
                  Icon: Calendar },
                { label: t('nlp.popupChannel'), value: c.channel || '—', Icon: Hash },
                { label: t('nlp.status'),
                  value: statusLabel[c.status] || c.status,
                  Icon: Radio, color: STATUS_COLOR[c.status] },
              ].map(({ label, value, Icon, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5,
                    marginBottom: 4 }}>
                    <Icon size={10} color={T.textDim}/>
                    <span style={{ fontSize: 10, color: T.textDim,
                      letterSpacing: '1.5px', fontWeight: 700,
                      textTransform: 'uppercase' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: color || T.textMuted,
                    fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 8,
            borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
            {c.status !== 'in_progress' && c.status !== 'resolved' && (
              <ActionBtn onClick={() => onStatusUpdate(c.complaint_id, 'in_progress',
                c.msisdn, c.nlp_category)} disabled={isActioning}
                variant="minor" small={false}>
                {t('nlp.enCours')}
              </ActionBtn>
            )}
            {c.status !== 'resolved' && (
              <ActionBtn onClick={() => onStatusUpdate(c.complaint_id, 'resolved',
                c.msisdn, c.nlp_category)} disabled={isActioning}
                variant="normal" small={false}>
                <Check size={12}/> {t('nlp.cloture')}
              </ActionBtn>
            )}
            {confirmDelete === c.complaint_id ? (
              <>
                <ActionBtn onClick={() => onDelete(c.complaint_id)}
                  disabled={isActioning} variant="criticalSolid" small={false}>
                  {t('nlp.confirmer')}
                </ActionBtn>
                <ActionBtn onClick={() => setConfirmDelete(null)}
                  variant="ghost" small={false}><X size={12}/></ActionBtn>
              </>
            ) : (
              <ActionBtn onClick={() => setConfirmDelete(c.complaint_id)}
                disabled={isActioning} variant="critical" small={false}>
                <Trash2 size={12}/> Delete
              </ActionBtn>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <ActionBtn onClick={onClose} variant="ghost" small={false}>
                {t('nlp.popupClose')}
              </ActionBtn>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════
export default function NLPAnalysis() {
  const { t }        = useTranslation()
  const location     = useLocation()
  const { theme: T } = useTheme()
  const GAP          = gapColor(T)
  const base         = useMemo(() => baseChartOptions(T), [T])

  const [stats,          setStats]          = useState(null)
  const [complaints,     setComplaints]     = useState([])
  const [loading,        setLoading]        = useState(true)
  const [fetchError,     setFetchError]     = useState(null)
  const [apiOnline,      setApiOnline]      = useState(true)
  const [actionLoading,  setActionLoading]  = useState(null)
  const [confirmDelete,  setConfirmDelete]  = useState(null)
  const [selectedComp,   setSelectedComp]   = useState(null)
  const [lastRefreshed,  setLastRefreshed]  = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [notifications,  setNotifications]  = useState([])

  const [filterLang,      setFilterLang]      = useState('All')
  const [filterUrgency,   setFilterUrgency]   = useState('All')
  const [filterSentiment, setFilterSentiment] = useState('All')
  const [filterType,      setFilterType]      = useState('All')
  const [searchQuery,     setSearchQuery]     = useState('')

  // NL-7: silent flag — background polls don't flip global loading
  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setFetchError(null)
    try {
      const [statsRes, complaintsRes] = await Promise.all([
        nlpApi.stats(),
        nlpApi.list({
          language:     filterLang      !== 'All' ? filterLang      : undefined,
          urgency:      filterUrgency   !== 'All' ? filterUrgency   : undefined,
          sentiment:    filterSentiment !== 'All' ? filterSentiment : undefined,
          is_complaint: filterType === 'complaint' ? true
                      : filterType === 'feedback'  ? false : undefined,
          limit: 500,
        }),
      ])
      setStats(statsRes.data)
      setComplaints(complaintsRes.data?.complaints || [])
      setApiOnline(true)
      setLastRefreshed(new Date())
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Unknown error'
      setFetchError(`API error: ${msg}`)
      setApiOnline(false)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [filterLang, filterUrgency, filterSentiment, filterType])

  useEffect(() => { fetchData(false) }, [fetchData, location.pathname])
  useEffect(() => { if (refreshTrigger > 0) fetchData(true) }, [refreshTrigger])  // eslint-disable-line react-hooks/exhaustive-deps

  // NL-7: skip polling while tab hidden
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setRefreshTrigger(n => n + 1)
    }, 5_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let bc = null
    try {
      bc = new BroadcastChannel('spiricom')
      bc.onmessage = e => {
        if (e.data?.type === 'new_complaint') {
          setRefreshTrigger(n => n + 1)
          if (e.data.complaint) {
            setNotifications(prev =>
              [...prev.slice(-4), { id: Date.now(), ...e.data.complaint }])
          }
        }
      }
    } catch (_) {}
    return () => { if (bc) bc.close() }
  }, [])

  const dismissNotification = id =>
    setNotifications(prev => prev.filter(n => n.id !== id))

  const PAGE_SIZE = 30
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) },
    [searchQuery, filterLang, filterUrgency, filterSentiment, filterType])

  const filteredComplaints = useMemo(() => {
    if (!searchQuery.trim()) return complaints
    const q = searchQuery.toLowerCase()
    return complaints.filter(c =>
      c.complaint_id?.toLowerCase().includes(q)  ||
      c.text_original?.toLowerCase().includes(q) ||
      c.nlp_category?.toLowerCase().includes(q)  ||
      c.nlp_city?.toLowerCase().includes(q)      ||
      c.msisdn?.toLowerCase().includes(q)        ||
      c.nlp_sentiment?.toLowerCase().includes(q)
    )
  }, [complaints, searchQuery])

  const totalPages      = Math.max(1, Math.ceil(filteredComplaints.length / PAGE_SIZE))
  const pagedComplaints = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredComplaints.slice(start, start + PAGE_SIZE)
  }, [filteredComplaints, page])

  const complaintCount    = stats?.complaint_count     ?? stats?.by_type?.complaint ?? 0
  const nonComplaintCount = stats?.non_complaint_count ?? stats?.by_type?.feedback  ?? 0
  const complaintRate     = (stats?.total || 0) > 0
    ? ((complaintCount / stats.total) * 100).toFixed(1) : '—'

  // ── Charts ────────────────────────────────────────────────────────
  // NL-3: language donut — categorical hues
  const langChart = useMemo(() =>
    stats?.by_language && Object.keys(stats.by_language).length > 0 ? {
      series: Object.values(stats.by_language),
      options: {
        ...base, chart: { ...base.chart, type: 'donut' },
        labels: Object.keys(stats.by_language).map(l => LANG_LABELS[l] || l),
        colors: Object.keys(stats.by_language).map(l => LANG_COLORS[l] || ALARM.unknown),
        stroke: { width: 2, colors: [T.bgCard] },
        plotOptions: { pie: { donut: { size: '68%', labels: { show: true,
          value: { fontFamily: FONT.display, fontSize: '26px', fontWeight: 900,
            color: T.text },
          total: { show: true, label: 'Total', fontSize: '10px', color: T.textMuted,
            formatter: () => String(stats.total || 0) } } } } },
        legend: { position: 'bottom', fontSize: '11px',
          labels: { colors: T.textMuted }, itemMargin: { horizontal: 8 } },
        dataLabels: { enabled: false },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v} ${t('nlp.complaints2')}` } },
      },
    } : null, [stats, base, t, T])

  // NL-2: sentiment donut — severity ladder
  const sentChart = useMemo(() =>
    stats?.by_sentiment && Object.keys(stats.by_sentiment).length > 0 ? {
      series: Object.values(stats.by_sentiment),
      options: {
        ...base, chart: { ...base.chart, type: 'donut' },
        labels: Object.keys(stats.by_sentiment),
        colors: Object.keys(stats.by_sentiment).map(s => SENT_COLORS[s] || ALARM.unknown),
        stroke: { width: 2, colors: [T.bgCard] },
        plotOptions: { pie: { donut: { size: '68%', labels: { show: true,
          value: { fontFamily: FONT.display, fontSize: '26px', fontWeight: 900,
            color: T.text },
          total: { show: true, label: t('nlp.critiques'), fontSize: '10px',
            color: T.textMuted,
            formatter: () => String(stats.by_sentiment?.critique || 0) } } } } },
        legend: { position: 'bottom', fontSize: '11px',
          labels: { colors: T.textMuted }, itemMargin: { horizontal: 8 } },
        dataLabels: { enabled: false },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v} items` } },
      },
    } : null, [stats, base, t, T])

  // NL-5: category bar — magnitude → blueRamp
  const catChart = useMemo(() =>
    stats?.by_category && Object.keys(stats.by_category).length > 0 ? {
      series: [{ data: Object.values(stats.by_category) }],
      options: {
        ...base, chart: { ...base.chart, type: 'bar' },
        plotOptions: { bar: { horizontal: true, borderRadius: 0,
          barHeight: '58%', distributed: true } },
        colors: Object.keys(stats.by_category).map((_, i) => blueRamp(i)),
        xaxis: { categories: Object.keys(stats.by_category),
          labels: { style: { fontSize: '9px', colors: T.textMuted } },
          axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { labels: { style: { fontSize: '10px', colors: T.textMuted },
          maxWidth: 100 } },
        dataLabels: { enabled: true, textAnchor: 'start', offsetX: 8,
          style: { fontSize: '10px', fontWeight: 700, colors: [T.text],
            fontFamily: FONT.display } },
        legend: { show: false },
        grid: { borderColor: gridLine(T), strokeDashArray: 3,
          xaxis: { lines: { show: false } } },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v} ${t('nlp.complaints2')}` } },
      },
    } : null, [stats, base, t, T])

  // NL-5: complaint = problem class → critical; feedback = blue
  const typeChart = useMemo(() =>
    (complaintCount > 0 || nonComplaintCount > 0) ? {
      series: [complaintCount, nonComplaintCount],
      options: {
        ...base, chart: { ...base.chart, type: 'donut' },
        labels: [t('nlp.reclamation'), t('nlp.feedbackBadge')],
        colors: [ALARM.critical, HW.blue],
        stroke: { width: 2, colors: [T.bgCard] },
        plotOptions: { pie: { donut: { size: '68%', labels: { show: true,
          value: { fontFamily: FONT.display, fontSize: '26px', fontWeight: 900,
            color: T.text },
          total: { show: true, label: 'Rate', fontSize: '10px', color: T.textMuted,
            formatter: () => `${complaintRate}%` } } } } },
        legend: { position: 'bottom', fontSize: '11px',
          labels: { colors: T.textMuted }, itemMargin: { horizontal: 8 } },
        dataLabels: { enabled: false },
        tooltip: { theme: T.mode === 'dark' ? 'dark' : 'light',
          y: { formatter: v => `${v} items` } },
      },
    } : null, [complaintCount, nonComplaintCount, complaintRate, base, t, T])

  // NL-2/NL-3: KPI colors — severity for severity, categorical for langs
  const kpiTiles = useMemo(() => [
    { label: 'Total', value: (stats?.total || 0).toLocaleString(),
      color: HW.blue, icon: MessageSquare, sub: t('nlp.kpiTotalSub') },
    { label: t('nlp.kpiComplaint'), value: complaintCount.toLocaleString(),
      color: ALARM.critical, icon: AlertTriangle, sub: t('nlp.kpiComplaintSub') },
    { label: t('nlp.kpiNonComplaint'), value: nonComplaintCount.toLocaleString(),
      color: ALARM.normal, icon: Tag, sub: t('nlp.kpiNonComplaintSub') },
    { label: t('nlp.kpiRate'), value: `${complaintRate}%`,
      color: ALARM.minor, icon: Percent, sub: t('nlp.kpiRateSub') },
    { label: t('nlp.kpiArabic'), value: stats?.by_language?.ar || 0,
      color: LANG_COLORS.ar, icon: Globe, sub: t('nlp.kpiArabicSub') },
    { label: t('nlp.kpiFrench'), value: stats?.by_language?.fr || 0,
      color: LANG_COLORS.fr, icon: Globe, sub: t('nlp.kpiFrenchSub') },
    { label: t('nlp.kpiEnglish'), value: stats?.by_language?.en || 0,
      color: LANG_COLORS.en, icon: Globe, sub: t('nlp.kpiEnglishSub') },
    { label: t('nlp.kpiUrgent'),
      value: stats?.by_urgency_level?.['très urgent'] || 0,
      color: ALARM.critical, icon: AlertTriangle,
      alert: (stats?.by_urgency_level?.['très urgent'] || 0) > 0,
      sub: t('nlp.kpiUrgentSub') },
  ], [stats, complaintCount, nonComplaintCount, complaintRate, t])

  const FILTER_CONFIG = useMemo(() => [
    { id: 'lang', label: t('nlp.langFilter'), value: filterLang, set: setFilterLang,
      options: [{ value: 'All', label: t('nlp.allLang') },
        { value: 'ar', label: t('nlp.arabic') }, { value: 'fr', label: t('nlp.french') },
        { value: 'en', label: t('nlp.english') }] },
    { id: 'urgency', label: t('nlp.urgencyFilter'), value: filterUrgency,
      set: setFilterUrgency,
      options: [{ value: 'All', label: t('nlp.allUrgency') },
        { value: 'très urgent', label: t('nlp.tresUrgent') },
        { value: 'urgent', label: t('nlp.urgentLabel') },
        { value: 'normal', label: t('nlp.normalLabel') }] },
    { id: 'sentiment', label: t('nlp.sentFilter'), value: filterSentiment,
      set: setFilterSentiment,
      options: [{ value: 'All', label: t('nlp.allSentiment') },
        { value: 'critique', label: t('nlp.critique') },
        { value: 'négatif', label: t('nlp.negatif') },
        { value: 'neutre', label: t('nlp.neutre') },
        { value: 'positif', label: t('nlp.positif') }] },
    { id: 'type', label: t('nlp.typeFilter'), value: filterType, set: setFilterType,
      options: [{ value: 'All', label: t('nlp.allTypes') },
        { value: 'complaint', label: t('nlp.complaint') },
        { value: 'feedback', label: t('nlp.feedbackType') }] },
  ], [filterLang, filterUrgency, filterSentiment, filterType, t])

  const lastRefreshedStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString([],
        { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—'

  // ── Handlers — NL-7: inline errors, no alert() ─────────────────────
  const handleStatusUpdate = async (complaintId, newStatus, msisdn, category) => {
    setActionLoading(complaintId)
    try {
      await nlpApi.updateStatus(complaintId, newStatus)
      setComplaints(prev => prev.map(c =>
        c.complaint_id === complaintId ? { ...c, status: newStatus } : c))
      setSelectedComp(prev =>
        prev?.complaint_id === complaintId ? { ...prev, status: newStatus } : prev)
      await sendStatusNotification(complaintId, newStatus, msisdn, category)
    } catch (err) {
      setFetchError(`Status update failed: ${err?.response?.data?.detail || err?.message}`)
    } finally { setActionLoading(null) }
  }

  const handleDelete = async complaintId => {
    setActionLoading(complaintId)
    try {
      await nlpApi.deleteComplaint(complaintId)
      setComplaints(prev => prev.filter(c => c.complaint_id !== complaintId))
      setConfirmDelete(null); setSelectedComp(null)
      nlpApi.stats().then(r => setStats(r.data)).catch(() => {})
    } catch (err) {
      setFetchError(`Delete failed: ${err?.response?.data?.detail || err?.message}`)
    } finally { setActionLoading(null) }
  }

  // ── Loading ───────────────────────────────────────────────────────
  if (loading && !stats) return (
    <div style={{ padding: '40px 48px', background: T.bg, minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: HW.blue,
          display: 'inline-block', animation: 'noc-pulse 1.8s infinite' }}/>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
          textTransform: 'uppercase', color: HW.blue }}>{t('common.loading')}</span>
      </div>
      <Spinner size={48}/>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, minHeight: '100vh', color: T.text,
      transition: 'background .3s' }}>
      <style>{`
        @keyframes nlp-toast-in { from{opacity:0;transform:translateX(24px)}
          to{opacity:1;transform:translateX(0)} }
        @media (prefers-reduced-motion: reduce) {
          [style*="nlp-toast-in"] { animation: none !important; }
        }
        .nlp-table-row:hover td { background:${T.bgCardHover}!important; }
        .nlp-table-row { cursor:pointer; }
        .nlp-action:hover:not(:disabled) { opacity:.8; }
        .nlp-iconbtn:hover { color:${HW.blue}; }
        .nlp-close { transition: all .2s; }
        .nlp-close:hover { border-color:${ALARM.critical}!important;
          color:${ALARM.critical}!important; }
        .nlp-clear { transition: all .15s; }
        .nlp-clear:hover { border-color:${HW.blue}!important; color:${HW.blue}!important; }
        .nlp-page { transition: all .18s; }
        .nlp-page:hover:not(:disabled):not(.active) {
          border-color:${HW.blue}!important; color:${HW.blue}!important; }
        .nlp-link { transition: color .2s; }
        .nlp-link:hover { color:${T.text}!important; }
        .nlp-search:focus { border-color:${HW.blue}!important;
          box-shadow:0 0 0 2px ${HW.blueDim}!important; }
      `}</style>

      {/* NOTIFICATION TOASTS */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none' }}>
        {notifications.map(n => (
          <div key={n.id} style={{ pointerEvents: 'all' }}>
            <NotificationToast notif={n} onDismiss={dismissNotification}/>
          </div>
        ))}
      </div>

      <ComplaintModal
        complaint={selectedComp}
        onClose={() => { setSelectedComp(null); setConfirmDelete(null) }}
        onStatusUpdate={handleStatusUpdate}
        onDelete={handleDelete}
        actionLoading={actionLoading}
        confirmDelete={confirmDelete} setConfirmDelete={setConfirmDelete}
      />

      <div style={{ padding: '36px 44px 80px', maxWidth: 1600, margin: '0 auto' }}>

        {/* HERO */}
        <div style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 24,
          marginBottom: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10,
            marginBottom: 18 }}>
            {/* NL-4: live = green, offline = critical */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7,
              background: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0E'),
              border: `1px solid ${sevBd(apiOnline ? ALARM.normal : ALARM.critical)}`,
              padding: '5px 13px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%',
                background: apiOnline ? ALARM.normal : ALARM.critical,
                display: 'inline-block',
                animation: apiOnline ? 'noc-pulse 2s ease-in-out infinite' : 'none' }}/>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '2.5px',
                textTransform: 'uppercase',
                color: apiOnline ? ALARM.normal : ALARM.critical }}>
                {apiOnline ? t('nlp.liveBadge') : t('nlp.offlineBadge')}
              </span>
            </div>
            <span style={{ fontSize: 11, color: T.textDim, letterSpacing: '1.5px' }}>
              {t('nlp.subtitle2')}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-end', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <h1 style={{ fontFamily: FONT.display,
                fontSize: 'clamp(26px,3.5vw,52px)', fontWeight: 900,
                letterSpacing: '-1.5px', lineHeight: 1, color: T.text,
                marginBottom: 8 }}>
                {t('nlp.title').split(' ').slice(0, -1).join(' ')}{' '}
                {/* The ONE brand-red element on this page */}
                <span style={{ color: HW.red, fontStyle: 'italic' }}>
                  {t('nlp.title').split(' ').slice(-1)[0]}
                </span>
              </h1>
              <p style={{ fontSize: 13, color: T.textMuted, fontWeight: 300 }}>
                {t('nlp.subtitle')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: apiOnline ? 'Online' : 'Offline',
                  dot: apiOnline ? ALARM.normal : ALARM.critical,
                  color: apiOnline ? ALARM.normal : ALARM.critical,
                  bd: sevBd(apiOnline ? ALARM.normal : ALARM.critical),
                  bg: sevDim(apiOnline ? ALARM.normal : ALARM.critical, '0A') },
                { label: `${(stats?.total || 0).toLocaleString()} Submissions`,
                  color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: t('nlp.multilingual'), color: T.textMuted, bd: T.border,
                  bg: T.mode === 'dark' ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.03)' },
                { label: t('nlp.autoClassify'), color: HW.blue,
                  bd: HW.blueBd, bg: HW.blueDim },
              ].map((b, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 800,
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  padding: '5px 13px', border: `1px solid ${b.bd}`,
                  background: b.bg, color: b.color,
                  display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {b.dot && <span style={{ width: 5, height: 5, borderRadius: '50%',
                    background: b.dot, display: 'inline-block' }}/>}
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ERROR BANNERS */}
        {fetchError && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
            background: sevDim(ALARM.critical, '0C'),
            border: `1px solid ${sevBd(ALARM.critical)}`,
            padding: '14px 20px', marginBottom: 1 }}>
            <AlertTriangle size={16} color={ALARM.critical}
              style={{ flexShrink: 0, marginTop: 1 }}/>
            <div>
              <div style={{ fontSize: 12, color: ALARM.critical, fontWeight: 700,
                marginBottom: 4 }}>{t('nlp.fetchError')}</div>
              <code style={{ fontSize: 11, color: T.textMuted }}>{fetchError}</code>
              <div style={{ marginTop: 8 }}>
                <ActionBtn onClick={() => fetchData(false)} variant="blueSolid"
                  small={false}>
                  <RefreshCw size={12}/> {t('nlp.retryBtn')}
                </ActionBtn>
              </div>
            </div>
          </div>
        )}
        {!apiOnline && !fetchError && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
            background: sevDim(ALARM.minor, '0C'),
            border: `1px solid ${sevBd(ALARM.minor)}`,
            padding: '14px 20px', marginBottom: 1 }}>
            <AlertTriangle size={14} color={ALARM.minor}/>
            <div>
              <div style={{ fontSize: 12, color: ALARM.minor, fontWeight: 700,
                marginBottom: 4 }}>{t('nlp.offlineBanner')}</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>
                {t('nlp.startServer')}{' '}
                <code style={{ background: T.mode === 'dark'
                    ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)',
                  padding: '2px 8px', fontSize: 10, color: HW.blue }}>
                  uvicorn src.nlp.analytics_api:app --reload --port 8000
                </code>
              </div>
            </div>
          </div>
        )}

        {/* KPI TILES */}
        <SectionLabel sub={t('nlp.kpiSub')}>{t('nlp.kpiSection')}</SectionLabel>
        <GapGrid columns="repeat(4,1fr)">
          {kpiTiles.map((kpi, i) => <StatBlock key={i} {...kpi}/>)}
        </GapGrid>

        {/* CHARTS */}
        {(stats?.total || 0) > 0 && (
          <>
            <SectionLabel sub={t('nlp.chartsSub')}>{t('nlp.chartsSection')}</SectionLabel>
            <GapGrid columns="repeat(4,1fr)">
              <ChartPanel title={t('nlp.langChartTitle')} sub={t('nlp.langChartSub')}>
                {langChart
                  ? <ReactApexChart options={langChart.options}
                      series={langChart.series} type="donut" height={240}/>
                  : <EmptyState icon={Globe} title={t('common.noData')}/>}
              </ChartPanel>
              <ChartPanel title={t('nlp.sentChartTitle')} sub={t('nlp.sentChartSub')}>
                {sentChart
                  ? <ReactApexChart options={sentChart.options}
                      series={sentChart.series} type="donut" height={240}/>
                  : <EmptyState icon={Tag} title={t('common.noData')}/>}
              </ChartPanel>
              <ChartPanel title={t('nlp.catChartTitle')} sub={t('nlp.catChartSub')}>
                {catChart
                  ? <ReactApexChart options={catChart.options}
                      series={catChart.series} type="bar" height={240}/>
                  : <EmptyState icon={Filter} title={t('common.noData')}/>}
              </ChartPanel>
              <ChartPanel title={t('nlp.classChartTitle')} sub={t('nlp.classChartSub')}>
                {typeChart
                  ? <ReactApexChart options={typeChart.options}
                      series={typeChart.series} type="donut" height={240}/>
                  : <EmptyState icon={Tag} title={t('nlp.awaitingBackend')}
                      desc={t('nlp.pythonRequired')}/>}
              </ChartPanel>
            </GapGrid>
          </>
        )}

        {/* FILTER BAR */}
        <SectionLabel
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {searchQuery && (
                <span style={{ fontSize: 10, color: T.textDim }}>
                  {filteredComplaints.length} / {complaints.length}
                </span>
              )}
              <Badge variant="blue">{filteredComplaints.length} {t('nlp.shown')}</Badge>
              <Badge variant="gray">
                {(stats?.total || 0).toLocaleString()} {t('nlp.totalLabel')}
              </Badge>
            </div>
          }
          sub={t('nlp.filterSub')}>
          {t('nlp.filterSection')}
        </SectionLabel>

        <div style={{ display: 'flex', gap: 1, background: GAP, marginBottom: 1,
          flexWrap: 'wrap', alignItems: 'stretch' }}>
          {FILTER_CONFIG.map(f => (
            <div key={f.id} style={{ background: T.bgCard,
              border: `1px solid ${T.border}`, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: T.textDim,
                letterSpacing: '2px', textTransform: 'uppercase',
                whiteSpace: 'nowrap' }}>{f.label}</span>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <select value={f.value} onChange={e => f.set(e.target.value)}
                  aria-label={f.label}
                  style={{ appearance: 'none', background: T.bgCardHover,
                    color: T.text, border: `1px solid ${T.border}`,
                    padding: '7px 32px 7px 12px', fontSize: 11, fontWeight: 600,
                    fontFamily: FONT.body, letterSpacing: '.5px',
                    cursor: 'pointer', outline: 'none', minWidth: 120 }}>
                  {f.options.map(o =>
                    <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={11} color={T.textDim} style={{ position: 'absolute',
                  right: 9, top: '50%', transform: 'translateY(-50%)',
                  pointerEvents: 'none' }}/>
              </div>
            </div>
          ))}
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`,
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <ActionBtn onClick={() => fetchData(false)} disabled={loading}
              variant="blueSolid" small={false}>
              <RefreshCw size={12} style={{ animation: loading
                ? 'noc-spin .9s linear infinite' : undefined }}/>
              {t('nlp.refreshBtn')}
            </ActionBtn>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 9, color: T.textDim, letterSpacing: '1.5px',
                textTransform: 'uppercase' }}>{t('nlp.lastUpdated')}</span>
              <span style={{ fontSize: 11, color: T.textMuted,
                fontFamily: FONT.display, fontWeight: 700 }}>{lastRefreshedStr}</span>
            </div>
          </div>
          <div style={{ marginLeft: 'auto', background: T.bgCard,
            border: `1px solid ${T.border}`, padding: '10px 16px',
            display: 'flex', alignItems: 'center' }}>
            <Link to="/form" target="_blank" rel="noreferrer" className="nlp-link"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7,
                color: T.textMuted, fontSize: 11, fontWeight: 600,
                textDecoration: 'none', letterSpacing: '.5px' }}>
              <ExternalLink size={12}/> {t('nlp.customerForm')}
            </Link>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`,
          borderTop: 'none', padding: '10px 16px', display: 'flex',
          alignItems: 'center', gap: 10, marginBottom: 1 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
            <Search size={13} color={T.textDim} style={{ position: 'absolute',
              left: 10, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none' }}/>
            <input type="text" className="nlp-search"
              placeholder={t('nlp.searchPlaceholder')}
              aria-label={t('nlp.searchPlaceholder')}
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ background: T.bgCardHover, color: T.text,
                border: `1px solid ${T.border}`, padding: '8px 12px 8px 34px',
                fontSize: 12, fontWeight: 500, fontFamily: FONT.body,
                outline: 'none', transition: 'border-color .2s, box-shadow .2s',
                width: '100%' }}/>
          </div>
          {searchQuery && (
            <button className="nlp-clear" onClick={() => setSearchQuery('')}
              style={{ background: 'transparent', border: `1px solid ${T.border}`,
                color: T.textMuted, cursor: 'pointer', padding: '6px 10px',
                fontSize: 10, display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'inherit' }}>
              <X size={11}/> {t('nlp.clearSearch')}
            </button>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center',
            gap: 6, fontSize: 10, color: T.textDim, letterSpacing: '1px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%',
              background: ALARM.normal, display: 'inline-block',
              animation: 'noc-pulse 3s ease-in-out infinite' }}/>
            {t('nlp.autoRefresh')}
          </div>
        </div>

        {/* TABLE — NL-4: blue chrome, urgency-edged rows */}
        <div style={{ border: `1px solid ${T.border}`, overflow: 'hidden',
          position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5,
            background: `linear-gradient(90deg, transparent, ${HW.blue}, transparent)` }}/>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse',
              fontSize: 11, minWidth: 1100 }}>
              <thead>
                <tr style={{ background: T.mode === 'dark'
                    ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.04)',
                  borderBottom: `1px solid ${T.border}` }}>
                  {[
                    { label: t('nlp.tableId'),     Icon: ArrowUpDown   },
                    { label: t('nlp.tableType'),   Icon: Tag           },
                    { label: t('nlp.tableText'),   Icon: null          },
                    { label: t('nlp.tableLang'),   Icon: Globe         },
                    { label: t('nlp.tableCat'),    Icon: Filter        },
                    { label: t('nlp.tableSent'),   Icon: null          },
                    { label: t('nlp.tableUrg'),    Icon: AlertTriangle },
                    { label: t('nlp.tableScore'),  Icon: null          },
                    { label: t('nlp.tableCity'),   Icon: null          },
                    { label: t('nlp.tableStatus'), Icon: null          },
                    { label: t('nlp.tableActions'),Icon: null          },
                  ].map(({ label, Icon }) => (
                    <th key={label} style={{ padding: '11px 12px', textAlign: 'left',
                      fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
                      textTransform: 'uppercase', color: T.textDim,
                      whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {Icon && <Icon size={9} color={T.textDim}/>}{label}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: 48, textAlign: 'center',
                      color: T.textMuted }}>
                      {searchQuery ? (
                        <><Search size={20} color={T.textDim}
                          style={{ display: 'block', margin: '0 auto 12px' }}/>
                          {t('nlp.noResults')}{' '}
                          <strong style={{ color: T.text }}>"{searchQuery}"</strong>
                        </>
                      ) : apiOnline ? t('nlp.noSubmissions') : t('nlp.apiOffline')}
                    </td>
                  </tr>
                ) : pagedComplaints.map(c => {
                  const isActioning = actionLoading === c.complaint_id
                  const isComplaint = c.is_complaint !== undefined ? c.is_complaint : null
                  // NL-4: row left edge = urgency severity (complaints only)
                  const edge = isComplaint === true
                    ? (URGENCY[c.nlp_urgency_level] || ALARM.major)
                    : T.border
                  return (
                    <tr key={c.complaint_id || c.id} className="nlp-table-row"
                      style={{ borderBottom: `1px solid ${T.mode === 'dark'
                          ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.06)'}`,
                        opacity: isActioning ? 0.5 : 1, transition: 'all .15s' }}
                      onClick={() => setSelectedComp(c)}>
                      <td style={{ padding: '9px 12px',
                        borderLeft: `2px solid ${edge}` }}>
                        {/* NL-4: an ID is not an alarm → blue */}
                        <span style={{ fontFamily: FONT.display, fontSize: 13,
                          fontWeight: 800, color: HW.blue,
                          letterSpacing: '-.3px' }}>{c.complaint_id}</span>
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {isComplaint === true  &&
                          <Badge variant="critical">{t('nlp.reclamation')}</Badge>}
                        {isComplaint === false &&
                          <Badge variant="blue">{t('nlp.feedbackBadge')}</Badge>}
                        {isComplaint === null &&
                          <span style={{ fontSize: 10, color: T.textDim,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase' }}>—</span>}
                      </td>
                      <td style={{ padding: '9px 12px', color: T.text, maxWidth: 180,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' }} title={c.text_original}>
                        {c.text_original}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        {/* NL-3: categorical badge */}
                        <Badge variant={LANG_BADGE[c.language] || 'gray'}>
                          {c.language?.toUpperCase()}
                        </Badge>
                      </td>
                      <td style={{ padding: '9px 12px', color: T.textMuted,
                        maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', fontSize: 10 }}>{c.nlp_category}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <Badge variant={SENT_BADGE[c.nlp_sentiment] || 'gray'}>
                          {c.nlp_sentiment}
                        </Badge>
                      </td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ ...urgencyStyle(c.nlp_urgency_level),
                          padding: '3px 8px', fontSize: 9, fontWeight: 800,
                          letterSpacing: '1px', textTransform: 'uppercase' }}>
                          {c.nlp_urgency_level}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ fontFamily: FONT.display, fontSize: 14,
                          fontWeight: 700, color: T.textMuted }}>
                          {c.nlp_urgency_score?.toFixed(2) ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', color: T.textDim,
                        fontSize: 10 }}>{c.nlp_city || '—'}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%',
                            background: STATUS_COLOR[c.status] || T.textDim,
                            flexShrink: 0 }}/>
                          <span style={{ fontSize: 10, color: T.textMuted }}>
                            {c.status}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                          {c.status !== 'in_progress' && c.status !== 'resolved' && (
                            <ActionBtn onClick={() => handleStatusUpdate(
                              c.complaint_id, 'in_progress', c.msisdn,
                              c.nlp_category)} disabled={isActioning} variant="minor">
                              {t('nlp.enCours')}
                            </ActionBtn>
                          )}
                          {c.status !== 'resolved' && (
                            <ActionBtn onClick={() => handleStatusUpdate(
                              c.complaint_id, 'resolved', c.msisdn,
                              c.nlp_category)} disabled={isActioning} variant="normal">
                              <Check size={10}/> {t('nlp.cloture')}
                            </ActionBtn>
                          )}
                          {confirmDelete === c.complaint_id ? (
                            <>
                              <ActionBtn onClick={() => handleDelete(c.complaint_id)}
                                disabled={isActioning} variant="criticalSolid">
                                {t('nlp.confirmer')}
                              </ActionBtn>
                              <ActionBtn onClick={() => setConfirmDelete(null)}
                                variant="ghost"><X size={9}/></ActionBtn>
                            </>
                          ) : (
                            <ActionBtn onClick={() => setConfirmDelete(c.complaint_id)}
                              disabled={isActioning} variant="critical">
                              <Trash2 size={10}/>
                            </ActionBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGINATION — NL-4: blue selection */}
        {filteredComplaints.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', padding: '13px 18px', marginTop: 1,
            background: T.bgCard, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 11, color: T.textMuted, display: 'flex',
              alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: FONT.display, fontSize: 15,
                fontWeight: 800, color: HW.blue }}>
                {Math.min((page - 1) * PAGE_SIZE + 1, filteredComplaints.length)}–
                {Math.min(page * PAGE_SIZE, filteredComplaints.length)}
              </span>
              <span style={{ color: T.textDim }}>
                / {filteredComplaints.length} {t('nlp.complaints3')}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="nlp-page" aria-label="Previous page"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ width: 32, height: 32, border: `1px solid ${T.border}`,
                  background: 'transparent',
                  color: page === 1 ? T.textDim : T.textMuted,
                  cursor: page === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: page === 1 ? 0.4 : 1 }}>
                <ChevronLeft size={12}/>
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc, p, idx, arr) => {
                  if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
                  acc.push(p); return acc
                }, [])
                .map((p, idx) => p === '…' ? (
                  <span key={`e${idx}`} style={{ width: 32, textAlign: 'center',
                    color: T.textDim, fontSize: 11 }}>…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p)}
                    className={`nlp-page${p === page ? ' active' : ''}`}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                    style={{ width: 32, height: 32,
                      background: p === page ? HW.blue : 'transparent',
                      border: `1px solid ${p === page ? HW.blue : T.border}`,
                      color: p === page ? '#fff' : T.textMuted,
                      cursor: 'pointer', fontSize: 11,
                      fontWeight: p === page ? 800 : 500,
                      fontFamily: FONT.display, letterSpacing: '-.3px' }}>
                    {p}
                  </button>
                ))
              }

              <button className="nlp-page" aria-label="Next page"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ width: 32, height: 32, border: `1px solid ${T.border}`,
                  background: 'transparent',
                  color: page === totalPages ? T.textDim : T.textMuted,
                  cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: page === totalPages ? 0.4 : 1 }}>
                <ChevronRight size={12}/>
              </button>
            </div>

            <div style={{ fontSize: 10, color: T.textDim, letterSpacing: '1.5px',
              textTransform: 'uppercase', fontWeight: 700 }}>
              Page {page} / {totalPages}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}