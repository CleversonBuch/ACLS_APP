import React, { useState, useEffect } from 'react';
import { getRankings, getWinRate, getPlayerScore, recalculateAllRankings } from '../data/rankingEngine.js';
import { getSettings, updateSettings, resetCurrentRanking, getSelectives, getPlayers } from '../data/db.js';
import {
    Settings, Crown, Award, Zap, Trophy, Star, Flame,
    Trash2, AlertTriangle, XCircle, Loader, HelpCircle, Activity, TrendingUp
} from 'lucide-react';
import {
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart
} from 'recharts';
import { useAdmin } from '../contexts/AdminContext.jsx';
import TiebreakerHelpModal from '../components/TiebreakerHelpModal.jsx';

/* ── Custom Tooltip ──────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'rgba(10,14,23,0.96)',
            border: '1px solid rgba(52,211,153,0.2)',
            borderRadius: 12, padding: '10px 16px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', fontSize: 12
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

export default function Rankings() {
    const { isAdmin } = useAdmin();
    const [rankings, setRankingsList] = useState([]);
    const [settings, setSettingsState] = useState({ rankingMode: 'points' });
    const [localMode, setLocalMode] = useState('points');
    const [selectivesList, setSelectivesList] = useState([]);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [helpModalOpen, setHelpModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => { refresh(); }, []);

    async function refresh() {
        setLoading(true);
        const [r, s, sel] = await Promise.all([getRankings(localMode), getSettings(), getSelectives()]);
        setRankingsList(r);
        if (s) setSettingsState(s);
        setSelectivesList(sel);
        setLoading(false);
    }

    async function handleResetRanking() {
        setLoading(true);
        await resetCurrentRanking();
        setDeleteConfirmOpen(false);
        await refresh();
    }

    async function handleRecalculate() {
        if (!confirm('Isto irá recalcular o ELO e todas as estatísticas de todos os jogadores cronologicamente. Continuar?')) return;
        setLoading(true);
        await recalculateAllRankings();
        await refresh();
    }

    async function toggleMode(mode) {
        setLoading(true);
        setLocalMode(mode);
        const r = await getRankings(mode);
        setRankingsList(r);
        setLoading(false);
    }

    const isElo = localMode === 'elo';

    function getInitials(name) {
        if (!name) return '';
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    function getScore(player) {
        return getPlayerScore(player, { rankingMode: localMode });
    }

    const top3 = rankings.slice(0, 3);
    const elite = rankings.slice(3, 8);   // 4th–8th
    const rest = rankings.slice(8);        // 9th+

    // Chart Data
    const lineColors = ['#34d399', '#fbbf24', '#60a5fa', '#f472b6', '#a78bfa'];
    let chartData = [];
    const validSelectiveNames = new Set(selectivesList.map(s => s.name));
    const top5Players = rankings.slice(0, 5).map(p => ({
        ...p,
        pointsHistory: Array.isArray(p.pointsHistory)
            ? p.pointsHistory.filter(h => validSelectiveNames.has(h.eventName))
            : []
    }));

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
                    if (h) point[key] = isElo ? (h.eloRating || 1000) : (h.points || 0);
                }
            });
            return point;
        });
        const currentPoint = { name: 'Atual' };
        top5Players.forEach(p => {
            currentPoint[p.nickname || p.name] = getScore(p);
        });
        chartData.push(currentPoint);
    }

    const medalCfg = [
        { color: '#fbbf24', glow: 'rgba(251,191,36,0.35)', label: 'CAMPEÃO', medal: '🥇', place: '1º' },
        { color: '#94a3b8', glow: 'rgba(148,163,184,0.25)', label: 'VICE', medal: '🥈', place: '2º' },
        { color: '#cd7f32', glow: 'rgba(205,127,50,0.25)', label: '3º LUGAR', medal: '🥉', place: '3º' },
    ];

    /* ── Loading ── */
    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
                <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    border: '3px solid rgba(52,211,153,0.15)',
                    borderTopColor: '#34d399',
                    animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>Atualizando ranking...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ animation: 'fadeIn 0.4s ease' }}>
            <style>{`
                @keyframes fadeIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
                .rank-row:hover { background: rgba(52,211,153,0.04) !important; transform: translateX(2px); }
                .rank-row { transition: all 0.2s ease !important; }
                .elite-card:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 32px rgba(0,0,0,0.4) !important; }
                .podium-card:hover { transform: translateY(-6px) !important; }
                .podium-card { transition: transform 0.3s ease !important; }
                .elite-card { transition: transform 0.25s ease, box-shadow 0.25s ease !important; }
            `}</style>

            {/* ── Header ── */}
            <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 32, borderRadius: 3, background: 'linear-gradient(180deg, #fbbf24, #f59e0b)' }} />
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Trophy size={26} color="#fbbf24" />
                            Ranking Geral
                        </h1>
                        <button onClick={() => setHelpModalOpen(true)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', padding: 4 }}>
                            <HelpCircle size={18} />
                        </button>
                    </div>
                    <p style={{ color: '#475569', fontSize: 14, marginLeft: 16 }}>
                        {rankings.length} jogadores classificados · {isElo ? 'ELO Rating' : 'Pontos Fixos'}
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                    {/* Mode toggle */}
                    <div style={{
                        display: 'flex', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 12, padding: 4, gap: 4,
                    }}>
                        {[{ label: 'Pontos Fixos', mode: 'points' }, { label: 'ELO Rating', mode: 'elo' }].map(opt => (
                            <button key={opt.mode} onClick={() => toggleMode(opt.mode)} style={{
                                padding: '7px 16px', borderRadius: 8, border: 'none',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                background: (isElo ? opt.mode === 'elo' : opt.mode === 'points')
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'transparent',
                                color: (isElo ? opt.mode === 'elo' : opt.mode === 'points') ? 'white' : '#64748b',
                                transition: 'all 0.2s',
                            }}>
                                {opt.label}
                            </button>
                        ))}

                    </div>

                    {isAdmin && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={handleRecalculate} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.15)',
                                background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                                <Activity size={14} /> Recalcular Stats
                            </button>
                            <button onClick={() => setDeleteConfirmOpen(true)} style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)',
                                background: 'rgba(239,68,68,0.08)', color: '#f87171',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}>
                                <Trash2 size={14} /> Apagar Dados
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {rankings.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 12 }}>
                    <div style={{ fontSize: 56 }}>🏆</div>
                    <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 16 }}>Sem ranking ainda</div>
                    <div style={{ color: '#475569', fontSize: 13 }}>Cadastre jogadores e registre partidas</div>
                </div>
            ) : (
                <>
                    {/* ══════════════════════════
                        PÓDIO – TOP 3
                    ══════════════════════════ */}
                    {top3.length >= 3 && (
                        <div style={{ marginBottom: 28 }}>
                            {/* Section Label */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 22 }}>
                                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.2))' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Crown size={16} color="#fbbf24" />
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: '#fbbf24', letterSpacing: 4, textTransform: 'uppercase' }}>PÓDIO</span>
                                    <Crown size={16} color="#fbbf24" />
                                </div>
                                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(251,191,36,0.2), transparent)' }} />
                            </div>

                            {/* Cards: 2nd - 1st - 3rd */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', gap: 16, alignItems: 'end' }}>
                                {[1, 0, 2].map(idx => {
                                    const p = top3[idx];
                                    const cfg = medalCfg[idx];
                                    const isFirst = idx === 0;
                                    return (
                                        <div key={p.id} className="podium-card" style={{
                                            background: `linear-gradient(160deg, rgba(${isFirst ? '251,191,36' : idx === 1 ? '148,163,184' : '205,127,50'},0.1) 0%, rgba(15,20,32,0.97) 60%)`,
                                            border: `2px solid ${cfg.color}${isFirst ? '55' : '35'}`,
                                            borderRadius: 22,
                                            padding: isFirst ? '36px 28px 28px' : '28px 22px 22px',
                                            textAlign: 'center',
                                            boxShadow: `0 0 ${isFirst ? 60 : 30}px ${cfg.glow}, 0 8px 40px rgba(0,0,0,0.4)`,
                                            position: 'relative',
                                            overflow: 'hidden',
                                            cursor: 'default',
                                        }}>
                                            {/* Top accent line */}
                                            <div style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                                background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`,
                                                opacity: isFirst ? 1 : 0.6,
                                            }} />

                                            {/* Background radial glow */}
                                            <div style={{
                                                position: 'absolute', top: '30%', left: '50%',
                                                transform: 'translate(-50%, -50%)',
                                                width: 200, height: 200, borderRadius: '50%',
                                                background: `radial-gradient(circle, ${cfg.color}12 0%, transparent 70%)`,
                                                pointerEvents: 'none',
                                            }} />

                                            {/* Medal emoji */}
                                            <div style={{ fontSize: isFirst ? 52 : 38, marginBottom: 4, position: 'relative' }}>{cfg.medal}</div>

                                            {/* Label badge */}
                                            <div style={{
                                                display: 'inline-block',
                                                padding: '3px 12px', borderRadius: 20, marginBottom: 16,
                                                background: `${cfg.color}18`,
                                                border: `1px solid ${cfg.color}35`,
                                                fontSize: 9, fontWeight: 800, letterSpacing: 2.5,
                                                color: cfg.color, textTransform: 'uppercase',
                                            }}>
                                                {cfg.label}
                                            </div>

                                            {/* Avatar */}
                                            <div style={{
                                                width: isFirst ? 96 : 76, height: isFirst ? 96 : 76,
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #1e2d42, #0f1420)',
                                                border: `3px solid ${cfg.color}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: isFirst ? 34 : 26, fontWeight: 800, color: cfg.color,
                                                margin: '0 auto 14px',
                                                overflow: 'hidden',
                                                boxShadow: `0 0 0 4px ${cfg.glow}, 0 6px 20px ${cfg.glow}`,
                                                position: 'relative',
                                            }}>
                                                {p.photo
                                                    ? <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : getInitials(p.name)
                                                }
                                            </div>

                                            {/* Name */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: isFirst ? 20 : 16, fontWeight: 800,
                                                color: '#f1f5f9', marginBottom: 2, position: 'relative',
                                            }}>
                                                {p.name}
                                            </div>
                                            {p.nickname && (
                                                <div style={{ fontSize: 12, color: cfg.color, fontWeight: 600, marginBottom: 10, opacity: 0.9 }}>
                                                    "{p.nickname}"
                                                </div>
                                            )}

                                            {/* Score */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: isFirst ? 42 : 32, fontWeight: 900,
                                                color: cfg.color, lineHeight: 1, marginBottom: 2,
                                                textShadow: `0 0 20px ${cfg.glow}`,
                                                position: 'relative',
                                            }}>
                                                {getScore(p)}
                                            </div>
                                            <div style={{ fontSize: 10, color: '#475569', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                                                {isElo ? 'ELO Rating' : 'Pontos'}
                                            </div>

                                            {/* Stats strip */}
                                            <div style={{
                                                display: 'flex', justifyContent: 'center', gap: 0,
                                                borderTop: `1px solid ${cfg.color}20`,
                                                paddingTop: 12, position: 'relative',
                                            }}>
                                                {[
                                                    { val: p.wins || 0, label: 'VIT', color: '#34d399' },
                                                    { val: p.losses || 0, label: 'DER', color: '#f87171' },
                                                    { val: getWinRate(p) + '%', label: 'APROV', color: '#f1f5f9' },
                                                ].map((stat, i) => (
                                                    <div key={i} style={{
                                                        flex: 1, textAlign: 'center',
                                                        borderRight: i < 2 ? `1px solid ${cfg.color}15` : 'none',
                                                        padding: '4px 0',
                                                    }}>
                                                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: stat.color }}>
                                                            {stat.val}
                                                        </div>
                                                        <div style={{ fontSize: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>
                                                            {stat.label}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Badges */}
                                            {p.badges?.length > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 10 }}>
                                                    {p.badges.map((b, i) => <span key={i} style={{ fontSize: 18 }}>{b}</span>)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════
                        ZONA DE ELITE – 4º a 8º
                    ══════════════════════════ */}
                    {elite.length > 0 && (
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                <Star size={16} color="#34d399" />
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: 3, textTransform: 'uppercase' }}>
                                    ZONA DE ELITE
                                </span>
                                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(52,211,153,0.2), transparent)', marginLeft: 8 }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                {elite.map((p, i) => {
                                    const pos = i + 4;
                                    const scoreVal = getScore(p);
                                    return (
                                        <div key={p.id} className="elite-card" style={{
                                            background: 'linear-gradient(135deg, rgba(52,211,153,0.06) 0%, rgba(15,20,32,0.97) 100%)',
                                            border: '1px solid rgba(52,211,153,0.18)',
                                            borderRadius: 18, padding: '18px 20px',
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            cursor: 'default',
                                        }}>
                                            {/* Position */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 900,
                                                color: 'rgba(52,211,153,0.3)', width: 38, textAlign: 'center', flexShrink: 0,
                                                lineHeight: 1,
                                            }}>
                                                {pos}
                                            </div>
                                            {/* Avatar */}
                                            <div style={{
                                                width: 52, height: 52, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #1e2d42, #243044)',
                                                border: '2px solid rgba(52,211,153,0.3)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 18, fontWeight: 700, color: '#34d399',
                                                flexShrink: 0, overflow: 'hidden',
                                            }}>
                                                {p.photo
                                                    ? <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : getInitials(p.name)
                                                }
                                            </div>
                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                                                    {p.name}
                                                </div>
                                                {p.nickname && (
                                                    <div style={{ fontSize: 11, color: '#34d399', fontWeight: 600, opacity: 0.85 }}>"{p.nickname}"</div>
                                                )}
                                                <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: 11, color: '#34d399', fontWeight: 700 }}>{p.wins || 0}V</span>
                                                    <span style={{ fontSize: 11, color: '#f87171', fontWeight: 700 }}>{p.losses || 0}D</span>
                                                    <span style={{ fontSize: 11, color: '#64748b' }}>{getWinRate(p)}%</span>
                                                    {p.streak > 0 && <span style={{ fontSize: 11, color: '#fb923c', fontWeight: 700 }}>🔥 {p.streak}</span>}
                                                </div>
                                            </div>
                                            {/* Score */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{
                                                    fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 900,
                                                    color: '#34d399', lineHeight: 1,
                                                    textShadow: '0 0 12px rgba(52,211,153,0.4)',
                                                }}>
                                                    {scoreVal}
                                                </div>
                                                <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, marginTop: 2 }}>
                                                    {isElo ? 'ELO' : 'pts'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════
                        GRÁFICO EVOLUÇÃO
                    ══════════════════════════ */}
                    {chartData.length > 0 && (
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))',
                            border: '1px solid rgba(52,211,153,0.1)',
                            borderRadius: 22, overflow: 'hidden',
                            position: 'relative', marginBottom: 24,
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #34d399, transparent)' }} />
                            <div style={{ padding: '20px 24px 8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                                <TrendingUp size={18} color="#34d399" />
                                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Evolução Top 5</span>
                                <span style={{ fontSize: 11, color: '#64748b', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 20, marginLeft: 4 }}>
                                    {isElo ? 'Rating ELO' : 'Pontos'}
                                </span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {top5Players.map((p, i) => (
                                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: lineColors[i], boxShadow: `0 0 6px ${lineColors[i]}80` }} />
                                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>{p.nickname || p.name?.split(' ')[0]}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding: '0 8px 20px' }}>
                                <ResponsiveContainer width="100%" height={240}>
                                    <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                                        <defs>
                                            {lineColors.map((c, i) => (
                                                <linearGradient key={i} id={`rankGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={c} stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                                                </linearGradient>
                                            ))}
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                                        <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                                        <Tooltip content={<CustomTooltip />} />
                                        {rankings.slice(0, 5).map((p, i) => (
                                            <Area
                                                key={p.id} type="monotone"
                                                dataKey={p.nickname || p.name}
                                                stroke={lineColors[i]} strokeWidth={2.5}
                                                fill={`url(#rankGrad${i})`}
                                                dot={{ r: 4, fill: lineColors[i], stroke: '#0a0e17', strokeWidth: 2 }}
                                                activeDot={{ r: 6, fill: lineColors[i], stroke: 'white', strokeWidth: 2, filter: `drop-shadow(0 0 8px ${lineColors[i]})` }}
                                                connectNulls={true}
                                            />
                                        ))}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════
                        RANKING COMPLETO – 9º+
                    ══════════════════════════ */}
                    {rest.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                                <Award size={15} color="#475569" />
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: 3, textTransform: 'uppercase' }}>
                                    RANKING COMPLETO
                                </span>
                                <div style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.08)', marginLeft: 8 }} />
                            </div>

                            <div style={{
                                background: 'linear-gradient(135deg, rgba(26,35,50,0.9), rgba(15,20,32,0.97))',
                                border: '1px solid rgba(148,163,184,0.07)',
                                borderRadius: 18, overflow: 'hidden',
                            }}>
                                {rest.map((p, i) => {
                                    const pos = i + 9;
                                    const isLast = i === rest.length - 1;
                                    return (
                                        <div key={p.id} className="rank-row" style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '12px 18px',
                                            borderBottom: isLast ? 'none' : '1px solid rgba(148,163,184,0.05)',
                                            cursor: 'default',
                                        }}>
                                            {/* Position */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 800,
                                                color: '#334155', width: 28, textAlign: 'center', flexShrink: 0,
                                            }}>{pos}</div>

                                            {/* Avatar */}
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(148,163,184,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 12, fontWeight: 700, color: '#475569',
                                                flexShrink: 0, overflow: 'hidden',
                                            }}>
                                                {p.photo
                                                    ? <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : getInitials(p.name)
                                                }
                                            </div>

                                            {/* Name */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: 14, fontWeight: 600, color: '#cbd5e1' }}>{p.name}</span>
                                                    {p.nickname && <span style={{ fontSize: 11, color: '#475569' }}>"{p.nickname}"</span>}
                                                </div>
                                                <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                                                    <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>{p.wins || 0}V</span>
                                                    <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>{p.losses || 0}D</span>
                                                    <span style={{ fontSize: 11, color: '#475569' }}>{getWinRate(p)}%</span>
                                                    {p.streak > 0 && <span style={{ fontSize: 11, color: '#fb923c' }}>🔥{p.streak}</span>}
                                                </div>
                                            </div>

                                            {/* Score */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#34d399' }}>
                                                    {getScore(p)}
                                                </span>
                                                <span style={{ fontSize: 9, color: '#334155', marginLeft: 4, textTransform: 'uppercase', fontWeight: 600 }}>
                                                    {isElo ? 'ELO' : 'pts'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* System info strip */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 18px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(148,163,184,0.06)',
                        borderRadius: 12, fontSize: 12, color: '#334155'
                    }}>
                        <Settings size={14} color="#334155" />
                        <span>
                            {isElo
                                ? 'Sistema ELO · Início 1000 · K=32 · Vitória contra oponentes superiores gera mais pontos'
                                : 'Pontos Fixos · Vitória = 3 pts · Derrota = 0 pts · Desempate por confronto direto'}
                        </span>
                    </div>
                </>
            )}

            {/* ── Modal de Limpeza ── */}
            {deleteConfirmOpen && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 9999, backdropFilter: 'blur(8px)',
                }} onClick={() => setDeleteConfirmOpen(false)}>
                    <div style={{
                        background: 'linear-gradient(135deg, #1a2332, #111827)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 20, padding: 28, maxWidth: 440, width: '90%',
                        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontSize: 17, fontWeight: 700, margin: 0 }}>
                                <AlertTriangle size={20} /> Apagar Ranking
                            </h3>
                            <button onClick={() => setDeleteConfirmOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 14 }}>
                            Tem certeza que deseja apagar o progresso do <strong style={{ color: '#f1f5f9' }}>Ranking Atual</strong>?
                        </p>
                        <div style={{
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 10, padding: 14, fontSize: 13, color: '#f87171', marginBottom: 20,
                        }}>
                            ⚠️ Isto resetará os pontos e ELO de todos os jogadores (retornando a 0 pts e 1000 ELO). Os jogadores não serão apagados.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button onClick={() => setDeleteConfirmOpen(false)} style={{
                                padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.15)',
                                background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            }}>
                                Cancelar
                            </button>
                            <button onClick={handleResetRanking} style={{
                                padding: '10px 20px', borderRadius: 10, border: 'none',
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            }}>
                                🗑️ Confirmar Limpeza
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <TiebreakerHelpModal isOpen={helpModalOpen} onClose={() => setHelpModalOpen(false)} isElo={isElo} />
        </div>
    );
}
