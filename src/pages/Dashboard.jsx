import React, { useEffect, useState } from 'react';
import { getRankings, getWinRate, getGlobalStats, getPlayerScore } from '../data/rankingEngine.js';
import { getSelectives, getSettings } from '../data/db.js';
import {
    Users, Gamepad2, Flame, Target, Loader, TrendingUp,
    Calendar, Trophy, Zap, Activity, ChevronUp, ChevronDown, Minus
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
    CartesianGrid, Area, AreaChart, Legend
} from 'recharts';

/* ── tiny util ─────────────────────────────────── */
function getInitials(name) {
    if (!name) return '';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* ── Custom Tooltip for chart ──────────────────── */
function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'rgba(10,14,23,0.95)',
            border: '1px solid rgba(52,211,153,0.25)',
            borderRadius: 12,
            padding: '10px 16px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontSize: 12,
        }}>
            <div style={{ color: '#64748b', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            {payload.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.stroke, boxShadow: `0 0 6px ${entry.stroke}` }} />
                    <span style={{ color: '#94a3b8' }}>{entry.name}</span>
                    <span style={{ color: '#f1f5f9', fontWeight: 700, marginLeft: 'auto', paddingLeft: 16 }}>{entry.value}</span>
                </div>
            ))}
        </div>
    );
}

/* ── Animated number counter ───────────────────── */
function CountUp({ value }) {
    const [displayed, setDisplayed] = useState(0);
    useEffect(() => {
        if (!value) return;
        let start = 0;
        const duration = 800;
        const steps = 40;
        const increment = value / steps;
        const timer = setInterval(() => {
            start += increment;
            if (start >= value) { setDisplayed(value); clearInterval(timer); }
            else setDisplayed(Math.floor(start));
        }, duration / steps);
        return () => clearInterval(timer);
    }, [value]);
    return <>{displayed}</>;
}

/* ── Stat Card ─────────────────────────────────── */
function StatCard({ icon: Icon, value, label, sub, color, gradient, glow }) {
    return (
        <div className="dash-stat-card" style={{
            background: 'linear-gradient(135deg, rgba(26,35,50,0.9) 0%, rgba(17,24,39,0.95) 100%)',
            border: `1px solid ${color}22`,
            borderRadius: 20,
            padding: '22px 24px',
            position: 'relative',
            overflow: 'hidden',
            transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
            cursor: 'default',
        }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = `${color}55`;
                e.currentTarget.style.boxShadow = `0 16px 40px rgba(0,0,0,0.4), 0 0 30px ${color}20`;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = `${color}22`;
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Background glow orb */}
            <div style={{
                position: 'absolute', top: -20, right: -20,
                width: 100, height: 100, borderRadius: '50%',
                background: `radial-gradient(circle, ${color}18 0%, transparent 70%)`,
                filter: 'blur(20px)',
            }} />
            {/* Top accent line */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                opacity: 0.6,
            }} />

            <div className="dash-stat-icon" style={{
                width: 46, height: 46, borderRadius: 14,
                background: gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14, boxShadow: `0 4px 14px ${color}30`,
                position: 'relative',
            }}>
                <Icon size={22} color="white" strokeWidth={2} />
            </div>

            <div className="dash-stat-value" style={{
                fontFamily: 'var(--font-display)',
                fontSize: 34, fontWeight: 800,
                color: '#f1f5f9', lineHeight: 1,
                letterSpacing: -1,
            }}>
                <CountUp value={typeof value === 'number' ? value : parseFloat(value) || 0} />
                {typeof value === 'string' && value.includes('%') && '%'}
            </div>

            <div className="dash-stat-label" style={{ fontSize: 13, color: '#64748b', marginTop: 6, fontWeight: 500 }}>{label}</div>
            {sub && <div className="dash-stat-sub" style={{ fontSize: 11, color: color, marginTop: 4, fontWeight: 600, opacity: 0.8 }}>{sub}</div>}
        </div>
    );
}

/* ── Podium Player ─────────────────────────────── */
function PodiumPlayer({ player, place, isElo, getInitials }) {
    const configs = {
        1: { medal: '🥇', color: '#fbbf24', size: 84, barH: 110, glow: 'rgba(251,191,36,0.4)', zIndex: 2 },
        2: { medal: '🥈', color: '#94a3b8', size: 68, barH: 78, glow: 'rgba(148,163,184,0.3)', zIndex: 1 },
        3: { medal: '🥉', color: '#cd7f32', size: 64, barH: 56, glow: 'rgba(205,127,50,0.3)', zIndex: 1 },
    };
    const cfg = configs[place];
    const score = getPlayerScore(player, { rankingMode: isElo ? 'elo' : 'points' });

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            zIndex: cfg.zIndex, transition: 'transform 0.35s ease',
        }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-6px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{ fontSize: place === 1 ? 28 : 22, marginBottom: 8 }}>{cfg.medal}</div>

            {/* Avatar */}
            <div style={{
                width: cfg.size, height: cfg.size, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e2d42, #243044)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: place === 1 ? 28 : 22, fontWeight: 800,
                color: cfg.color,
                border: `3px solid ${cfg.color}`,
                boxShadow: `0 0 0 4px ${cfg.glow}, 0 8px 24px ${cfg.glow}`,
                marginBottom: 10,
                overflow: 'hidden',
                transition: 'box-shadow 0.3s',
            }}>
                {player.photo
                    ? <img src={player.photo} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : getInitials(player.name)
                }
            </div>

            {/* Name */}
            <div style={{ fontWeight: 700, fontSize: place === 1 ? 15 : 13, color: '#f1f5f9', textAlign: 'center', lineHeight: 1.3 }}>
                {player.name?.split(' ')[0]}
            </div>
            {player.nickname && (
                <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600, marginTop: 2, opacity: 0.9 }}>
                    {player.nickname}
                </div>
            )}
            <div style={{
                fontFamily: 'var(--font-display)', fontWeight: 800,
                fontSize: place === 1 ? 20 : 16, color: cfg.color,
                marginTop: 6, letterSpacing: -0.5,
            }}>
                {score}
                <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, marginLeft: 2 }}>pts</span>
            </div>

            {/* Bar */}
            <div style={{
                width: place === 1 ? 88 : 72, height: cfg.barH,
                marginTop: 10, borderRadius: '10px 10px 0 0',
                background: `linear-gradient(180deg, ${cfg.color}30 0%, ${cfg.color}08 100%)`,
                border: `1px solid ${cfg.color}40`,
                borderBottom: 'none',
                position: 'relative', overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0,
                    height: '40%',
                    background: `linear-gradient(180deg, ${cfg.color}20, transparent)`,
                }} />
                <div style={{
                    position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                    fontSize: 20, opacity: 0.15, userSelect: 'none',
                }}>
                    {place}
                </div>
            </div>
        </div>
    );
}

/* ── Main Component ────────────────────────────── */
export default function Dashboard() {
    const [rankings, setRankings] = useState([]);
    const [stats, setStats] = useState({});
    const [selectives, setSelectives] = useState([]);
    const [settings, setSettingsState] = useState({ rankingMode: 'points' });
    const [loading, setLoading] = useState(true);

    useEffect(() => { refresh(); }, []);

    async function refresh() {
        setLoading(true);
        const [r, st, sel, set] = await Promise.all([
            getRankings('points'), getGlobalStats(), getSelectives(), getSettings()
        ]);
        setRankings(r);
        setStats(st || {});
        setSelectives(sel);
        if (set) setSettingsState(set);
        setLoading(false);
    }

    const isElo = false;
    const top3 = rankings.slice(0, 3);
    const top10 = rankings.slice(0, 10);
    const lastSelective = selectives.filter(s => s.status === 'completed').slice(-1)[0];
    const nextSelective = selectives.filter(s => s.status === 'active').slice(0, 1)[0];

    /* Chart Data */
    const validSelectiveNames = new Set(selectives.map(s => s.name));
    const top5Players = rankings.slice(0, 5).map(p => ({
        ...p,
        pointsHistory: Array.isArray(p.pointsHistory)
            ? p.pointsHistory.filter(h => validSelectiveNames.has(h.eventName))
            : []
    }));
    let chartData = [];
    if (top5Players.length > 0) {
        const allEventsMap = new Map();
        top5Players.forEach(p => {
            if (Array.isArray(p.pointsHistory)) {
                p.pointsHistory.forEach((h, idx) => {
                    const key = h.date || `Event-${idx}`;
                    if (!allEventsMap.has(key)) allEventsMap.set(key, { name: h.eventName || `Rodada ${idx + 1}`, date: h.date, idx });
                });
            }
        });
        const sortedEvents = Array.from(allEventsMap.values()).sort((a, b) =>
            a.date && b.date ? new Date(a.date) - new Date(b.date) : a.idx - b.idx
        );
        chartData = sortedEvents.map(evt => {
            const point = { name: evt.name };
            top5Players.forEach(p => {
                const key = p.nickname || p.name;
                point[key] = null;
                if (Array.isArray(p.pointsHistory)) {
                    const h = p.pointsHistory.find(h =>
                        (h.date && h.date === evt.date) || (!h.date && h.eventName === evt.name)
                    );
                    if (h) point[key] = (isElo ? (h.eloRating || 1000) : (h.points || 0));
                }
            });
            return point;
        });
        const currentPoint = { name: 'Atual' };
        top5Players.forEach(p => {
            currentPoint[p.nickname || p.name] = getPlayerScore(p, { rankingMode: 'points' });
        });
        chartData.push(currentPoint);
    }

    const lineColors = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa'];

    /* Loading */
    if (loading) {
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '60vh', gap: 16,
            }}>
                <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    border: '3px solid rgba(52,211,153,0.15)',
                    borderTopColor: '#34d399',
                    animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>Carregando Dashboard...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        );
    }

    /* ── Render ──────────────────────────────────── */
    return (
        <div style={{ animation: 'fadeIn 0.4s ease', opacity: 1 }}>
            <style>{`
                @keyframes fadeIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
                @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(52,211,153,0.15) } 50% { box-shadow: 0 0 40px rgba(52,211,153,0.3) } }
                @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
                .dash-row-hover:hover { background: rgba(52,211,153,0.04) !important; transform: translateX(2px); }
                .dash-row-hover { transition: all 0.2s ease; }
                @media (max-width: 768px) {
                    .dash-podium-grid { grid-template-columns: 1fr !important; }
                    .top10-table-header { grid-template-columns: 48px 1fr 64px !important; }
                    .top10-table-row { grid-template-columns: 48px 1fr 64px !important; }
                    .hide-mob { display: none !important; }
                    
                    .dash-stats-responsive { grid-template-columns: 1fr 1fr !important; gap: 10px !important; margin-bottom: 20px !important; }
                    .dash-stat-card { padding: 14px 16px !important; border-radius: 16px !important; }
                    .dash-stat-icon { width: 34px !important; height: 34px !important; margin-bottom: 10px !important; border-radius: 10px !important; }
                    .dash-stat-icon svg { width: 18px !important; height: 18px !important; }
                    .dash-stat-value { font-size: 24px !important; }
                    .dash-stat-label { font-size: 11px !important; margin-top: 4px !important; line-height: 1.1 !important; }
                    .dash-stat-sub { font-size: 9px !important; margin-top: 2px !important; }
                }
            `}</style>

            {/* ── Page Header ── */}
            <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{
                            width: 6, height: 32, borderRadius: 3,
                            background: 'linear-gradient(180deg, #34d399, #059669)',
                        }} />
                        <h1 style={{
                            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
                            color: '#f1f5f9', margin: 0, letterSpacing: -0.5,
                        }}>
                            Dashboard
                        </h1>
                    </div>
                    <p style={{ color: '#475569', fontSize: 14, marginLeft: 16 }}>
                        Visão geral da liga • A.C.L.S Campo Largo
                    </p>
                </div>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                    background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)',
                    borderRadius: 12, fontSize: 12, color: '#34d399', fontWeight: 600,
                }}>
                    <Activity size={14} />
                    {isElo ? 'Sistema ELO' : 'Pontos Fixos'}
                </div>
            </div>

            {/* ── Stat Cards ── */}
            <div className="dash-stats-responsive" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16, marginBottom: 28,
            }}>
                <StatCard
                    icon={Users}
                    value={stats.totalPlayers || 0}
                    label="Jogadores"
                    color="#34d399"
                    gradient="linear-gradient(135deg, #10b981, #059669)"
                />
                <StatCard
                    icon={Gamepad2}
                    value={stats.totalMatches || 0}
                    label="Total de Jogos"
                    color="#fbbf24"
                    gradient="linear-gradient(135deg, #f59e0b, #d97706)"
                />
                <StatCard
                    icon={Flame}
                    value={stats.bestStreak || 0}
                    label="Maior Sequência"
                    sub={stats.bestStreakPlayer ? (stats.bestStreakPlayer.nickname || stats.bestStreakPlayer.name) : null}
                    color="#f87171"
                    gradient="linear-gradient(135deg, #ef4444, #dc2626)"
                />
                <StatCard
                    icon={Target}
                    value={stats.bestWinRate || 0}
                    label="Melhor Aproveitamento"
                    sub={stats.bestWinRatePlayer ? (stats.bestWinRatePlayer.nickname || stats.bestWinRatePlayer.name) : null}
                    color="#60a5fa"
                    gradient="linear-gradient(135deg, #3b82f6, #2563eb)"
                />
            </div>

            {/* ── Podium + Chart ── */}
            <div className="dash-podium-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 20, marginBottom: 24 }}>

                {/* Podium Card */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(26,35,50,0.95) 0%, rgba(15,20,32,0.98) 100%)',
                    border: '1px solid rgba(251,191,36,0.18)',
                    borderRadius: 22, overflow: 'hidden', position: 'relative',
                    boxShadow: '0 0 40px rgba(251,191,36,0.08)',
                }}>
                    {/* Header gradient strip */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                        background: 'linear-gradient(90deg, transparent, #fbbf24, #f59e0b, transparent)',
                    }} />

                    <div style={{ padding: '20px 24px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Trophy size={18} color="#fbbf24" />
                            <span style={{
                                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9',
                            }}>Pódio</span>
                            <span style={{
                                marginLeft: 'auto', fontSize: 11, color: '#fbbf24',
                                background: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: 20,
                                fontWeight: 600,
                            }}>Top 3</span>
                        </div>
                    </div>

                    {top3.length >= 3 ? (
                        <div style={{
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                            gap: 8, padding: '24px 16px 0',
                        }}>
                            <PodiumPlayer player={top3[1]} place={2} isElo={isElo} getInitials={getInitials} />
                            <PodiumPlayer player={top3[0]} place={1} isElo={isElo} getInitials={getInitials} />
                            <PodiumPlayer player={top3[2]} place={3} isElo={isElo} getInitials={getInitials} />
                        </div>
                    ) : (
                        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🎱</div>
                            <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>Cadastre jogadores</div>
                            <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>Adicione ao menos 3 para ver o pódio</div>
                        </div>
                    )}

                    {/* Floor line */}
                    <div style={{
                        margin: '0 16px',
                        height: 2,
                        background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.3), rgba(148,163,184,0.2), rgba(205,127,50,0.2), transparent)',
                    }} />

                    {/* Selective pills */}
                    <div style={{ padding: '14px 20px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[
                            { label: '📋 Última Seletiva', data: lastSelective },
                            { label: '🎯 Próxima Seletiva', data: nextSelective },
                        ].map(({ label, data }) => (
                            <div key={label} style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 12, padding: '10px 14px',
                                display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 10, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                                    {data ? (
                                        <>
                                            <div style={{ fontWeight: 700, fontSize: 13, color: '#e2e8f0', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                                {data.mode === 'elimination' ? 'Eliminatória' : data.mode === 'round-robin' ? 'Todos contra Todos' : 'Sistema Suíço'}
                                                {' · '}{data.playerIds?.length || 0} jogadores
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>Nenhuma</div>
                                    )}
                                </div>
                                <Calendar size={14} color="#475569" style={{ flexShrink: 0 }} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chart Card */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(26,35,50,0.95) 0%, rgba(15,20,32,0.98) 100%)',
                    border: '1px solid rgba(52,211,153,0.1)',
                    borderRadius: 22, overflow: 'hidden', position: 'relative',
                    boxShadow: '0 0 40px rgba(52,211,153,0.05)',
                }}>
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                        background: 'linear-gradient(90deg, transparent, #34d399, #10b981, transparent)',
                    }} />
                    <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TrendingUp size={18} color="#34d399" />
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
                            Evolução
                        </span>
                        <span style={{
                            marginLeft: 8, fontSize: 11, color: '#64748b',
                            background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 20,
                        }}>{isElo ? 'Rating ELO' : 'Pontos Fixos'}</span>

                        {/* Legend dots */}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {top5Players.slice(0, 5).map((p, i) => (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: lineColors[i], boxShadow: `0 0 6px ${lineColors[i]}80` }} />
                                    <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{p.nickname || p.name?.split(' ')[0]}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {chartData.length > 0 ? (
                        <div style={{ padding: '0 8px 20px' }}>
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                                    <defs>
                                        {lineColors.map((c, i) => (
                                            <linearGradient key={i} id={`grad${i}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                                                <stop offset="95%" stopColor={c} stopOpacity={0} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fill: '#475569', fontSize: 10 }}
                                        axisLine={false} tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fill: '#475569', fontSize: 10 }}
                                        axisLine={false} tickLine={false}
                                        width={40}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    {rankings.slice(0, 5).map((p, i) => (
                                        <Area
                                            key={p.id}
                                            type="monotone"
                                            dataKey={p.nickname || p.name}
                                            stroke={lineColors[i]}
                                            strokeWidth={2.5}
                                            fill={`url(#grad${i})`}
                                            dot={{ r: 4, fill: lineColors[i], stroke: '#0a0e17', strokeWidth: 2 }}
                                            activeDot={{ r: 6, fill: lineColors[i], stroke: 'white', strokeWidth: 2, filter: `drop-shadow(0 0 8px ${lineColors[i]})` }}
                                            connectNulls={true}
                                        />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 240, color: '#475569' }}>
                            <Zap size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                            <div style={{ fontSize: 14, fontWeight: 500 }}>Sem dados de evolução ainda</div>
                            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>Registre partidas para ver o gráfico</div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Top 10 Table ── */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(26,35,50,0.95) 0%, rgba(15,20,32,0.98) 100%)',
                border: '1px solid rgba(148,163,184,0.08)',
                borderRadius: 22, overflow: 'hidden', position: 'relative',
            }}>
                {/* Header accent */}
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.3), transparent)',
                }} />

                <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Trophy size={18} color="#fbbf24" />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
                        Ranking Top 10
                    </span>
                    <span style={{
                        fontSize: 11, color: '#64748b',
                        background: 'rgba(255,255,255,0.04)', padding: '2px 10px', borderRadius: 20, marginLeft: 4,
                    }}>{isElo ? 'Sistema ELO' : 'Pontos Fixos'}</span>
                </div>

                {top10.length > 0 ? (
                    <div style={{ padding: '0 12px 16px' }}>
                        {/* Table Header */}
                        <div className="top10-table-header" style={{
                            display: 'grid',
                            gridTemplateColumns: '48px 1fr 100px 52px 52px 64px 64px',
                            padding: '8px 12px',
                            fontSize: 10, fontWeight: 700, color: '#475569',
                            textTransform: 'uppercase', letterSpacing: 0.8,
                            borderBottom: '1px solid rgba(148,163,184,0.06)',
                            marginBottom: 4,
                        }}>
                            <span>#</span>
                            <span>Jogador</span>
                            <span style={{ textAlign: 'center' }}>{isElo ? 'ELO' : 'Pontos'}</span>
                            <span className="hide-mob" style={{ textAlign: 'center' }}>V</span>
                            <span className="hide-mob" style={{ textAlign: 'center' }}>D</span>
                            <span className="hide-mob" style={{ textAlign: 'center' }}>%</span>
                            <span className="hide-mob" style={{ textAlign: 'center' }}>Seq.</span>
                        </div>

                        {top10.map((player, index) => {
                            const isTop3 = index < 3;
                            const colorMap = ['#fbbf24', '#94a3b8', '#cd7f32'];
                            const rankColor = isTop3 ? colorMap[index] : '#475569';
                            const score = getPlayerScore(player, { rankingMode: 'points' });
                            const winRate = getWinRate(player);

                            return (
                                <div key={player.id} className="dash-row-hover top10-table-row" style={{
                                    display: 'grid',
                                    gridTemplateColumns: '48px 1fr 100px 52px 52px 64px 64px',
                                    alignItems: 'center',
                                    padding: '10px 12px',
                                    borderRadius: 12,
                                    marginBottom: 2,
                                    background: isTop3 ? `rgba(${index === 0 ? '251,191,36' : index === 1 ? '148,163,184' : '205,127,50'},0.04)` : 'transparent',
                                    border: isTop3 ? `1px solid rgba(${index === 0 ? '251,191,36' : index === 1 ? '148,163,184' : '205,127,50'},0.08)` : '1px solid transparent',
                                }}>
                                    {/* Rank */}
                                    <div>
                                        <div style={{
                                            width: 30, height: 30, borderRadius: 10,
                                            background: isTop3 ? `rgba(${index === 0 ? '251,191,36' : index === 1 ? '148,163,184' : '205,127,50'},0.12)` : 'rgba(255,255,255,0.04)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
                                            color: rankColor,
                                            boxShadow: isTop3 ? `0 0 12px rgba(${index === 0 ? '251,191,36' : index === 1 ? '148,163,184' : '205,127,50'},0.2)` : 'none',
                                        }}>
                                            {index + 1}
                                        </div>
                                    </div>

                                    {/* Player */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #1e2d42, #243044)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 13, fontWeight: 700, color: rankColor,
                                            border: `2px solid ${rankColor}30`,
                                            flexShrink: 0, overflow: 'hidden',
                                        }}>
                                            {player.photo
                                                ? <img src={player.photo} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : getInitials(player.name)
                                            }
                                        </div>
                                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                            <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {player.name}
                                            </div>
                                            {player.nickname && (
                                                <div style={{ fontSize: 11, color: rankColor, fontWeight: 500, opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {player.nickname}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Score */}
                                    <div style={{ textAlign: 'center' }}>
                                        <span style={{
                                            fontFamily: 'var(--font-display)', fontWeight: 800,
                                            fontSize: 16, color: '#34d399',
                                            textShadow: '0 0 10px rgba(52,211,153,0.4)',
                                        }}>{score}</span>
                                    </div>

                                    {/* Wins */}
                                    <div className="hide-mob" style={{ textAlign: 'center', color: '#34d399', fontWeight: 700, fontSize: 14 }}>
                                        {player.wins || 0}
                                    </div>

                                    {/* Losses */}
                                    <div className="hide-mob" style={{ textAlign: 'center', color: '#f87171', fontWeight: 700, fontSize: 14 }}>
                                        {player.losses || 0}
                                    </div>

                                    {/* Win Rate */}
                                    <div className="hide-mob" style={{ textAlign: 'center' }}>
                                        <div style={{
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                            background: winRate >= 60 ? 'rgba(52,211,153,0.12)' : winRate >= 40 ? 'rgba(251,191,36,0.1)' : 'rgba(248,113,113,0.1)',
                                            color: winRate >= 60 ? '#34d399' : winRate >= 40 ? '#fbbf24' : '#f87171',
                                        }}>{winRate}%</div>
                                    </div>

                                    {/* Streak */}
                                    <div className="hide-mob" style={{ textAlign: 'center' }}>
                                        {player.streak > 0 ? (
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                                                background: 'rgba(251,146,60,0.12)', color: '#fb923c',
                                            }}>
                                                🔥 {player.streak}
                                            </div>
                                        ) : (
                                            <span style={{ color: '#334155', fontSize: 16 }}>—</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ padding: '56px 24px', textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🎱</div>
                        <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 15 }}>Sem jogadores cadastrados</div>
                        <div style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>Adicione jogadores para ver o ranking</div>
                    </div>
                )}
            </div>
        </div>
    );
}
