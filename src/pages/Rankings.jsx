import React, { useState, useEffect } from 'react';
import { getRankings, getWinRate, getPlayerScore } from '../data/rankingEngine.js';
import { getSettings, updateSettings, resetCurrentRanking } from '../data/db.js';
import { TrendingUp, TrendingDown, Minus, Settings, Crown, Award, Zap, Trophy, Star, Flame, Trash2, AlertTriangle, XCircle, Loader, HelpCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAdmin } from '../contexts/AdminContext.jsx';
import TiebreakerHelpModal from '../components/TiebreakerHelpModal.jsx';

export default function Rankings() {
    const { isAdmin } = useAdmin();
    const [rankings, setRankingsList] = useState([]);
    const [settings, setSettingsState] = useState({ rankingMode: 'points' });
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [helpModalOpen, setHelpModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => { refresh(); }, []);

    async function refresh() {
        setLoading(true);
        const [r, s] = await Promise.all([getRankings(), getSettings()]);
        setRankingsList(r);
        if (s) setSettingsState(s);
        setLoading(false);
    }

    async function handleResetRanking() {
        setLoading(true);
        await resetCurrentRanking();
        setDeleteConfirmOpen(false);
        await refresh();
    }

    async function toggleMode(mode) {
        setLoading(true);
        await updateSettings({ rankingMode: mode });
        setSettingsState(prev => ({ ...prev, rankingMode: mode }));
        const r = await getRankings();
        setRankingsList(r);
        setLoading(false);
    }

    const isElo = settings.rankingMode === 'elo';

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    function getScore(player) {
        return isElo ? (player.eloRating || 1000) : (player.points || 0);
    }

    const top3 = rankings.slice(0, 3);
    const top5 = rankings.slice(3, 5);
    const rest = rankings.slice(5);

    // Chart
    const lineColors = ['#10b981', '#fbbf24', '#60a5fa', '#f87171', '#a78bfa'];
    let chartData = [];
    const top5Players = rankings.slice(0, 5);

    if (top5Players.length > 0) {
        const allEventsMap = new Map();

        top5Players.forEach(p => {
            if (Array.isArray(p.pointsHistory)) {
                p.pointsHistory.forEach((h, idx) => {
                    const eventKey = h.date || `Event-${idx}`;
                    if (!allEventsMap.has(eventKey)) {
                        allEventsMap.set(eventKey, {
                            name: h.eventName || `Rodada ${idx + 1}`,
                            date: h.date,
                            idx: idx
                        });
                    }
                });
            }
        });

        const sortedEvents = Array.from(allEventsMap.values()).sort((a, b) => {
            if (a.date && b.date) return new Date(a.date) - new Date(b.date);
            return a.idx - b.idx;
        });

        chartData = sortedEvents.map(evt => {
            const point = { name: evt.name };
            top5Players.forEach(p => {
                const playerName = p.nickname || p.name;
                point[playerName] = null;

                if (Array.isArray(p.pointsHistory)) {
                    const histEntry = p.pointsHistory.find(h =>
                        (h.date && h.date === evt.date) ||
                        (!h.date && h.eventName === evt.name)
                    );
                    if (histEntry) {
                        point[playerName] = isElo ? (histEntry.eloRating || 1000) : (histEntry.points || 0);
                    }
                }
            });
            return point;
        });

        const currentPoint = { name: 'Atual' };
        top5Players.forEach(p => {
            currentPoint[p.nickname || p.name] = isElo ? (p.eloRating || 1000) : (p.points || 0);
        });
        chartData.push(currentPoint);
    }

    // Medal styles
    const medalStyles = [
        { // 1st - Gold
            bg: 'linear-gradient(145deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.06) 100%)',
            border: 'rgba(251,191,36,0.4)',
            glow: '0 0 40px rgba(251,191,36,0.15), 0 8px 32px rgba(0,0,0,0.3)',
            color: '#fbbf24',
            medal: '🥇',
            crownColor: '#fbbf24',
            label: 'CAMPEÃO'
        },
        { // 2nd - Silver
            bg: 'linear-gradient(145deg, rgba(148,163,184,0.10) 0%, rgba(100,116,139,0.05) 100%)',
            border: 'rgba(148,163,184,0.35)',
            glow: '0 0 30px rgba(148,163,184,0.1), 0 8px 24px rgba(0,0,0,0.3)',
            color: '#94a3b8',
            medal: '🥈',
            crownColor: '#94a3b8',
            label: 'VICE'
        },
        { // 3rd - Bronze
            bg: 'linear-gradient(145deg, rgba(205,127,50,0.10) 0%, rgba(180,100,30,0.05) 100%)',
            border: 'rgba(205,127,50,0.35)',
            glow: '0 0 30px rgba(205,127,50,0.1), 0 8px 24px rgba(0,0,0,0.3)',
            color: '#cd7f32',
            medal: '🥉',
            crownColor: '#cd7f32',
            label: '3º LUGAR'
        }
    ];

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Trophy size={28} style={{ color: 'var(--gold-400)' }} /> Ranking Geral
                        <button
                            onClick={() => setHelpModalOpen(true)}
                            style={{
                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: 4
                            }}
                        >
                            <HelpCircle size={18} />
                        </button>
                    </h1>
                    <p className="page-subtitle">{rankings.length} jogadores classificados · {isElo ? 'ELO Rating' : 'Pontos Fixos'}</p>
                </div>
                {isAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                        <div className="toggle-group">
                            <button className={`toggle-option ${!isElo ? 'active' : ''}`} onClick={() => toggleMode('points')}>
                                Pontos Fixos
                            </button>
                            <button className={`toggle-option ${isElo ? 'active' : ''}`} onClick={() => toggleMode('elo')}>
                                ELO Rating
                            </button>
                        </div>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmOpen(true)}>
                            <Trash2 size={16} /> Apagar Dados
                        </button>
                    </div>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', color: 'var(--text-dim)' }}>
                    <Loader className="animate-spin" size={32} style={{ marginBottom: 16 }} />
                    <p>Atualizando ranking da nuvem...</p>
                </div>
            ) : rankings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">🏆</div>
                    <div className="empty-state-title">Sem ranking ainda</div>
                    <div className="empty-state-desc">Cadastre jogadores e registre partidas</div>
                </div>
            ) : (
                <>
                    {/* ═══════════════════════════════════════════
                        PODIUM – TOP 3
                    ═══════════════════════════════════════════ */}
                    {top3.length >= 3 && (
                        <div style={{ marginBottom: 32 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 20,
                                justifyContent: 'center'
                            }}>
                                <Crown size={20} style={{ color: 'var(--gold-400)' }} />
                                <span style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: 'var(--gold-400)',
                                    letterSpacing: 3,
                                    textTransform: 'uppercase'
                                }}>
                                    PÓDIO
                                </span>
                                <Crown size={20} style={{ color: 'var(--gold-400)' }} />
                            </div>

                            {/* Podium row: 2nd - 1st - 3rd */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1.25fr 1fr',
                                gap: 16,
                                alignItems: 'end'
                            }}>
                                {[1, 0, 2].map(idx => {
                                    const p = top3[idx];
                                    const s = medalStyles[idx];
                                    const isFirst = idx === 0;
                                    return (
                                        <div
                                            key={p.id}
                                            style={{
                                                background: s.bg,
                                                border: `2px solid ${s.border}`,
                                                borderRadius: 20,
                                                padding: isFirst ? '32px 24px' : '24px 20px',
                                                textAlign: 'center',
                                                boxShadow: s.glow,
                                                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                                                cursor: 'default',
                                                position: 'relative',
                                                overflow: 'hidden'
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-6px)'; }}
                                            onMouseOut={e => { e.currentTarget.style.transform = ''; }}
                                        >
                                            {/* Glow ring behind avatar */}
                                            {isFirst && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '50%',
                                                    left: '50%',
                                                    transform: 'translate(-50%, -60%)',
                                                    width: 200,
                                                    height: 200,
                                                    borderRadius: '50%',
                                                    background: `radial-gradient(circle, ${s.color}15 0%, transparent 70%)`,
                                                    pointerEvents: 'none'
                                                }} />
                                            )}

                                            {/* Medal */}
                                            <div style={{ fontSize: isFirst ? 48 : 36, marginBottom: 4, position: 'relative' }}>
                                                {s.medal}
                                            </div>

                                            {/* Label */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 10,
                                                fontWeight: 700,
                                                letterSpacing: 2,
                                                color: s.color,
                                                marginBottom: 12,
                                                textTransform: 'uppercase'
                                            }}>
                                                {s.label}
                                            </div>

                                            {/* Avatar */}
                                            <div style={{
                                                width: isFirst ? 88 : 72,
                                                height: isFirst ? 88 : 72,
                                                borderRadius: '50%',
                                                background: 'var(--bg-deep)',
                                                border: `3px solid ${s.color}`,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: isFirst ? 30 : 24,
                                                fontWeight: 800,
                                                color: s.color,
                                                margin: '0 auto 12px',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                boxShadow: `0 0 20px ${s.color}30`
                                            }}>
                                                {p.photo ? (
                                                    <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : getInitials(p.name)}
                                            </div>

                                            {/* Name */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: isFirst ? 20 : 16,
                                                fontWeight: 700,
                                                color: 'var(--text-primary)',
                                                marginBottom: 2
                                            }}>
                                                {p.name}
                                            </div>
                                            {p.nickname && (
                                                <div style={{ fontSize: 12, color: s.color, fontWeight: 500, marginBottom: 8 }}>
                                                    "{p.nickname}"
                                                </div>
                                            )}

                                            {/* Score */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: isFirst ? 36 : 28,
                                                fontWeight: 800,
                                                color: s.color,
                                                lineHeight: 1,
                                                marginBottom: 4
                                            }}>
                                                {getScore(p)}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                                                {isElo ? 'ELO' : 'pontos'}
                                            </div>

                                            {/* Stats row */}
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'center',
                                                gap: 16,
                                                paddingTop: 10,
                                                borderTop: `1px solid ${s.color}20`
                                            }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--green-400)' }}>{p.wins || 0}</div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Vit</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--red-400)' }}>{p.losses || 0}</div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Der</div>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{getWinRate(p)}%</div>
                                                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Aprov</div>
                                                </div>
                                            </div>

                                            {/* Badges */}
                                            {p.badges && p.badges.length > 0 && (
                                                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                                                    {p.badges.map((b, i) => <span key={i} style={{ fontSize: 18 }}>{b}</span>)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════
                        ZONA DE ELITE – Top 4 & 5
                    ═══════════════════════════════════════════ */}
                    {top5.length > 0 && (
                        <div style={{ marginBottom: 28 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 16
                            }}>
                                <Star size={18} style={{ color: 'var(--green-400)' }} />
                                <span style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: 'var(--green-400)',
                                    letterSpacing: 2,
                                    textTransform: 'uppercase'
                                }}>
                                    ZONA DE ELITE
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                                {top5.map((p, i) => {
                                    const pos = i + 4;
                                    return (
                                        <div key={p.id} style={{
                                            background: 'linear-gradient(145deg, rgba(16,185,129,0.06) 0%, var(--bg-card) 100%)',
                                            border: '1px solid var(--border-green)',
                                            borderRadius: 16,
                                            padding: '20px 24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 16,
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                            cursor: 'default'
                                        }}
                                            onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--shadow-glow-green)'; }}
                                            onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                                        >
                                            {/* Rank badge */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 28,
                                                fontWeight: 800,
                                                color: 'var(--green-400)',
                                                opacity: 0.5,
                                                width: 40,
                                                textAlign: 'center',
                                                flexShrink: 0
                                            }}>
                                                {pos}
                                            </div>

                                            {/* Avatar */}
                                            <div style={{
                                                width: 56,
                                                height: 56,
                                                borderRadius: '50%',
                                                background: 'var(--bg-elevated)',
                                                border: '2px solid var(--border-green)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 20,
                                                fontWeight: 700,
                                                color: 'var(--green-400)',
                                                flexShrink: 0,
                                                overflow: 'hidden'
                                            }}>
                                                {p.photo ? (
                                                    <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : getInitials(p.name)}
                                            </div>

                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                                                    {p.name}
                                                </div>
                                                {p.nickname && (
                                                    <div style={{ fontSize: 12, color: 'var(--green-400)' }}>"{p.nickname}"</div>
                                                )}
                                                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                                                    <span><span style={{ color: 'var(--green-400)', fontWeight: 600 }}>{p.wins || 0}</span> V</span>
                                                    <span><span style={{ color: 'var(--red-400)', fontWeight: 600 }}>{p.losses || 0}</span> D</span>
                                                    <span>{getWinRate(p)}%</span>
                                                    {p.streak > 0 && <span style={{ color: 'var(--gold-400)' }}>🔥{p.streak}</span>}
                                                </div>
                                            </div>

                                            {/* Score */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 24,
                                                    fontWeight: 800,
                                                    color: 'var(--green-400)'
                                                }}>
                                                    {getScore(p)}
                                                </div>
                                                <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                                                    {isElo ? 'ELO' : 'pts'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════
                        EVOLUÇÃO – Chart
                    ═══════════════════════════════════════════ */}
                    {chartData.length > 0 && (
                        <div className="card" style={{ marginBottom: 24 }}>
                            <div className="card-header">
                                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Zap size={16} style={{ color: 'var(--green-400)' }} /> Evolução Top 5
                                </h3>
                            </div>
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
                                    <Tooltip contentStyle={{ background: '#1a2332', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }} />
                                    {rankings.slice(0, 5).map((p, i) => (
                                        <Line key={p.id} type="monotone" dataKey={p.nickname || p.name} stroke={lineColors[i]} strokeWidth={2} dot={true} connectNulls={true} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                                {rankings.slice(0, 5).map((p, i) => (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: lineColors[i] }} />
                                        <span style={{ color: 'var(--text-secondary)' }}>{p.nickname || p.name.split(' ')[0]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════════
                        RANKING COMPLETO – 6+
                    ═══════════════════════════════════════════ */}
                    {rest.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginBottom: 16
                            }}>
                                <Award size={16} style={{ color: 'var(--text-muted)' }} />
                                <span style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: 'var(--text-muted)',
                                    letterSpacing: 1.5,
                                    textTransform: 'uppercase'
                                }}>
                                    RANKING COMPLETO
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {rest.map((p, i) => {
                                    const pos = i + 6;
                                    return (
                                        <div key={p.id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 14,
                                            padding: '12px 16px',
                                            background: 'var(--bg-card)',
                                            borderRadius: 12,
                                            border: '1px solid var(--border-subtle)',
                                            transition: 'background 0.15s'
                                        }}
                                            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                            onMouseOut={e => e.currentTarget.style.background = 'var(--bg-card)'}
                                        >
                                            {/* Position */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 16,
                                                fontWeight: 700,
                                                color: 'var(--text-dim)',
                                                width: 28,
                                                textAlign: 'center',
                                                flexShrink: 0
                                            }}>
                                                {pos}
                                            </div>

                                            {/* Avatar */}
                                            <div style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: '50%',
                                                background: 'var(--bg-elevated)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: 'var(--text-secondary)',
                                                flexShrink: 0,
                                                overflow: 'hidden'
                                            }}>
                                                {p.photo ? (
                                                    <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : getInitials(p.name)}
                                            </div>

                                            {/* Name */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                                                {p.nickname && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.nickname}</div>}
                                            </div>

                                            {/* Quick stats */}
                                            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                                                <span><span style={{ color: 'var(--green-400)', fontWeight: 600 }}>{p.wins || 0}</span>V</span>
                                                <span><span style={{ color: 'var(--red-400)', fontWeight: 600 }}>{p.losses || 0}</span>D</span>
                                                <span>{getWinRate(p)}%</span>
                                            </div>

                                            {/* Score */}
                                            <div style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 18,
                                                fontWeight: 700,
                                                color: 'var(--text-secondary)',
                                                width: 60,
                                                textAlign: 'right',
                                                flexShrink: 0
                                            }}>
                                                {getScore(p)}
                                            </div>

                                            {/* Streak */}
                                            <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                                                {p.streak > 0 ? (
                                                    <span style={{ color: 'var(--gold-400)', fontSize: 12, fontWeight: 600 }}>🔥{p.streak}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-dim)' }}>–</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* System info */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 16px',
                        background: 'var(--bg-card)',
                        borderRadius: 10,
                        border: '1px solid var(--border-subtle)',
                        fontSize: 12,
                        color: 'var(--text-dim)'
                    }}>
                        <Settings size={14} />
                        <span>
                            {isElo
                                ? 'Sistema ELO · Início 1000 · K=32 · Vitória contra oponentes superiores gera mais pontos'
                                : 'Pontos Fixos · Vitória = 3 pts · Derrota = 0 pts · Desempate por confronto direto'}
                        </span>
                    </div>
                </>
            )}

            {/* Modal de Limpeza */}
            {deleteConfirmOpen && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-400)' }}>
                                <AlertTriangle size={20} /> Apagar Ranking
                            </h3>
                            <button className="modal-close" onClick={() => setDeleteConfirmOpen(false)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--text-secondary)' }}>
                                Tem certeza que deseja apagar o progresso do <strong style={{ color: 'var(--text-primary)' }}>Ranking Atual</strong>?
                            </p>
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--red-400)', marginBottom: 16 }}>
                                ⚠️ Isto resetará os pontos e ELO de todos os jogadores ativos na temporada (retornando todos a 0 pontos e 1000 ELO). Os jogadores não serão apagados do sistema em si.
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
                                Cancelar
                            </button>
                            <button className="btn" style={{ background: 'var(--red-500)', color: 'white', fontWeight: 700 }} onClick={handleResetRanking}>
                                🗑️ CONFIRMAR LIMPEZA
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <TiebreakerHelpModal
                isOpen={helpModalOpen}
                onClose={() => setHelpModalOpen(false)}
                isElo={isElo}
            />
        </div>
    );
}
