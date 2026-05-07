import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from 'react-router-dom';

import logoImg from "../assets/images/logo_1.png";
import coverImg from "../assets/images/cover.jpg";
import serverImg from "../assets/images/server.png";
import dashImg from "../assets/images/dashboard.jpg";
import towerImg from "../assets/images/tower.jpg";
import av1Img from "../assets/images/av1.jpg";
import av2Img from "../assets/images/av2.jpg";
import av3Img from "../assets/images/av3.jpg";
import av4Img from "../assets/images/av4.jpg";

// ─── Icons ─────────────────────────────────────────────────────
const IconSignal = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V4M22 20v-4"/>
  </svg>
);

const IconMap = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);

const IconCpu = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
    <rect x="9" y="9" width="6" height="6"/>
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>
  </svg>
);

const IconTrendingUp = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

const IconSearch = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconUsers = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconMessageSquare = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconArrowRight = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);

const IconArrowUpRight = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
  </svg>
);

const IconChevronLeft = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const IconChevronRight = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const IconQuote = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="#CF0A2C" opacity="0.22">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/>
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>
  </svg>
);

const IconStar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#CF0A2C">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);
// ─── Data ─────────────────────────────────────────────────────
// ─── Data ─────────────────────────────────────────────────────
const STATS = [
  { value: 50,  suffix: "K+", label: "Complaints\nAnalyzed" },
  { value: 552, suffix: "K",  label: "KPI\nSessions" },
  { value: 201, suffix: "",   label: "Cell\nSites" },
  { value: 24,  suffix: "",   label: "Governorates\nCovered" },
];

const MODULES = [
  { icon: IconMap,            title: "Spatio-Temporal\nHotspots",   desc: "Geospatial clustering of complaint patterns across 24 governorates and 201 cell sites.", tag: "GIS" },
  { icon: IconCpu,            title: "ML Anomaly\nDetection",       desc: "Isolation Forest & Autoencoder models for real-time network degradation detection.", tag: "ML" },
  { icon: IconTrendingUp,     title: "Predictive\nForecasting",     desc: "XGBoost + Prophet forecast complaint surges 7 days ahead with high precision.", tag: "AI" },
  { icon: IconSearch,         title: "Root Cause\nAnalysis",        desc: "SHAP-powered explainability linking KPIs to customer complaints.", tag: "SHAP" },
  { icon: IconUsers,          title: "Customer\nSegmentation",      desc: "K-Means & DBSCAN clustering for targeted QoE interventions.", tag: "UX" },
  { icon: IconMessageSquare,  title: "NLP\nClassification",         desc: "Multilingual BERT-based classification of complaint texts.", tag: "NLP" },
];

 const TESTIMONIALS = [
  {
    name: "Karim Mansouri",
    role: "Senior NOC Engineer",
    company: "Ooredoo Tunisia",
    av: av1Img,
    text: "SpiriComp has transformed our complaint management workflow. Tasks that previously required hours of manual KPI correlation are now completed in seconds. The anomaly detection module has already prevented three major network outages.",
  },
  {
    name: "Sana Ouerghi",
    role: "Network Quality Manager",
    company: "Huawei Technologies Tunisia",
    av: av2Img,
    text: "The forecasting module is exceptional. We can now anticipate complaint surges seven days in advance. Our customer satisfaction score has increased by 23% over six months as a direct result of this proactive capability.",
  },
  {
    name: "Ahmed Trabelsi",
    role: "Data Science Lead",
    company: "Telecom Analytics Division",
    av: av3Img,
    text: "The root cause analysis powered by SHAP is remarkably insightful. It not only identifies the anomaly — it precisely explains which KPI triggered the surge. Our engineers value the transparency and actionable intelligence it provides.",
  },
  {
    name: "Leila Benmoussa",
    role: "Customer Experience Director",
    company: "Mobile Operator Tunisia",
    av: av4Img,
    text: "Before SpiriComp, we operated entirely in reactive mode. Today, we are fully proactive. The NLP pipeline automatically tags every incoming complaint, giving us real-time visibility into network quality across all regions.",
  },
];
const TICKER_ITEMS = [
  "QoE Scoring Engine", "QoS Degradation Detection", "KQI · KPI Correlation",
  "Spatio-Temporal Analysis", "ML Anomaly Detection", "XGBoost Forecasting",
  "SHAP Root Cause", "K-Means Segmentation", "NLP Classification",
  "24 Governorates", "50K+ Réclamations", "Huawei NOC"
];
// ─── Animated Counter ─────────────────────────────────────────
function Counter({ target, suffix }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const done = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !done.current) {
        done.current = true;
        let current = 0;
        const duration = 65;
        const increment = target / duration;
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            setVal(target);
            clearInterval(timer);
          } else {
            setVal(Math.round(current));
          }
        }, 16);
      }
    }, { threshold: 0.4 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{val}{suffix}</span>;
}
// ─── Scroll Reveal ────────────────────────────────────────────
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { threshold: 0.1 });

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(30px)',
      transition: `all 0.8s ${delay}s cubic-bezier(0.25, 0.1, 0.25, 1)`
    }}>
      {children}
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────
export default function LandingPage({ onEnter }) {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [activeModule, setActiveModule] = useState(0);
  const [testiIdx, setTestiIdx] = useState(0);

  // Scroll handler
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-rotate featured module
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveModule(prev => (prev + 1) % MODULES.length);
    }, 4200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ 
      fontFamily: "'Inter', 'Barlow', system-ui, sans-serif", 
      background: "#080808", 
      color: "#fff", 
      overflowX: "hidden" 
    }}>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-track{background:#080808}
     ::-webkit-scrollbar-thumb { background: #CF0A2C; border-radius: 3px; }

        @keyframes kenburns {
          0% { transform: scale(1) translate(0,0) }
          100% { transform: scale(1.06) translate(-1%,.8%) }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1) }
          50% { opacity: .4; transform: scale(.8) }
        }
        @keyframes slide-in {
          from { opacity: 0; transform: translateY(36px) }
          to { opacity: 1; transform: translateY(0) }
        }
        @keyframes spin {
          from { transform: rotate(0deg) }
          to { transform: rotate(360deg) }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0) }
          40% { transform: translateY(-8px) }
        }
        @keyframes ticker {
          0% { transform: translateX(0) }
          100% { transform: translateX(-50%) }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0 }
          100% { background-position: 200% 0 }
        }

        .nav-link {
          color: rgba(255,255,255,.5);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          cursor: pointer;
          transition: color .2s;
          white-space: nowrap;
          position: relative;
          padding-bottom: 3px;
          text-decoration: none;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: -2px;
          left: 0;
          right: 0;
          height: 1px;
          background: #CF0A2C;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform .25s;
        }
        .nav-link:hover {
          color: #fff;
        }
        .nav-link:hover::after {
          transform: scaleX(1);
        }

        .btn-primary {
          background: #CF0A2C;
          color: white;
          border: none;
          padding: 14px 34px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all .2s;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          position: relative;
          overflow: hidden;
        }
        .btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);
          background-size: 200% 100%;
          opacity: 0;
          transition: opacity .2s;
        }
        .btn-primary:hover {
          background: #E8102F;
          transform: translateY(-1px);
          box-shadow: 0 8px 28px rgba(207,10,44,.4);
        }
        .btn-primary:hover::before {
          opacity: 1;
          animation: shimmer .8s linear;
        }

        .btn-ghost {
          background: transparent;
          color: rgba(255,255,255,.65);
          border: 1px solid rgba(255,255,255,.18);
          padding: 14px 34px;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all .2s;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 9px;
        }
        .btn-ghost:hover {
          border-color: rgba(255,255,255,.4);
          color: #fff;
          background: rgba(255,255,255,.04);
        }

        .module-card {
          padding: 32px 26px;
          border: 1px solid rgba(255,255,255,.055);
          background: #0D0D0D;
          transition: all .35s cubic-bezier(.22,1,.36,1);
          position: relative;
          cursor: default;
          overflow: hidden;
        }
        .module-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, #CF0A2C, transparent);
          transform: scaleX(0);
          transform-origin: center;
          transition: transform .4s ease;
        }
        .module-card:hover, .module-card.active {
          border-color: rgba(207,10,44,.22);
          background: rgba(207,10,44,.028);
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(207,10,44,.08);
        }
        .module-card:hover::before, .module-card.active::before {
          transform: scaleX(1);
        }

        .testi-card {
          background: #0C0C0C;
          border: 1px solid rgba(255,255,255,.06);
          padding: 40px;
          position: relative;
          overflow: hidden;
          transition: all .3s;
        }
        .testi-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, #CF0A2C, transparent);
          transform: scaleX(0);
          transform-origin: center;
          transition: transform .5s;
        }
        .testi-card:hover::before {
          transform: scaleX(1);
        }
        .testi-card:hover {
          border-color: rgba(207,10,44,.18);
        }

        .img-wrap {
          overflow: hidden;
          position: relative;
        }
        .img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform .8s cubic-bezier(.22,1,.36,1);
        }
        .img-wrap:hover img {
          transform: scale(1.05);
        }

        .tag {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2px;
          padding: 3px 9px;
          border: 1px solid rgba(207,10,44,.3);
          color: #CF0A2C;
          text-transform: uppercase;
          background: rgba(207,10,44,.06);
        }

        .section-label {
          font-size: 10px;
          font-weight: 800;
          color: #CF0A2C;
          letter-spacing: 4.5px;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 22px;
        }
        .section-label::before {
          content: '';
          width: 22px;
          height: 1px;
          background: #CF0A2C;
        }

        .ticker-wrap {
          overflow: hidden;
          border-top: 1px solid rgba(255,255,255,.055);
          border-bottom: 1px solid rgba(255,255,255,.055);
          padding: 10px 0;
          background: #050505;
        }
        .ticker-track {
          display: flex;
          animation: ticker 30s linear infinite;
          width: max-content;
        }
        .ticker-item {
          font-size: 10px;
          color: rgba(255,255,255,.28);
          letter-spacing: 2.5px;
          text-transform: uppercase;
          padding: 0 44px;
          display: flex;
          align-items: center;
          gap: 16px;
          white-space: nowrap;
        }
        .ticker-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #CF0A2C;
          flex-shrink: 0;
        }

        .stat-block {
          text-align: center;
          padding: 36px 24px;
          border: 1px solid rgba(255,255,255,.05);
          background: #0A0A0A;
          transition: all .3s;
          position: relative;
          overflow: hidden;
        }
        .stat-block::before {
          content: '';
          position: absolute;
          top: 0;
          left: 15%;
          right: 15%;
          height: 1px;
          background: linear-gradient(90deg, transparent, #CF0A2C, transparent);
        }
        .stat-block:hover {
          border-color: rgba(207,10,44,.2);
          background: rgba(207,10,44,.025);
          transform: translateY(-2px);
        }

        @media(max-width: 900px) {
          .split-grid {
            grid-template-columns: 1fr !important;
          }
          .modules-grid {
            grid-template-columns: 1fr !important;
          }
          .testi-grid {
            grid-template-columns: 1fr !important;
          }
          .stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .nav-links, .nav-actions {
            display: none !important;
          }
          .hero-title {
            font-size: clamp(36px, 9vw, 60px) !important;
            white-space: normal !important;
          }
        }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{ 
        position: "fixed", 
        top: 0, 
        left: 0, 
        right: 0, 
        zIndex: 200, 
        height: 66, 
        padding: "0 48px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        background: scrolled ? "rgba(8,8,8,.96)" : "transparent", 
        borderBottom: scrolled ? "1px solid rgba(255,255,255,.06)" : "none", 
        backdropFilter: scrolled ? "blur(20px) saturate(1.8)" : "none", 
        transition: "all .4s" 
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0, textDecoration: 'none' }}>
          <div style={{ 
            width: 38, 
            height: 38, 
            borderRadius: "50%", 
            overflow: "hidden", 
            border: "1.5px solid rgba(207,10,44,.6)", 
            flexShrink: 0 
          }}>
            <img 
              src={logoImg} 
              alt="SpiriComp Logo" 
              style={{ width: "100%", height: "100%", objectFit: "cover" }} 
            />
          </div>
          <div style={{ lineHeight: 1 }}>
            <div style={{ 
              fontFamily: "'Barlow Condensed',sans-serif", 
              fontWeight: 900, 
              fontSize: 20, 
              letterSpacing: "-.5px",
              color: '#fff'
            }}>
           Spiri<span style={{ color: "#CF0A2C" }}>Comp</span>
            </div>
            <div style={{ 
              fontSize: 8, 
              color: "rgba(255,255,255,.18)", 
              letterSpacing: 4, 
              marginTop: 2, 
              fontWeight: 700 
            }}>
              BY HUAWEI
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <div className="nav-links" style={{ 
          display: "flex", 
          gap: 32, 
          position: "absolute", 
          left: "48%", 
          transform: "translateX(-50%)" 
        }}>
          {[
            { label: "Overview", path: "/dashboard" },
            { label: "Complaint Map", path: "/dashboard/map" },
            { label: "Anomaly Feed", path: "/dashboard/anomalies" },
            { label: "Forecasting", path: "/dashboard/forecast" },
            { label: "Root Cause Analysis", path: "/dashboard/root-cause" },
            { label: "User Segments", path: "/dashboard/segments" },
            { label: "NLP Analysis", path: "/dashboard/nlp" }
          ].map(({ label, path }) => (
            <Link key={label} to={path} className="nav-link">
              {label}
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="nav-actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>

          <button 
            className="btn-primary" 
            style={{ padding: "9px 24px", fontSize: 11 }} 
            onClick={onEnter}
            aria-label="Launch SpiriComp"
          >
            Launch <IconArrowUpRight size={12} color="white" />
          </button>
        </div>
      </nav>

      {/* ── TICKER ── */}
      <div className="ticker-wrap" style={{ 
        position: "fixed", 
        top: 66, 
        left: 0, 
        right: 0, 
        zIndex: 199 
      }}>
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <div key={i} className="ticker-item">
              <div className="ticker-dot" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* ── HERO ── */}
      <section style={{ 
        height: "100vh", 
        minHeight: 680, 
        position: "relative", 
        overflow: "hidden", 
        display: "flex", 
        alignItems: "center", 
        paddingTop: 106 
      }}>
        <img
          src={coverImg}
          alt="NOC Network Operations Center"
          style={{ 
            position: "absolute", 
            inset: 0, 
            width: "100%", 
            height: "100%", 
            objectFit: "cover", 
            animation: "kenburns 25s ease alternate infinite", 
            opacity: .42, 
            filter: "contrast(1.15) saturate(.75) brightness(.9)", 
            zIndex: 0 
          }}
        />
        
        {/* Overlays */}
        <div style={{ 
          position: "absolute", 
          inset: 0, 
          background: "linear-gradient(110deg, rgba(8,8,8,.97) 35%, rgba(8,8,8,.55) 68%, rgba(8,8,8,.28) 100%)" 
        }} />
        <div style={{ 
          position: "absolute", 
          bottom: 0, 
          left: 0, 
          right: 0, 
          height: "38%", 
          background: "linear-gradient(to top, #080808, transparent)" 
        }} />
        
        {/* Grid texture */}
        <div style={{ 
          position: "absolute", 
          inset: 0, 
          backgroundImage: "linear-gradient(rgba(255,255,255,.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.012) 1px, transparent 1px)", 
          backgroundSize: "72px 72px", 
          pointerEvents: "none" 
        }} />
        
        {/* Red glow */}
        <div style={{ 
          position: "absolute", 
          right: "5%", 
          top: "50%", 
          transform: "translateY(-50%)", 
          width: 560, 
          height: 560, 
          background: "radial-gradient(circle, rgba(207,10,44,.12) 0%, transparent 68%)", 
          pointerEvents: "none" 
        }} />

        {/* Content */}
        <div style={{ 
          position: "relative", 
          width: "100%", 
          maxWidth: 1200, 
          margin: "0 auto", 
          padding: "0 48px", 
          zIndex: 1 
        }}>
          {/* Live badge */}
          <div style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: 10, 
            marginBottom: 32, 
            animation: "slide-in .6s .05s ease both" 
          }}>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 7, 
              background: "rgba(207,10,44,.1)", 
              border: "1px solid rgba(207,10,44,.28)", 
              padding: "6px 14px" 
            }}>
              <span style={{ 
                width: 6, 
                height: 6, 
                borderRadius: "50%", 
                background: "#CF0A2C", 
                display: "inline-block", 
                animation: "pulse-dot 2s ease-in-out infinite" 
              }} />
              <span style={{ 
                fontSize: 10, 
                fontWeight: 800, 
                letterSpacing: 2.5, 
                textTransform: "uppercase", 
                color: "#FF4060" 
              }}>
                Live Network Intelligence
              </span>
            </div>
            <span style={{ 
              fontSize: 11, 
              color: "rgba(255,255,255,.25)", 
              letterSpacing: 1.5 
            }}>
              Huawei Technologies Tunisia
            </span>
          </div>

          {/* Title */}
          <h1 className="hero-title" style={{ 
            fontFamily: "'Barlow Condensed',sans-serif", 
            fontSize: "clamp(44px, 7.5vw, 92px)", 
            fontWeight: 900, 
            lineHeight: .96, 
            letterSpacing: "-2px", 
            marginBottom: 28, 
            animation: "slide-in .65s .12s ease both", 
            whiteSpace: "nowrap" 
          }}>
            INTELLIGENT NETWORK{" "}
            <span style={{ color: "#CF0A2C", fontStyle: "italic" }}>COMPLAINT</span>
          </h1>
          <h2 style={{ 
            fontFamily: "'Barlow Condensed',sans-serif", 
            fontSize: "clamp(28px, 4vw, 52px)", 
            fontWeight: 300, 
            color: "rgba(255,255,255,.22)", 
            letterSpacing: "-1px", 
            marginBottom: 32, 
            animation: "slide-in .65s .18s ease both" 
          }}>
         
Advanced Analytics & Network Intelligence Platform
          </h2>

          {/* Description */}
          <p style={{ 
            fontSize: 15, 
            lineHeight: 1.8, 
            color: "rgba(255,255,255,.4)", 
            maxWidth: 520, 
            marginBottom: 44, 
            animation: "slide-in .65s .24s ease both", 
            fontWeight: 300 
          }}>
SpiriComp ingests and correlates 50K+ customer complaints with 552K network KPI sessions across 201 cell sites and 24 governorates — detecting QoE degradation, forecasting complaint surges, and empowering NOC engineers to resolve issues proactively before SLA violations occur.          </p>

          {/* CTAs */}
          <div style={{ 
            display: "flex", 
            gap: 12, 
            flexWrap: "wrap", 
            animation: "slide-in .65s .32s ease both" 
          }}>
            <button 
              className="btn-primary" 
              style={{ fontSize: 13, padding: "15px 40px" }} 
              onClick={onEnter}
              aria-label="Open NOC Dashboard"
            >
              Access NOC Dashboard
 <IconArrowRight size={15} color="white" />
            </button>
            <button className="btn-ghost" style={{ fontSize: 13, padding: "15px 40px" }}>
Explore Platform Capabilities            </button>
          </div>
        </div>

        {/* Scroll hint */}
        <div style={{ 
          position: "absolute", 
          bottom: 28, 
          left: "50%", 
          transform: "translateX(-50%)", 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "center", 
          gap: 7, 
          zIndex: 1 
        }}>
          <div style={{ 
            width: 1, 
            height: 38, 
            background: "linear-gradient(to bottom, rgba(255,255,255,.22), transparent)", 
            animation: "pulse-dot 2.5s ease-in-out infinite" 
          }} />
          <span style={{ 
            fontSize: 9, 
            color: "rgba(255,255,255,.18)", 
            letterSpacing: 4, 
            textTransform: "uppercase" 
          }}>
       Scroll to Explore

          </span>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ 
        background: "#080808", 
        padding: "0", 
        borderTop: "1px solid rgba(255,255,255,.05)" 
      }}>
        <div className="stats-grid" style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(4, 1fr)", 
          gap: 1, 
          background: "rgba(255,255,255,.04)" 
        }}>
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * .06}>
              <div className="stat-block">
                <div style={{ 
                  fontFamily: "'Barlow Condensed',sans-serif", 
                  fontSize: "clamp(38px, 5vw, 62px)", 
                  fontWeight: 900, 
                  lineHeight: 1, 
                  color: "#CF0A2C", 
                  letterSpacing: "-2px" 
                }}>
                  <Counter target={s.value} suffix={s.suffix} />
                </div>
                <div style={{ 
                  fontSize: 11, 
                  color: "rgba(255,255,255,.32)", 
                  marginTop: 10, 
                  letterSpacing: 2, 
                  textTransform: "uppercase", 
                  whiteSpace: "pre-line", 
                  lineHeight: 1.6, 
                  fontWeight: 500 
                }}>
                  {s.label}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── SPLIT 1 — Infrastructure ── */}
      <section style={{ 
        background: "#080808", 
        borderTop: "1px solid rgba(255,255,255,.05)" 
      }}>
        <div className="split-grid" style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr", 
          minHeight: 520 
        }}>
          <div className="img-wrap" style={{ minHeight: 380 }}>
            <img src={serverImg} alt="Server infrastructure" />
            <div style={{ 
              position: "absolute", 
              inset: 0, 
              background: "linear-gradient(to right, transparent 55%, rgba(8,8,8,.7) 100%)" 
            }} />
            <div style={{ position: "absolute", bottom: 28, left: 28 }}>
              <div style={{ 
                background: "rgba(0,0,0,.72)", 
                backdropFilter: "blur(12px)", 
                border: "1px solid rgba(255,255,255,.1)", 
                padding: "10px 18px", 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 10 
              }}>
                <div style={{ 
                  width: 6, 
                  height: 6, 
                  borderRadius: "50%", 
                  background: "#22C55E", 
                  animation: "pulse-dot 1.8s infinite" 
                }} />
                <span style={{ 
                  fontSize: 10, 
                  color: "rgba(255,255,255,.7)", 
                  letterSpacing: 2, 
                  fontWeight: 700 
                }}>
                  201 SITES · ACTIFS
                </span>
              </div>
            </div>
          </div>
          <div style={{ 
            background: "#0C0C0C", 
            padding: "72px 56px", 
            display: "flex", 
            flexDirection: "column", 
            justifyContent: "center", 
            borderLeft: "1px solid rgba(255,255,255,.05)" 
          }}>
            <Reveal>
              <div className="section-label">Infrastructure Analysis</div>
              <h2 style={{ 
                fontFamily: "'Barlow Condensed',sans-serif", 
                fontSize: "clamp(28px, 3.5vw, 48px)", 
                fontWeight: 900, 
                letterSpacing: "-1px", 
                lineHeight: 1.0, 
                marginBottom: 22 
              }}>
                2201 Cell Sites.<br />
                <span style={{ 
                  color: "rgba(255,255,255,.28)", 
                  fontWeight: 400, 
                  fontStyle: "italic" 
                }}>
One Unified View.
                </span>
              </h2>
              <p style={{ 
                fontSize: 14, 
                color: "rgba(255,255,255,.38)", 
                lineHeight: 1.9, 
                fontWeight: 300, 
                maxWidth: 400 
              }}>
SpiriComp ingests KPI data from every cell site across 24 governorates, building a real-time picture of network health correlated with customer complaints and QoE degradation events.              </p>
              <button 
                className="btn-primary" 
                style={{ marginTop: 36, alignSelf: "flex-start" }} 
                onClick={() => navigate('/dashboard/map')}
                aria-label="View Complaint Map"
              >
                View Complaint Map <IconArrowRight size={14} color="white" />
              </button>
            </Reveal>
          </div>
        </div>

        {/* ── SPLIT 2 — Forecasting ── */}
        <div className="split-grid" style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr", 
          minHeight: 520, 
          borderTop: "1px solid rgba(255,255,255,.04)" 
        }}>
          <div style={{ 
            background: "#0E0E0E", 
            padding: "72px 56px", 
            display: "flex", 
            flexDirection: "column", 
            justifyContent: "center", 
            borderRight: "1px solid rgba(255,255,255,.05)" 
          }}>
            <Reveal>
              <div className="section-label">Predictive Intelligence
</div>
              <h2 style={{ 
                fontFamily: "'Barlow Condensed',sans-serif", 
                fontSize: "clamp(28px, 3.5vw, 48px)", 
                fontWeight: 900, 
                letterSpacing: "-1px", 
                lineHeight: 1.0, 
                marginBottom: 22 
              }}>
                7 Days Ahead.
<br />
                <span style={{ color: "#CF0A2C", fontStyle: "italic" }}>MAE = 2.91/day.</span>
              </h2>
              <p style={{ 
                fontSize: 14, 
                color: "rgba(255,255,255,.38)", 
                lineHeight: 1.9, 
                fontWeight: 300, 
                maxWidth: 400 
              }}>
XGBoost & Prophet forecast complaint peaks before they occur — giving NOC engineers critical time to act proactively and prevent SLA violations.              </p>
              <div style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}>
                {[
                  ["XGBoost", "Primary Model"],
                  ["Prophet", "Seasonality"],
                  ["MAE 2.91", "Precision"]
                ].map(([label, sublabel]) => (
                  <div key={label} style={{ 
                    border: "1px solid rgba(255,255,255,.07)", 
                    padding: "9px 16px", 
                    background: "rgba(255,255,255,.02)" 
                  }}>
                    <div style={{ 
                      fontFamily: "'Barlow Condensed',sans-serif", 
                      fontSize: 15, 
                      fontWeight: 800, 
                      color: "rgba(255,255,255,.85)" 
                    }}>
                      {label}
                    </div>
                    <div style={{ 
                      fontSize: 9, 
                      color: "rgba(255,255,255,.28)", 
                      marginTop: 3, 
                      letterSpacing: 2, 
                      textTransform: "uppercase" 
                    }}>
                      {sublabel}
                    </div>
                  </div>
                ))}
              </div>
              <button 
                className="btn-primary" 
                style={{ marginTop: 32, alignSelf: "flex-start" }} 
                onClick={() => navigate('/dashboard/forecast')}
                aria-label="Open Forecasting"
              >
                Open Forecasting <IconArrowRight size={14} color="white" />
              </button>
            </Reveal>
          </div>
          <div className="img-wrap" style={{ minHeight: 380 }}>
            <img src={dashImg} alt="Analytics dashboard forecasting" />
            <div style={{ 
              position: "absolute", 
              inset: 0, 
              background: "linear-gradient(to left, transparent 55%, rgba(8,8,8,.55) 100%)" 
            }} />
            <div style={{ position: "absolute", top: 28, right: 28 }}>
              <div style={{ 
                background: "rgba(207,10,44,.12)", 
                backdropFilter: "blur(12px)", 
                border: "1px solid rgba(207,10,44,.3)", 
                padding: "10px 18px", 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 10 
              }}>
                <span style={{ 
                  fontSize: 10, 
                  color: "#FF4060", 
                  letterSpacing: 2, 
                  fontWeight: 800 
                }}>
                  7-DAY FORECAST · ON
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section style={{ 
        background: "#0A0A0A", 
        padding: "100px 48px", 
        borderTop: "1px solid rgba(255,255,255,.05)" 
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Reveal>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "flex-end", 
              marginBottom: 56, 
              flexWrap: "wrap", 
              gap: 20 
            }}>
              <div>
                <div className="section-label">Platform Capabilities</div>
                <h2 style={{ 
                  fontFamily: "'Barlow Condensed',sans-serif", 
                  fontSize: "clamp(30px, 4.5vw, 58px)", 
                  fontWeight: 900, 
                  letterSpacing: "-1.5px", 
                  lineHeight: .96 
                }}>
                  SIX PILLARS OF<br />
                  <span style={{ 
                    color: "rgba(255,255,255,.2)", 
                    fontWeight: 400, 
                    fontStyle: "italic" 
                  }}>
                    NETWORK INTELLIGENCE
                  </span>
                </h2>
              </div>
              <button 
                className="btn-ghost" 
                style={{ flexShrink: 0, fontSize: 12 }} 
                onClick={onEnter}
                aria-label="Access All Modules"
              >
                Access All Modules <IconArrowUpRight size={13} />
              </button>
            </div>
          </Reveal>

          <div className="modules-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(3, 1fr)", 
            gap: 1, 
            background: "rgba(255,255,255,.04)" 
          }}>
            {MODULES.map((m, i) => {
              const Icon = m.icon;
              const isActive = activeModule === i;
              return (
                <Reveal key={m.title} delay={i * .06}>
                  <div 
                    className={`module-card ${isActive ? "active" : ""}`}
                    onMouseEnter={() => setActiveModule(i)}
                    style={{ height: "100%" }}
                  >
                    <div style={{ 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "flex-start", 
                      marginBottom: 22 
                    }}>
                      <div style={{ 
                        width: 50, 
                        height: 50, 
                        background: isActive ? "rgba(207,10,44,.1)" : "rgba(255,255,255,.03)", 
                        border: `1px solid ${isActive ? "rgba(207,10,44,.3)" : "rgba(255,255,255,.07)"}`, 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "center", 
                        transition: "all .35s", 
                        color: isActive ? "#CF0A2C" : "rgba(255,255,255,.3)" 
                      }}>
                        <Icon size={22} color="currentColor" />
                      </div>
                      <span className="tag">{m.tag}</span>
                    </div>
                    <h3 style={{ 
                      fontSize: 15, 
                      fontWeight: 700, 
                      lineHeight: 1.3, 
                      marginBottom: 12, 
                      whiteSpace: "pre-line", 
                      color: isActive ? "#fff" : "rgba(255,255,255,.8)" 
                    }}>
                      {m.title}
                    </h3>
                    <p style={{ 
                      fontSize: 13, 
                      color: "rgba(255,255,255,.32)", 
                      lineHeight: 1.8, 
                      fontWeight: 300 
                    }}>
                      {m.desc}
                    </p>
                    <div style={{ 
                      marginTop: 22, 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 5, 
                      fontSize: 10, 
                      fontWeight: 800, 
                      color: isActive ? "#CF0A2C" : "rgba(255,255,255,.18)", 
                      letterSpacing: 1.5, 
                      textTransform: "uppercase", 
                      transition: "color .3s" 
                    }}>
                      EXPLORE <IconArrowUpRight size={10} color="currentColor" />
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PHOTO BANNER ── */}
      <section style={{ position: "relative", height: 440, overflow: "hidden" }}>
        <img 
          src={towerImg} 
          alt="Telecom infrastructure" 
          style={{ 
            width: "100%", 
            height: "100%", 
            objectFit: "cover", 
            opacity: .32, 
            filter: "saturate(.35)" 
          }} 
        />
        <div style={{ 
          position: "absolute", 
          inset: 0, 
          background: "linear-gradient(135deg, rgba(207,10,44,.75) 0%, rgba(8,8,8,.92) 55%)" 
        }} />
        <div style={{ 
          position: "absolute", 
          inset: 0, 
          display: "flex", 
          alignItems: "center", 
          padding: "0 48px" 
        }}>
          <div style={{ 
            maxWidth: 1200, 
            width: "100%", 
            margin: "0 auto", 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            gap: 32, 
            flexWrap: "wrap" 
          }}>
            <Reveal>
              <div>
                <div style={{ 
                  fontSize: 10, 
                  letterSpacing: 4.5, 
                  textTransform: "uppercase", 
                  color: "rgba(255,255,255,.45)", 
                  marginBottom: 14, 
                  fontWeight: 800 
                }}>
                  QoE Intelligence
                </div>
                <h2 style={{ 
                  fontFamily: "'Barlow Condensed',sans-serif", 
                  fontSize: "clamp(26px, 4.5vw, 56px)", 
                  fontWeight: 900, 
                  letterSpacing: "-1.5px", 
                  lineHeight: .95 
                }}>
                  FROM REACTIVE FIXES<br />TO PREDICTIVE<br />
                  <span style={{ 
                    color: "rgba(255,255,255,.4)", 
                    fontWeight: 400, 
                    fontStyle: "italic" 
                  }}>
                    INTELLIGENCE.
                  </span>
                </h2>
                <p style={{ 
                  marginTop: 16, 
                  fontSize: 14, 
                  color: "rgba(255,255,255,.5)", 
                  fontWeight: 300, 
                  maxWidth: 420, 
                  lineHeight: 1.75 
                }}>
Reduce MTTR by correlating 552K KPI sessions with 50K complaints over 18 months of Ooredoo Tunisia data.                </p>
              </div>
            </Reveal>
            <button 
              onClick={onEnter}
              style={{ 
                background: "#fff", 
                color: "#080808", 
                border: "none", 
                padding: "18px 48px", 
                fontSize: 13, 
                fontWeight: 900, 
                cursor: "pointer", 
                letterSpacing: 2, 
                textTransform: "uppercase", 
                flexShrink: 0, 
                fontFamily: "'Barlow Condensed',sans-serif", 
                transition: "all .2s", 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 10 
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = "#CF0A2C";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = "#fff";
                e.currentTarget.style.color = "#080808";
              }}
              aria-label="Launch SpiriComp"
            >
              LAUNCH SPIRICOMP <IconArrowRight size={15} color="currentColor" />
            </button>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ 
        background: "#050505", 
        padding: "100px 48px", 
        borderTop: "1px solid rgba(255,255,255,.05)" 
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Reveal>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "flex-end", 
              marginBottom: 60, 
              flexWrap: "wrap", 
              gap: 20 
            }}>
              <div>
                <div className="section-label">Trusted by Industry Professionals
</div>
                <h2 style={{ 
                  fontFamily: "'Barlow Condensed',sans-serif", 
                  fontSize: "clamp(28px, 4vw, 54px)", 
                  fontWeight: 900, 
                  letterSpacing: "-1.5px", 
                  lineHeight: .96 
                }}>
                  WHAT NOC ENGINEERS<br />
                  <span style={{ 
                    color: "rgba(255,255,255,.2)", 
                    fontWeight: 400, 
                    fontStyle: "italic" 
                  }}>
                   SAY ABOUT SPIRICOMP

                  </span>
                </h2>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button 
                  onClick={() => setTestiIdx(t => (t - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)} 
                  style={{ 
                    width: 44, 
                    height: 44, 
                    background: "transparent", 
                    border: "1px solid rgba(255,255,255,.1)", 
                    color: "rgba(255,255,255,.4)", 
                    cursor: "pointer", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    transition: "all .2s" 
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = "#CF0A2C";
                    e.currentTarget.style.color = "#CF0A2C";
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,.1)";
                    e.currentTarget.style.color = "rgba(255,255,255,.4)";
                  }}
                  aria-label="Previous testimonial"
                >
                  <IconChevronLeft />
                </button>
                <button 
                  onClick={() => setTestiIdx(t => (t + 1) % TESTIMONIALS.length)} 
                  style={{ 
                    width: 44, 
                    height: 44, 
                    background: "#CF0A2C", 
                    border: "none", 
                    color: "white", 
                    cursor: "pointer", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    transition: "all .2s" 
                  }}
                  onMouseOver={e => e.currentTarget.style.background = "#E8102F"}
                  onMouseOut={e => e.currentTarget.style.background = "#CF0A2C"}
                  aria-label="Next testimonial"
                >
                  <IconChevronRight />
                </button>
              </div>
            </div>
          </Reveal>

          <div className="testi-grid" style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(2, 1fr)", 
            gap: 1, 
            background: "rgba(255,255,255,.04)" 
          }}>
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * .07}>
                <div className="testi-card" style={{ 
                  opacity: i === testiIdx || i === (testiIdx + 1) % TESTIMONIALS.length ? 1 : .35, 
                  transition: "opacity .45s" 
                }}>
                  <div style={{ marginBottom: 20 }}>
                    <IconQuote />
                  </div>
                  <div style={{ display: "flex", gap: 3, marginBottom: 20 }}>
                    {[...Array(5)].map((_, j) => (
                      <span key={j}><IconStar /></span>
                    ))}
                  </div>
                  <p style={{ 
                    fontSize: 14, 
                    color: "rgba(255,255,255,.6)", 
                    lineHeight: 1.85, 
                    fontWeight: 300, 
                    marginBottom: 32, 
                    fontStyle: "italic" 
                  }}>
                    "{t.text}"
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ 
                      width: 52, 
                      height: 52, 
                      overflow: "hidden", 
                      border: "1.5px solid rgba(207,10,44,.25)", 
                      flexShrink: 0 
                    }}>
                      <img 
                        src={t.av} 
                        alt={t.name} 
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                      />
                    </div>
                    <div>
                      <div style={{ 
                        fontSize: 14, 
                        fontWeight: 700, 
                        color: "rgba(255,255,255,.88)" 
                      }}>
                        {t.name}
                      </div>
                      <div style={{ 
                        fontSize: 11, 
                        color: "rgba(255,255,255,.32)", 
                        marginTop: 2 
                      }}>
                        {t.role}
                      </div>
                      <div style={{ 
                        fontSize: 10, 
                        color: "#CF0A2C", 
                        marginTop: 3, 
                        fontWeight: 700, 
                        letterSpacing: .5 
                      }}>
                        {t.company}
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 36 }}>
            {TESTIMONIALS.map((_, i) => (
              <div 
                key={i} 
                onClick={() => setTestiIdx(i)} 
                style={{ 
                  height: 3, 
                  width: testiIdx === i ? 32 : 8, 
                  background: testiIdx === i ? "#CF0A2C" : "rgba(255,255,255,.12)", 
                  cursor: "pointer", 
                  transition: "all .3s", 
                  borderRadius: 1 
                }} 
                role="button"
                tabIndex={0}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ 
        background: "#060606", 
        borderTop: "1px solid rgba(255,255,255,.06)", 
        padding: "56px 48px 32px" 
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            flexWrap: "wrap", 
            gap: 40, 
            marginBottom: 48 
          }}>
            <div>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: 11, 
                marginBottom: 14 
              }}>
                <div style={{ 
                  width: 36, 
                  height: 36, 
                  borderRadius: "50%", 
                  overflow: "hidden", 
                  border: "1.5px solid rgba(207,10,44,.5)" 
                }}>
                  <img 
                    src={logoImg} 
                    alt="SpiriComp Logo" 
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                  />
                </div>
                <span style={{ 
                  fontFamily: "'Barlow Condensed',sans-serif", 
                  fontWeight: 900, 
                  fontSize: 20, 
                  letterSpacing: "-.5px" 
                }}>
                  Spiri<span style={{ color: "#CF0A2C" }}>Comp</span>
                </span>
              </div>
              <p style={{ 
                fontSize: 12, 
                color: "rgba(255,255,255,.2)", 
                maxWidth: 230, 
                lineHeight: 1.8, 
                fontWeight: 300 
              }}>
Telecom Complaint Analytics & Network Intelligence Platform — Huawei Technologies Tunisia.
              </p>
              <div style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: 7, 
                marginTop: 20, 
                padding: "6px 14px", 
                border: "1px solid rgba(34,197,94,.18)", 
                background: "rgba(34,197,94,.04)" 
              }}>
                <div style={{ 
                  width: 5, 
                  height: 5, 
                  borderRadius: "50%", 
                  background: "#22C55E", 
                  animation: "pulse-dot 2s infinite" 
                }} />
                <span style={{ 
                  fontSize: 9, 
                  color: "rgba(34,197,94,.7)", 
                  letterSpacing: 2, 
                  fontWeight: 700 
                }}>
                  API · PORT 8501 · LIVE
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 56, flexWrap: "wrap" }}>
              {[
                { 
                  h: "Platform", 
                  items: ["Dashboard", "Complaint Map", "Anomaly Feed", "Forecasting", "Root Cause Analysis", "Segmentation", "NLP Analysis"] 
                },
                { 
                  h: "Resources", 
                  items: ["KPI/KQI Docs", "PFE Report", "GitHub", "Architecture", "NOC Guide"] 
                },
              ].map(col => (
                <div key={col.h}>
                  <div style={{ 
                    fontSize: 9, 
                    fontWeight: 800, 
                    letterSpacing: 3.5, 
                    color: "rgba(255,255,255,.18)", 
                    textTransform: "uppercase", 
                    marginBottom: 18 
                  }}>
                    {col.h}
                  </div>
                  {col.items.map(item => (
                    <div 
                      key={item} 
                      className="nav-link" 
                      style={{ 
                        display: "block", 
                        marginBottom: 12, 
                        fontSize: 12, 
                        textTransform: "none", 
                        letterSpacing: ".3px" 
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div style={{ 
            borderTop: "1px solid rgba(255,255,255,.05)", 
            paddingTop: 24, 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            flexWrap: "wrap", 
            gap: 12 
          }}>
            <p style={{ 
              fontSize: 11, 
              color: "rgba(255,255,255,.12)", 
              fontWeight: 400, 
              letterSpacing: .5 
            }}>
© 2026 SpiriComp — Huawei Technologies Tunisia · PFE Engineering
            </p>
            <div style={{ display: "flex", gap: 24 }}>
              {["Privacy", "Terms", "Contact"].map(l => (
                <span 
                  key={l} 
                  className="nav-link" 
                  style={{ fontSize: 11, color: "rgba(255,255,255,.16)" }}
                  role="button"
                  tabIndex={0}
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}