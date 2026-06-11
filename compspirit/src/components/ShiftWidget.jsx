// src/components/ShiftWidget.jsx
// ─────────────────────────────────────────────────────────────────────
// NOC Engineer personal shift card — shown in the dashboard Layout.
// Placed in the navbar right side next to user avatar.
// Shows: On/Off Shift status · live timer · Clock In/Out button
// Calls: PATCH /api/auth/shift/checkin  (self-service, no admin token)
//        PATCH /api/auth/shift/checkout
//        GET   /api/auth/me             (to refresh shift state)
// ─────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { Clock, LogIn, LogOut, Timer, X }   from 'lucide-react'
import axios from 'axios'

const BASE = 'http://localhost:8000'
const tok  = () => sessionStorage.getItem('spiricomp_token') ||
                   localStorage.getItem('spiricomp_token') || ''
const hdr  = () => ({ Authorization: `Bearer ${tok()}` })

// Live elapsed timer
function Elapsed({ since }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!since) return
    const update = () => setSec(Math.max(0,
      Math.round((Date.now() - new Date(since).getTime()) / 1000)))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [since])
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return (
    <span style={{ fontFamily: "'Barlow Condensed', monospace",
      fontSize: 13, fontWeight: 800, letterSpacing: 1, color: '#00E5A0' }}>
      {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  )
}

export default function ShiftWidget({ user, T }) {
  const [shiftInfo, setShiftInfo] = useState({
    is_on_shift:  user?.is_on_shift  || false,
    shift_start:  user?.shift_start  || null,
    shift_end:    user?.shift_end    || null,
    last_checkin: user?.last_checkin || null,
    hours_today:  user?.hours_today  || 0,
  })
  const [loading, setLoading] = useState(false)
  const [open,    setOpen]    = useState(false)

  // Fetch fresh state
  const refresh = useCallback(async () => {
    try {
      const r = await axios.get(`${BASE}/api/auth/me`, { headers: hdr() })
      setShiftInfo({
        is_on_shift:  r.data.is_on_shift  || false,
        shift_start:  r.data.shift_start  || null,
        shift_end:    r.data.shift_end    || null,
        last_checkin: r.data.last_checkin || null,
        hours_today:  r.data.hours_today  || 0,
      })
    } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])
  // Auto-refresh every 60s
  useEffect(() => {
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [refresh])

  const toggle = async () => {
    setLoading(true)
    try {
      const endpoint = shiftInfo.is_on_shift ? 'checkout' : 'checkin'
      await axios.patch(`${BASE}/api/auth/shift/${endpoint}`, {}, { headers: hdr() })
      await refresh()
    } catch (err) {
      console.error('Shift toggle failed:', err.response?.data?.detail || err.message)
    } finally { setLoading(false) }
  }

  const on = shiftInfo.is_on_shift

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen(v => !v)}
        title={on ? 'On Shift — click for details' : 'Off Shift — click to clock in'}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: on
            ? 'rgba(0,229,160,.1)'
            : T.mode === 'dark' ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)',
          border: `1px solid ${on ? 'rgba(0,229,160,.3)' : T.border}`,
          borderRadius: 20, padding: '5px 12px',
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
        }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%',
          background: on ? '#00E5A0' : '#64748B',
          boxShadow: on ? '0 0 8px #00E5A0' : 'none',
          flexShrink: 0 }}/>
        {on ? (
          <>
            <Elapsed since={shiftInfo.last_checkin}/>
          </>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700,
            color: T.textMuted, letterSpacing: '.5px' }}>Off Shift</span>
        )}
        <Clock size={12} color={on ? '#00E5A0' : T.textDim}/>
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1998 }}/>

          <div style={{
            position: 'absolute', top: 'calc(100% + 10px)', right: 0,
            width: 280, zIndex: 1999,
            background: T.mode === 'dark'
              ? 'linear-gradient(135deg, rgba(0,10,25,.98), rgba(0,20,45,.96))'
              : T.bgCard,
            border: `1px solid ${on ? 'rgba(0,229,160,.3)' : 'rgba(0,147,213,.2)'}`,
            borderRadius: 14, overflow: 'hidden',
            boxShadow: '0 16px 48px rgba(0,0,0,.4)',
          }}>
            {/* Top accent */}
            <div style={{ height: 2,
              background: on
                ? 'linear-gradient(90deg,transparent,#00E5A0,transparent)'
                : 'linear-gradient(90deg,transparent,#0093D5,transparent)' }}/>

            {/* Header */}
            <div style={{ padding: '14px 16px 12px',
              borderBottom: `1px solid ${T.mode==='dark'?'rgba(255,255,255,.06)':T.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8,
                  background: on ? 'rgba(0,229,160,.15)' : 'rgba(0,147,213,.12)',
                  border: `1px solid ${on?'rgba(0,229,160,.3)':'rgba(0,147,213,.25)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Timer size={14} color={on ? '#00E5A0' : '#0093D5'}/>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: on ? '#00E5A0' : '#0093D5' }}>
                    {on ? 'On Shift' : 'Off Shift'}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>
                    {user?.full_name || user?.username}
                  </div>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                style={{ background: 'transparent', border: 'none',
                  cursor: 'pointer', color: T.textDim, padding: 4 }}>
                <X size={13}/>
              </button>
            </div>

            {/* Stats */}
            <div style={{ padding: '12px 16px' }}>
              {/* Scheduled hours */}
              {shiftInfo.shift_start && shiftInfo.shift_end ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                  background: T.mode==='dark'?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)',
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '8px 12px', marginBottom: 10 }}>
                  <Clock size={13} color='#0093D5' style={{ flexShrink: 0 }}/>
                  <div>
                    <div style={{ fontSize: 9, color: T.textDim, marginBottom: 1 }}>
                      Scheduled shift
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                      {shiftInfo.shift_start}
                      <span style={{ color: T.textDim, margin: '0 4px' }}>→</span>
                      {shiftInfo.shift_end}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: T.textDim, fontStyle: 'italic',
                  marginBottom: 10, padding: '8px 4px' }}>
                  No shift schedule set by admin
                </div>
              )}

              {/* Hours today */}
              <div style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 9, color: T.textDim, letterSpacing: '1.5px',
                    textTransform: 'uppercase', marginBottom: 3 }}>Today</div>
                  <div style={{ fontFamily: "'Barlow Condensed',sans-serif",
                    fontSize: 24, fontWeight: 900, color: '#0093D5', lineHeight: 1 }}>
                    {Number(shiftInfo.hours_today).toFixed(1)}
                    <span style={{ fontSize: 12, fontWeight: 400, color: T.textDim }}> h</span>
                  </div>
                </div>
                {on && shiftInfo.last_checkin && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, color: T.textDim, marginBottom: 3 }}>Session</div>
                    <Elapsed since={shiftInfo.last_checkin}/>
                  </div>
                )}
              </div>

              {/* Clock In / Out button */}
              <button
                onClick={toggle}
                disabled={loading}
                style={{
                  width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px',
                  borderRadius: 10, border: 'none',
                  background: loading ? T.border : on
                    ? 'linear-gradient(135deg, #EF4444, #B91C1C)'
                    : 'linear-gradient(135deg, #00E5A0, #00B87A)',
                  color: '#fff', fontWeight: 800, fontSize: 13,
                  fontFamily: 'inherit', cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '.3px',
                  boxShadow: loading ? 'none' : on
                    ? '0 4px 16px rgba(239,68,68,.35)'
                    : '0 4px 16px rgba(0,229,160,.35)',
                  transition: 'all .2s',
                  opacity: loading ? 0.7 : 1,
                }}>
                {loading ? (
                  <>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.4)',
                      borderTopColor: '#fff', borderRadius: '50%',
                      animation: 'sw-spin .7s linear infinite' }}/>
                    Processing…
                  </>
                ) : on ? (
                  <><LogOut size={15}/> Clock Out</>
                ) : (
                  <><LogIn size={15}/> Clock In</>
                )}
              </button>

              <style>{`@keyframes sw-spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          </div>
        </>
      )}
    </div>
  )
}