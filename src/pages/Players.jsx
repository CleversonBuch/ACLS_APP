import React, { useState, useEffect, useMemo } from 'react';
import {
    getPlayers, createPlayer, updatePlayer, deletePlayer,
    getPlayerStageStats, getPlayerExternalStats, getMatches, getSelectives
} from '../data/db.js';
import { getWinRate, getRankings } from '../data/rankingEngine.js';
import {
    UserPlus, X, Edit, Trash2, Search, Upload, Camera, Loader, Flame, Trophy, Target,
    Zap, Award, HelpCircle, Star, ArrowUp, ArrowDown, Filter, LayoutGrid, List,
    Download, FileUp, Users as UsersIcon, GitCompare, ChevronDown, CheckSquare, Square,
    EyeOff, Eye, XCircle, Calendar, TrendingUp
} from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext.jsx';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    ResponsiveContainer, Tooltip, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid
} from 'recharts';

// ═══════════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════════

function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Deterministic gradient color from name
function getColorFromName(name) {
    const palette = [
        ['#34d399', '#10b981'], ['#60a5fa', '#3b82f6'], ['#fbbf24', '#f59e0b'],
        ['#a78bfa', '#8b5cf6'], ['#f472b6', '#ec4899'], ['#fb923c', '#f97316'],
        ['#22d3ee', '#06b6d4'], ['#facc15', '#eab308']
    ];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = ((h << 5) - h) + name.charCodeAt(i);
    return palette[Math.abs(h) % palette.length];
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d`;
    return `${Math.floor(d / 30)}mês`;
}

function getRecentForm(playerId, allMatches, limit = 5) {
    const sorted = allMatches
        .filter(m => m.status === 'completed' && m.winnerId && (m.player1Id === playerId || m.player2Id === playerId))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
        .slice(0, limit);
    return sorted.reverse().map(m => m.winnerId === playerId ? 'W' : 'L');
}

function getPlayerLastMatchDate(playerId, allMatches) {
    const playerMatches = allMatches
        .filter(m => m.status === 'completed' && (m.player1Id === playerId || m.player2Id === playerId))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    return playerMatches[0] ? (playerMatches[0].updatedAt || playerMatches[0].createdAt) : null;
}

function getPosDelta(player) {
    const hist = Array.isArray(player.pointsHistory) ? player.pointsHistory : [];
    if (hist.length === 0) return { delta: 0, hadPrev: false };
    const last = hist[hist.length - 1];
    return { delta: (player.points || 0) - (last.points || 0), hadPrev: true };
}

function getSparklineData(player, limit = 8) {
    const hist = Array.isArray(player.pointsHistory) ? player.pointsHistory.slice(-limit) : [];
    if (hist.length < 2) return [];
    return hist.map((h, i) => ({ idx: i, p: h.points || 0 }));
}

function getH2HBetween(aId, bId, allMatches) {
    const h2h = allMatches.filter(m =>
        m.status === 'completed' && m.winnerId &&
        ((m.player1Id === aId && m.player2Id === bId) || (m.player1Id === bId && m.player2Id === aId))
    );
    let aW = 0, bW = 0;
    h2h.forEach(m => { if (m.winnerId === aId) aW++; else if (m.winnerId === bId) bW++; });
    return { aWins: aW, bWins: bW, total: h2h.length, matches: h2h };
}

// ─── CSV Helpers ─────
function exportPlayersToCSV(players) {
    const header = ['Nome', 'Apelido', 'Pontos', 'ELO', 'Vitorias', 'Derrotas', 'Aproveitamento', 'Sequencia', 'Melhor Sequencia'];
    const rows = players.map(p => [
        p.name || '', p.nickname || '',
        p.points || 0, p.eloRating || 1000,
        p.wins || 0, p.losses || 0,
        getWinRate(p), p.streak || 0, p.bestStreak || 0
    ]);
    const csv = [header, ...rows].map(r =>
        r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jogadores-acls-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function parseImportText(text) {
    return text.split(/[\r\n]+/)
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => {
            const parts = l.split(/[,;\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
            return { name: parts[0] || '', nickname: parts[1] || '' };
        })
        .filter(p => p.name);
}

// ─── localStorage helpers for favorites and inactive ─────
const FAV_KEY = 'acls_favorite_players';
const INACTIVE_KEY = 'acls_inactive_players';

function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return new Set(); }
}

function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

// ═══════════════════════════════════════════════════════════
//   Reusable UI bits
// ═══════════════════════════════════════════════════════════

function AvatarFallback({ name, size = 80, fontSize }) {
    const [c1, c2] = getColorFromName(name || '?');
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            background: `linear-gradient(135deg, ${c1}, ${c2})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: fontSize || size * 0.36, fontWeight: 800, color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}>
            {getInitials(name)}
        </div>
    );
}

function Avatar({ player, size = 80, border = 'rgba(148,163,184,0.2)' }) {
    return (
        <div style={{
            width: size, height: size, borderRadius: '50%',
            border: `2px solid ${border}`,
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            background: '#0a0e17',
        }}>
            {player?.photo
                ? <img src={player.photo} alt={player?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <AvatarFallback name={player?.name} size={size - 4} fontSize={size * 0.34} />
            }
        </div>
    );
}

function RecentFormDots({ form }) {
    if (!form || form.length === 0) {
        return <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>sem partidas</span>;
    }
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {form.map((r, i) => (
                <div key={i} title={r === 'W' ? 'Vitória' : 'Derrota'} style={{
                    width: 14, height: 14, borderRadius: 4,
                    background: r === 'W' ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)',
                    border: `1px solid ${r === 'W' ? '#34d399' : '#f87171'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 800, color: r === 'W' ? '#34d399' : '#f87171',
                }}>
                    {r}
                </div>
            ))}
        </div>
    );
}

function PlayerSparkline({ data, color = '#34d399' }) {
    if (!data || data.length < 2) return null;
    return (
        <ResponsiveContainer width="100%" height={28}>
            <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <defs>
                    <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <Area type="monotone" dataKey="p" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} dot={false} />
            </AreaChart>
        </ResponsiveContainer>
    );
}

// ─── Mini Radar Chart ─────
function PlayerRadar({ player, leagueStats }) {
    const wins = player.wins || 0;
    const losses = player.losses || 0;
    const total = wins + losses;
    const wr = total > 0 ? (wins / total) * 100 : 0;
    const streak = player.streak || 0;
    const bestStreak = player.bestStreak || 0;
    const points = player.points || 0;

    const maxW = leagueStats?.maxWins || 1;
    const maxS = leagueStats?.maxStreak || 1;
    const maxP = leagueStats?.maxPoints || 1;
    const maxG = leagueStats?.maxGames || 1;

    const data = [
        { subject: 'Vitórias', A: Math.min(100, (wins / maxW) * 100) },
        { subject: 'Aproveit.', A: Math.round(wr) },
        { subject: 'Sequência', A: Math.min(100, (streak / maxS) * 100) },
        { subject: 'Melhor Seq', A: Math.min(100, (bestStreak / maxS) * 100) },
        { subject: 'Pontos', A: Math.min(100, (points / maxP) * 100) },
        { subject: 'Jogos', A: Math.min(100, (total / maxG) * 100) },
    ];

    return (
        <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <PolarGrid stroke="rgba(148,163,184,0.12)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(148,163,184,0.7)', fontSize: 9, fontWeight: 500 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="A" stroke="#10b981" fill="#10b981" fillOpacity={0.18} strokeWidth={2} />
                <Tooltip
                    contentStyle={{ background: '#0f1c2e', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: 11, color: '#f1f5f9' }}
                    formatter={v => [`${Math.round(v)}`, '']}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
}

function StatPill({ label, value, color = 'var(--text-primary)' }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 48 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{label}</div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Player Card (enhanced)
// ═══════════════════════════════════════════════════════════
function PlayerCard({
    player, index, isAdmin, onEdit, onDelete, onClickProfile, loading, leagueStats,
    recentForm, posDelta, sparkline, isFavorite, onToggleFavorite,
    isInactive, onToggleInactive, isSelected, onToggleSelect, bulkMode, animDelay = 0
}) {
    const wins = player.wins || 0;
    const losses = player.losses || 0;
    const total = wins + losses;
    const wr = getWinRate(player);
    const streak = player.streak || 0;
    const bestStreak = player.bestStreak || 0;
    const points = player.points || 0;
    const elo = player.eloRating || 1000;

    const rankColors = [
        { border: '#fbbf24', glow: 'rgba(251,191,36,0.25)', fill: 'rgba(251,191,36,0.06)' },
        { border: '#94a3b8', glow: 'rgba(148,163,184,0.2)', fill: 'rgba(148,163,184,0.05)' },
        { border: '#cd7f32', glow: 'rgba(205,127,50,0.2)', fill: 'rgba(205,127,50,0.05)' },
    ];
    const accent = index < 3 ? rankColors[index] : { border: 'rgba(148,163,184,0.15)', glow: 'none', fill: 'transparent' };

    return (
        <div
            className="player-card"
            style={{
                background: `linear-gradient(145deg, ${accent.fill} 0%, var(--bg-card) 100%)`,
                border: `1.5px solid ${isFavorite ? '#fbbf24' : accent.border}`,
                borderRadius: 20,
                padding: '20px 18px 18px',
                position: 'relative',
                boxShadow: index < 3 ? `0 0 28px ${accent.glow}, 0 8px 24px rgba(0,0,0,0.3)` : '0 4px 16px rgba(0,0,0,0.2)',
                transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
                cursor: 'pointer',
                opacity: isInactive ? 0.55 : (loading ? 0.6 : 1),
                animation: `fadeInCard 0.35s ease ${animDelay}ms backwards`,
            }}
            onClick={e => {
                if (e.target.closest('.card-action-btn') || e.target.closest('.card-no-click')) return;
                if (bulkMode) onToggleSelect && onToggleSelect(player.id);
                else onClickProfile && onClickProfile(player);
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
        >
            {/* Bulk select checkbox */}
            {bulkMode && (
                <div className="card-no-click" style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>
                    {isSelected ? <CheckSquare size={18} color="#34d399" /> : <Square size={18} color="#64748b" />}
                </div>
            )}

            {/* Rank badge */}
            {!bulkMode && (
                <div style={{ position: 'absolute', top: 14, left: 16, fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: index < 3 ? accent.border : 'var(--text-dim)', letterSpacing: 1 }}>
                    #{index + 1}
                </div>
            )}

            {/* Top right: Favorite + Streak */}
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                {isAdmin && (
                    <button
                        className="card-action-btn"
                        onClick={e => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(player.id); }}
                        title={isFavorite ? 'Desafixar' : 'Fixar no topo'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: isFavorite ? '#fbbf24' : '#475569' }}
                    >
                        <Star size={14} fill={isFavorite ? '#fbbf24' : 'none'} />
                    </button>
                )}
                {streak >= 3 && (
                    <div title={`${streak} vitórias seguidas`} style={{ background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 800, color: '#fb923c', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Flame size={11} /> {streak}
                    </div>
                )}
                {streak > 0 && streak < 3 && (
                    <div style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Flame size={11} /> {streak}
                    </div>
                )}
                {posDelta?.hadPrev && posDelta.delta !== 0 && (
                    <div title={posDelta.delta > 0 ? `+${posDelta.delta} pts` : `${posDelta.delta} pts`} style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '2px 6px', borderRadius: 99, background: posDelta.delta > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${posDelta.delta > 0 ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                        {posDelta.delta > 0 ? <ArrowUp size={10} color="#34d399" strokeWidth={3} /> : <ArrowDown size={10} color="#f87171" strokeWidth={3} />}
                        <span style={{ fontSize: 10, fontWeight: 800, color: posDelta.delta > 0 ? '#34d399' : '#f87171' }}>{Math.abs(posDelta.delta)}</span>
                    </div>
                )}
            </div>

            {/* Inactive overlay label */}
            {isInactive && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-12deg)', padding: '4px 14px', background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.5)', borderRadius: 8, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 800, color: '#f87171', letterSpacing: 2, zIndex: 1, pointerEvents: 'none' }}>
                    INATIVO
                </div>
            )}

            {/* Avatar + identity */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
                <div style={{
                    width: 80, height: 80, borderRadius: '50%',
                    border: `3px solid ${accent.border}`,
                    overflow: 'hidden', boxShadow: `0 0 20px ${accent.glow}`, marginBottom: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#0a0e17',
                }}>
                    {player.photo
                        ? <img src={player.photo} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <AvatarFallback name={player.name} size={74} fontSize={26} />
                    }
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.2 }}>
                    {player.name}
                </div>
                {player.nickname && (
                    <div style={{ fontSize: 12, color: accent.border, fontWeight: 500, marginTop: 2 }}>"{player.nickname}"</div>
                )}
                {player.badges && player.badges.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {player.badges.map((b, i) => <span key={i} style={{ fontSize: 16 }}>{b}</span>)}
                    </div>
                )}
            </div>

            {/* Recent form */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0 10px', marginBottom: 4, borderBottom: '1px solid rgba(148,163,184,0.06)' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Forma</span>
                <RecentFormDots form={recentForm} />
            </div>

            {/* Main stats row */}
            <div style={{ display: 'flex', justifyContent: 'space-around', paddingBottom: 12, borderBottom: '1px solid rgba(148,163,184,0.08)', marginBottom: 4 }}>
                <StatPill label="Vitórias" value={wins} color="var(--green-400)" />
                <StatPill label="Derrotas" value={losses} color="var(--red-400)" />
                <StatPill label="Jogos" value={total} color="var(--text-secondary)" />
                <StatPill label="Aprov." value={`${wr}%`} color={wr >= 50 ? 'var(--green-400)' : 'var(--red-400)'} />
            </div>

            {/* Sparkline */}
            {sparkline && sparkline.length >= 2 && (
                <div style={{ marginTop: 4, padding: '6px 0 0' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tendência</span>
                        <span style={{ color: posDelta?.delta > 0 ? '#34d399' : posDelta?.delta < 0 ? '#f87171' : '#64748b' }}>
                            {sparkline.length} eventos
                        </span>
                    </div>
                    <PlayerSparkline data={sparkline} color={posDelta?.delta >= 0 ? '#34d399' : '#f87171'} />
                </div>
            )}

            {/* Radar chart */}
            <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 2 }}>
                    Perfil de Desempenho
                </div>
                <PlayerRadar player={player} leagueStats={leagueStats} />
            </div>

            {/* Secondary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--green-400)' }}>{points}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pontos</div>
                </div>
                <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{elo}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>ELO Rating</div>
                </div>
                <div style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>{streak > 0 ? `🔥${streak}` : '–'}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Seq. Atual</div>
                </div>
                <div style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.12)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: '#a78bfa' }}>{bestStreak}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Melhor Seq.</div>
                </div>
            </div>

            {/* Win rate bar */}
            <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    <span>Aproveitamento</span><span>{wr}%</span>
                </div>
                <div style={{ height: 4, background: 'rgba(148,163,184,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${wr}%`, background: wr >= 60 ? 'var(--green-400)' : wr >= 40 ? '#fbbf24' : 'var(--red-400)', borderRadius: 4, transition: 'width 0.8s ease' }} />
                </div>
            </div>

            {/* Stage & External stats */}
            {player.stageStats && player.stageStats.stagesPlayed > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,0.08)', display: 'flex', justifyContent: 'space-around' }}>
                    <StatPill label="Etapas" value={player.stageStats.stagesPlayed} color="var(--text-secondary)" />
                    <StatPill label="🏆 Títulos" value={player.stageStats.titles} color="var(--gold-400)" />
                    <StatPill label="🥇🥈🥉" value={player.stageStats.podiums} color="var(--bronze)" />
                </div>
            )}

            {player.extStats && player.extStats.total > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,0.08)', display: 'flex', justifyContent: 'space-around' }}>
                    <StatPill label="⚔️ Externos" value={player.extStats.total} color="var(--text-secondary)" />
                    <StatPill label="V Ext." value={player.extStats.wins} color="var(--green-400)" />
                    <StatPill label="Aprov. Ext." value={`${player.extStats.winRate}%`} color={player.extStats.winRate >= 50 ? 'var(--green-400)' : 'var(--red-400)'} />
                </div>
            )}

            {/* Admin buttons */}
            {isAdmin && !bulkMode && (
                <div className="card-no-click" style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm card-action-btn" onClick={e => { e.stopPropagation(); onEdit(player); }} disabled={loading}>
                        <Edit size={14} /> Editar
                    </button>
                    <button className="btn btn-secondary btn-sm card-action-btn" onClick={e => { e.stopPropagation(); onToggleInactive && onToggleInactive(player.id); }} disabled={loading} title={isInactive ? 'Marcar como ativo' : 'Marcar como inativo'}>
                        {isInactive ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button className="btn btn-danger btn-sm card-action-btn" onClick={e => { e.stopPropagation(); onDelete(player.id); }} disabled={loading}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Player Row (table view)
// ═══════════════════════════════════════════════════════════
function PlayerRow({
    player, index, isAdmin, onEdit, onDelete, onClickProfile, recentForm, posDelta,
    isFavorite, onToggleFavorite, isInactive, onToggleInactive, isSelected, onToggleSelect, bulkMode
}) {
    const wr = getWinRate(player);
    const streak = player.streak || 0;
    return (
        <div
            onClick={e => {
                if (e.target.closest('.card-no-click')) return;
                if (bulkMode) onToggleSelect && onToggleSelect(player.id);
                else onClickProfile && onClickProfile(player);
            }}
            style={{
                display: 'grid',
                gridTemplateColumns: bulkMode ? '32px 40px 1fr 90px 60px 60px 70px 70px 70px 110px' : '40px 40px 1fr 90px 60px 60px 70px 70px 70px 110px',
                alignItems: 'center', gap: 10, padding: '10px 14px',
                background: isFavorite ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isFavorite ? 'rgba(251,191,36,0.2)' : 'rgba(148,163,184,0.06)'}`,
                borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                opacity: isInactive ? 0.5 : 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.05)'; e.currentTarget.style.borderColor = 'rgba(52,211,153,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isFavorite ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = isFavorite ? 'rgba(251,191,36,0.2)' : 'rgba(148,163,184,0.06)'; }}
        >
            {bulkMode && (
                <div className="card-no-click">
                    {isSelected ? <CheckSquare size={16} color="#34d399" /> : <Square size={16} color="#64748b" />}
                </div>
            )}
            {!bulkMode && (
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: index < 3 ? '#fbbf24' : '#475569', textAlign: 'center' }}>#{index + 1}</div>
            )}
            <Avatar player={player} size={36} border={isFavorite ? '#fbbf24' : 'rgba(148,163,184,0.2)'} />
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{player.name}</span>
                    {streak >= 3 && <Flame size={11} color="#fb923c" />}
                    {isInactive && <span style={{ fontSize: 8, fontWeight: 800, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '1px 5px', borderRadius: 4 }}>INATIVO</span>}
                </div>
                {player.nickname && <div style={{ fontSize: 10, color: '#64748b' }}>"{player.nickname}"</div>}
            </div>
            <div className="hide-mob"><RecentFormDots form={recentForm} /></div>
            <div className="hide-mob" style={{ textAlign: 'center', color: '#34d399', fontWeight: 700, fontSize: 13 }}>{player.wins || 0}</div>
            <div className="hide-mob" style={{ textAlign: 'center', color: '#f87171', fontWeight: 700, fontSize: 13 }}>{player.losses || 0}</div>
            <div className="hide-mob" style={{ textAlign: 'center', color: wr >= 50 ? '#34d399' : '#94a3b8', fontWeight: 700, fontSize: 12 }}>{wr}%</div>
            <div className="hide-mob" style={{ textAlign: 'center', color: '#fbbf24', fontWeight: 700, fontSize: 13 }}>{streak > 0 ? `🔥${streak}` : '–'}</div>
            <div style={{ textAlign: 'center', color: '#34d399', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>{player.points || 0}</div>
            {isAdmin && (
                <div className="card-no-click" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button onClick={e => { e.stopPropagation(); onToggleFavorite && onToggleFavorite(player.id); }} title={isFavorite ? 'Desafixar' : 'Fixar'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: isFavorite ? '#fbbf24' : '#475569' }}><Star size={14} fill={isFavorite ? '#fbbf24' : 'none'} /></button>
                    <button onClick={e => { e.stopPropagation(); onEdit(player); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94a3b8' }}><Edit size={14} /></button>
                    <button onClick={e => { e.stopPropagation(); onDelete(player.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#f87171' }}><Trash2 size={14} /></button>
                </div>
            )}
            {!isAdmin && <div />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Profile Modal
// ═══════════════════════════════════════════════════════════
function ProfileModal({ player, onClose, allMatches, allPlayers, selectives }) {
    if (!player) return null;
    const playersById = useMemo(() => {
        const m = {};
        allPlayers.forEach(p => { m[p.id] = p; });
        return m;
    }, [allPlayers]);

    const playerMatches = allMatches
        .filter(m => m.status === 'completed' && m.winnerId && (m.player1Id === player.id || m.player2Id === player.id))
        .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    // Selectives this player participated
    const playerSelectives = selectives.filter(s => Array.isArray(s.playerIds) && s.playerIds.includes(player.id));

    // Evolution chart from pointsHistory
    const evolutionData = (Array.isArray(player.pointsHistory) ? player.pointsHistory : []).map((h, i) => ({
        name: h.eventName || `Ev ${i + 1}`,
        points: h.points || 0,
        elo: h.eloRating || 1000,
    }));
    if (evolutionData.length > 0) evolutionData.push({ name: 'Atual', points: player.points || 0, elo: player.eloRating || 1000 });

    const wr = getWinRate(player);

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg, #1a2332, #111827)', border: '1px solid rgba(52,211,153,0.25)', borderRadius: 22, width: '100%', maxWidth: 720, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
                {/* Header */}
                <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(148,163,184,0.08)', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <Avatar player={player} size={68} border="rgba(52,211,153,0.4)" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{player.name}</div>
                        {player.nickname && <div style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>"{player.nickname}"</div>}
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{player.wins || 0}V · {player.losses || 0}D · {wr}% · {player.points || 0}pts · ELO {player.eloRating || 1000}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}><X size={22} /></button>
                </div>

                {/* Quick stats */}
                <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                    {[
                        { label: 'Sequência', value: player.streak || 0, color: '#fb923c', icon: '🔥' },
                        { label: 'Melhor Seq.', value: player.bestStreak || 0, color: '#a78bfa', icon: '⭐' },
                        { label: 'Total Jogos', value: (player.wins || 0) + (player.losses || 0), color: '#94a3b8', icon: '🎱' },
                        { label: 'Etapas', value: player.stageStats?.stagesPlayed || 0, color: '#60a5fa', icon: '🏟️' },
                        { label: 'Títulos', value: player.stageStats?.titles || 0, color: '#fbbf24', icon: '🏆' },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,184,0.08)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                            <div style={{ fontSize: 16, marginBottom: 2 }}>{s.icon}</div>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* Evolution chart */}
                {evolutionData.length >= 2 && (
                    <div style={{ padding: '8px 16px 16px' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 8 }}>Evolução de Pontos</div>
                        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(52,211,153,0.1)', borderRadius: 14, padding: 12 }}>
                            <ResponsiveContainer width="100%" height={160}>
                                <AreaChart data={evolutionData}>
                                    <defs>
                                        <linearGradient id="evG" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                                    <Tooltip contentStyle={{ background: 'rgba(10,14,23,0.95)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, fontSize: 11 }} />
                                    <Area type="monotone" dataKey="points" stroke="#34d399" strokeWidth={2.5} fill="url(#evG)" dot={{ r: 3, fill: '#34d399' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* Recent matches */}
                <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 8 }}>Histórico Recente · {playerMatches.length} partidas</div>
                    {playerMatches.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 12 }}>Sem partidas registradas</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                            {playerMatches.slice(0, 20).map(m => {
                                const won = m.winnerId === player.id;
                                const oppId = m.player1Id === player.id ? m.player2Id : m.player1Id;
                                const opp = playersById[oppId];
                                const sel = selectives.find(s => s.id === m.selectiveId);
                                return (
                                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: won ? 'rgba(52,211,153,0.06)' : 'rgba(239,68,68,0.06)', border: `1px solid ${won ? 'rgba(52,211,153,0.18)' : 'rgba(239,68,68,0.18)'}` }}>
                                        <div style={{ width: 24, height: 24, borderRadius: 6, background: won ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: won ? '#34d399' : '#f87171', flexShrink: 0 }}>{won ? 'V' : 'D'}</div>
                                        <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>vs {opp?.name || '?'}</span>
                                        {sel && <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>{sel.name}</span>}
                                        <span style={{ fontSize: 10, color: '#475569' }}>{timeAgo(m.updatedAt || m.createdAt)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Selectives participated */}
                {playerSelectives.length > 0 && (
                    <div style={{ padding: '0 16px 16px' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 8 }}>Eventos · {playerSelectives.length}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {playerSelectives.slice(0, 12).map(s => (
                                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 99, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.18)', fontSize: 11 }}>
                                    {s.eventType === 'etapa' ? <Calendar size={10} color="#fbbf24" /> : <Trophy size={10} color="#60a5fa" />}
                                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>{s.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Head-to-head */}
                <div style={{ padding: '0 16px 22px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 8 }}>Confrontos Diretos</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                        {allPlayers.filter(p => p.id !== player.id).map(op => {
                            const h2h = getH2HBetween(player.id, op.id, allMatches);
                            if (h2h.total === 0) return null;
                            const winning = h2h.aWins > h2h.bWins;
                            const tied = h2h.aWins === h2h.bWins;
                            return (
                                <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 10, background: winning ? 'rgba(52,211,153,0.05)' : tied ? 'rgba(148,163,184,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${winning ? 'rgba(52,211,153,0.16)' : tied ? 'rgba(148,163,184,0.12)' : 'rgba(239,68,68,0.16)'}` }}>
                                    <Avatar player={op} size={26} />
                                    <span style={{ flex: 1, fontSize: 12, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>
                                        <span style={{ color: '#34d399' }}>{h2h.aWins}</span>
                                        <span style={{ color: '#475569', fontSize: 10 }}>×</span>
                                        <span style={{ color: '#f87171' }}>{h2h.bWins}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Compare Modal
// ═══════════════════════════════════════════════════════════
function CompareModal({ playerA, playerB, allPlayers, allMatches, onClose, onSelectB }) {
    if (!playerA) return null;
    const h2h = playerB ? getH2HBetween(playerA.id, playerB.id, allMatches) : null;

    function StatRow({ label, va, vb, fmt = v => v }) {
        const aMore = va > vb, bMore = vb > va;
        return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', marginBottom: 4 }}>
                <div style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: aMore ? '#34d399' : '#94a3b8' }}>{fmt(va)}</div>
                <div style={{ textAlign: 'center', fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
                <div style={{ textAlign: 'left', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: bMore ? '#34d399' : '#94a3b8' }}>{fmt(vb)}</div>
            </div>
        );
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg, #1a2332, #111827)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 22, width: '100%', maxWidth: 580, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
                <div style={{ padding: '20px 22px', borderBottom: '1px solid rgba(148,163,184,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <GitCompare size={20} color="#a78bfa" />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>Comparar Jogadores</span>
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={20} /></button>
                </div>

                {/* Selection */}
                <div style={{ padding: '20px 22px 0', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <Avatar player={playerA} size={64} border="rgba(52,211,153,0.4)" />
                        <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14, textAlign: 'center' }}>{playerA.name}</div>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: '#475569' }}>VS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        {playerB ? (
                            <>
                                <Avatar player={playerB} size={64} border="rgba(167,139,250,0.4)" />
                                <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14, textAlign: 'center' }}>{playerB.name}</div>
                            </>
                        ) : (
                            <>
                                <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px dashed rgba(167,139,250,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>?</div>
                                <select onChange={e => onSelectB(allPlayers.find(p => p.id === e.target.value))} className="form-input" style={{ padding: '6px 10px', fontSize: 12 }}>
                                    <option value="">Escolha…</option>
                                    {allPlayers.filter(p => p.id !== playerA.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </>
                        )}
                    </div>
                </div>

                {playerB && (
                    <>
                        {/* H2H Banner */}
                        {h2h && h2h.total > 0 && (
                            <div style={{ margin: '20px 22px 0', padding: '12px 16px', background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 12, textAlign: 'center' }}>
                                <div style={{ fontSize: 10, color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Confronto Direto</div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: 'var(--font-display)' }}>
                                    <span style={{ fontSize: 26, fontWeight: 900, color: h2h.aWins > h2h.bWins ? '#34d399' : '#94a3b8' }}>{h2h.aWins}</span>
                                    <span style={{ fontSize: 14, color: '#64748b' }}>×</span>
                                    <span style={{ fontSize: 26, fontWeight: 900, color: h2h.bWins > h2h.aWins ? '#34d399' : '#94a3b8' }}>{h2h.bWins}</span>
                                </div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{h2h.total} confronto{h2h.total > 1 ? 's' : ''}</div>
                            </div>
                        )}

                        {/* Stats comparison */}
                        <div style={{ padding: '16px 22px 22px' }}>
                            <StatRow label="Pontos" va={playerA.points || 0} vb={playerB.points || 0} />
                            <StatRow label="ELO" va={playerA.eloRating || 1000} vb={playerB.eloRating || 1000} />
                            <StatRow label="Vitórias" va={playerA.wins || 0} vb={playerB.wins || 0} />
                            <StatRow label="Derrotas" va={playerA.losses || 0} vb={playerB.losses || 0} fmt={v => v} />
                            <StatRow label="Aprov." va={getWinRate(playerA)} vb={getWinRate(playerB)} fmt={v => `${v}%`} />
                            <StatRow label="Sequência" va={playerA.streak || 0} vb={playerB.streak || 0} />
                            <StatRow label="Melhor Seq." va={playerA.bestStreak || 0} vb={playerB.bestStreak || 0} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Import Modal
// ═══════════════════════════════════════════════════════════
function ImportModal({ onClose, onImport, loading }) {
    const [text, setText] = useState('');
    const parsed = parseImportText(text);

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'linear-gradient(135deg, #1a2332, #111827)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 22, width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
                <div style={{ padding: '20px 22px', borderBottom: '1px solid rgba(148,163,184,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FileUp size={20} color="#60a5fa" />
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>Importar Jogadores</span>
                    <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={20} /></button>
                </div>
                <div style={{ padding: '18px 22px' }}>
                    <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
                        Cole uma lista de jogadores. Um por linha. Use vírgula, ponto-e-vírgula ou tab para separar nome e apelido.
                    </p>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,184,0.08)', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                        João Silva, Joãozinho<br/>
                        Maria Santos<br/>
                        Pedro Costa; Pedrão
                    </div>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        placeholder="Cole sua lista aqui…"
                        rows={8}
                        style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(15,20,32,0.6)', color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace', resize: 'vertical', outline: 'none' }}
                    />
                    {parsed.length > 0 && (
                        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', fontSize: 12, color: '#34d399', fontWeight: 600 }}>
                            ✓ {parsed.length} jogador{parsed.length > 1 ? 'es' : ''} pronto{parsed.length > 1 ? 's' : ''} para importar
                        </div>
                    )}
                </div>
                <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(148,163,184,0.08)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} disabled={loading} className="btn btn-secondary">Cancelar</button>
                    <button onClick={() => onImport(parsed)} disabled={loading || parsed.length === 0} className="btn btn-primary">
                        {loading ? <Loader className="animate-spin" size={14} /> : <><FileUp size={14} /> Importar {parsed.length || ''}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Loading Skeleton Card
// ═══════════════════════════════════════════════════════════
function SkeletonCard() {
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(148,163,184,0.08)', borderRadius: 20, padding: 20, animation: 'pulse-skeleton 1.6s ease-in-out infinite' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(148,163,184,0.08)', margin: '8px auto 12px' }} />
            <div style={{ width: '60%', height: 14, borderRadius: 4, background: 'rgba(148,163,184,0.08)', margin: '0 auto 8px' }} />
            <div style={{ width: '40%', height: 10, borderRadius: 4, background: 'rgba(148,163,184,0.05)', margin: '0 auto 16px' }} />
            <div style={{ height: 1, background: 'rgba(148,163,184,0.06)', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ flex: 1, height: 30, borderRadius: 6, background: 'rgba(148,163,184,0.06)' }} />
                ))}
            </div>
            <div style={{ marginTop: 14, height: 120, borderRadius: 8, background: 'rgba(148,163,184,0.04)' }} />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
//   Main Players Page
// ═══════════════════════════════════════════════════════════
export default function Players() {
    const { isAdmin } = useAdmin();
    const [players, setPlayers] = useState([]);
    const [allMatches, setAllMatches] = useState([]);
    const [allSelectives, setAllSelectives] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [search, setSearch] = useState('');
    const [sortMode, setSortMode] = useState('points'); // points | elo | name | wins | streak | winrate
    const [filter, setFilter] = useState('all'); // all | active | inactive | streak | newcomer | nogames
    const [viewMode, setViewMode] = useState('cards'); // cards | table
    const [showHelp, setShowHelp] = useState(false);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [form, setForm] = useState({ name: '', nickname: '', photo: '' });
    const [photoMode, setPhotoMode] = useState('upload');
    const [profilePlayer, setProfilePlayer] = useState(null);
    const [compareA, setCompareA] = useState(null);
    const [compareB, setCompareB] = useState(null);
    const [importOpen, setImportOpen] = useState(false);
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [favorites, setFavorites] = useState(loadSet(FAV_KEY));
    const [inactive, setInactive] = useState(loadSet(INACTIVE_KEY));

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { alert('Por favor, selecione um arquivo de imagem.'); return; }
        if (file.size > 2 * 1024 * 1024) { alert('A imagem deve ter no máximo 2MB.'); return; }
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 200;
                let w = img.width, h = img.height;
                if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                else { w = Math.round(w * MAX / h); h = MAX; }
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                setForm(prev => ({ ...prev, photo: canvas.toDataURL('image/jpeg', 0.8) }));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    useEffect(() => { refresh(); }, [sortMode]);

    async function refresh() {
        setLoading(true);
        const baseSort = (sortMode === 'points' || sortMode === 'elo') ? sortMode : 'points';
        const [ranked, matches, selectives] = await Promise.all([
            getRankings(baseSort),
            getMatches(),
            getSelectives()
        ]);
        const enriched = await Promise.all(ranked.map(async p => {
            const stageStats = await getPlayerStageStats(p.id);
            const extStats = await getPlayerExternalStats(p.id);
            return { ...p, stageStats, extStats };
        }));
        setPlayers(enriched);
        setAllMatches(matches || []);
        setAllSelectives(selectives || []);
        setLoading(false);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.name.trim()) return;
        setLoading(true);
        if (editingPlayer) await updatePlayer(editingPlayer.id, form);
        else await createPlayer(form);
        setForm({ name: '', nickname: '', photo: '' });
        setEditingPlayer(null);
        setShowModal(false);
        await refresh();
    }

    function handleEdit(player) {
        setEditingPlayer(player);
        setForm({ name: player.name, nickname: player.nickname || '', photo: player.photo || '' });
        setShowModal(true);
    }

    async function handleDelete(id) {
        if (confirm('Tem certeza que deseja remover este jogador?')) {
            setLoading(true);
            await deletePlayer(id);
            await refresh();
        }
    }

    async function handleBulkDelete() {
        if (selectedIds.size === 0) return;
        if (!confirm(`Apagar ${selectedIds.size} jogador(es)? Esta ação é irreversível.`)) return;
        setLoading(true);
        for (const id of selectedIds) {
            await deletePlayer(id);
        }
        setSelectedIds(new Set());
        setBulkMode(false);
        await refresh();
    }

    async function handleImport(parsedList) {
        if (!parsedList || parsedList.length === 0) return;
        setLoading(true);
        for (const p of parsedList) {
            await createPlayer({ name: p.name, nickname: p.nickname || '', photo: '' });
        }
        setImportOpen(false);
        await refresh();
    }

    function toggleFavorite(id) {
        const next = new Set(favorites);
        if (next.has(id)) next.delete(id); else next.add(id);
        setFavorites(next);
        saveSet(FAV_KEY, next);
    }

    function toggleInactive(id) {
        const next = new Set(inactive);
        if (next.has(id)) next.delete(id); else next.add(id);
        setInactive(next);
        saveSet(INACTIVE_KEY, next);
    }

    function toggleSelect(id) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    }

    function startCompare(player) {
        setCompareA(player);
        setCompareB(null);
    }

    // ── Compute filtered + sorted list ──
    const enriched = useMemo(() => {
        return players.map(p => ({
            ...p,
            recentForm: getRecentForm(p.id, allMatches),
            posDelta: getPosDelta(p),
            sparkline: getSparklineData(p),
            isFavorite: favorites.has(p.id),
            isInactive: inactive.has(p.id),
            totalGames: (p.wins || 0) + (p.losses || 0),
        }));
    }, [players, allMatches, favorites, inactive]);

    const counts = useMemo(() => ({
        all: enriched.length,
        active: enriched.filter(p => !p.isInactive).length,
        inactive: enriched.filter(p => p.isInactive).length,
        streak: enriched.filter(p => (p.streak || 0) >= 2).length,
        newcomer: enriched.filter(p => p.totalGames < 5).length,
        nogames: enriched.filter(p => p.totalGames === 0).length,
        favorites: enriched.filter(p => p.isFavorite).length,
    }), [enriched]);

    const filtered = useMemo(() => {
        let list = enriched;
        // search
        if (search.trim()) {
            const s = search.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(s) || (p.nickname && p.nickname.toLowerCase().includes(s)));
        }
        // filter
        if (filter === 'active') list = list.filter(p => !p.isInactive);
        else if (filter === 'inactive') list = list.filter(p => p.isInactive);
        else if (filter === 'streak') list = list.filter(p => (p.streak || 0) >= 2);
        else if (filter === 'newcomer') list = list.filter(p => p.totalGames < 5);
        else if (filter === 'nogames') list = list.filter(p => p.totalGames === 0);
        else if (filter === 'favorites') list = list.filter(p => p.isFavorite);

        // additional sorting (overrides default order from getRankings)
        if (sortMode === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        else if (sortMode === 'wins') list = [...list].sort((a, b) => (b.wins || 0) - (a.wins || 0));
        else if (sortMode === 'streak') list = [...list].sort((a, b) => (b.streak || 0) - (a.streak || 0));
        else if (sortMode === 'winrate') list = [...list].sort((a, b) => getWinRate(b) - getWinRate(a));

        // Favorites pinned to top
        list = [...list].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
        return list;
    }, [enriched, search, filter, sortMode]);

    const leagueStats = useMemo(() => ({
        maxWins: Math.max(1, ...players.map(p => p.wins || 0)),
        maxGames: Math.max(1, ...players.map(p => (p.wins || 0) + (p.losses || 0))),
        maxPoints: Math.max(1, ...players.map(p => p.points || 0)),
        maxStreak: Math.max(1, ...players.map(p => p.bestStreak || 0))
    }), [players]);

    const totalGamesAll = useMemo(() => enriched.reduce((sum, p) => sum + p.totalGames, 0) / 2, [enriched]);
    const sortLabels = {
        points: '🏆 Pontos',
        elo: '⚔️ ELO',
        name: 'A → Z',
        wins: 'Mais Vitórias',
        streak: 'Sequência',
        winrate: 'Aproveitamento'
    };

    return (
        <div className="animate-fade-in">
            <style>{`
                @keyframes pulse-skeleton { 0%,100% { opacity:0.6 } 50% { opacity:0.9 } }
                @keyframes fadeInCard { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
                .filter-pill { display:flex; align-items:center; gap:6px; padding:7px 12px; border-radius:20px; border:1px solid rgba(148,163,184,0.12); background:rgba(255,255,255,0.03); color:#94a3b8; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
                .filter-pill:hover { background:rgba(255,255,255,0.06); color:#e2e8f0; border-color:rgba(148,163,184,0.2); }
                .filter-pill.active { background:rgba(52,211,153,0.12); border-color:rgba(52,211,153,0.35); color:#34d399; }
                .filter-pill .count { background:rgba(255,255,255,0.06); padding:0 6px; border-radius:10px; font-size:10px; font-weight:800; }
                .filter-pill.active .count { background:rgba(52,211,153,0.2); }
                @media (max-width: 768px) {
                    .hide-mob { display: none !important; }
                }
            `}</style>

            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                    <div>
                        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            Jogadores
                            <button onClick={() => setShowHelp(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, marginTop: 2 }} title="Como ler o card?">
                                <HelpCircle size={18} />
                            </button>
                        </h1>
                        <p className="page-subtitle">{players.length} jogadores cadastrados</p>
                    </div>

                    {showHelp && (
                        <div onClick={() => setShowHelp(false)} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', paddingTop: 80, paddingLeft: 24 }}>
                            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 16, padding: '20px 22px', maxWidth: 340, width: '90vw', boxShadow: '0 16px 48px rgba(0,0,0,0.5)', position: 'relative' }}>
                                <button onClick={() => setShowHelp(false)} style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}><X size={16} /></button>
                                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--green-400)', marginBottom: 14, letterSpacing: 1, textTransform: 'uppercase' }}>📖 Como ler o card</h4>
                                {[
                                    { icon: '👆', label: 'Click no card', desc: 'Abre o perfil completo com histórico, evolução e confrontos diretos.' },
                                    { icon: '⭐', label: 'Estrela', desc: 'Fixar jogador no topo da lista (favoritar).' },
                                    { icon: '🟩🟥', label: 'Forma recente', desc: 'Últimas 5 partidas: V (verde) ou D (vermelho), do mais antigo ao mais novo.' },
                                    { icon: '📈', label: 'Tendência', desc: 'Sparkline com a evolução de pontos nos últimos eventos.' },
                                    { icon: '🔥', label: 'Sequência ativa', desc: 'Pill laranja se ≥3, amarelo se 1-2 vitórias seguidas.' },
                                    { icon: '↑↓', label: 'Delta de pontos', desc: 'Quanto subiu/caiu desde o último evento finalizado.' },
                                    { icon: '👁️', label: 'Toggle Inativo', desc: 'Marcar jogador como inativo (preserva histórico, oculta dos filtros padrão).' },
                                ].map(({ icon, label, desc }) => (
                                    <div key={label} style={{ marginBottom: 12, display: 'flex', gap: 10 }}>
                                        <div style={{ fontSize: 16, flexShrink: 0, paddingTop: 1 }}>{icon}</div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isAdmin && (
                        <>
                            <button className="btn btn-secondary" onClick={() => setImportOpen(true)} title="Importar lista de jogadores">
                                <FileUp size={16} /> Importar
                            </button>
                            <button className="btn btn-secondary" onClick={() => exportPlayersToCSV(players)} title="Exportar como CSV">
                                <Download size={16} /> Exportar
                            </button>
                            <button className="btn btn-secondary" onClick={() => { setBulkMode(b => !b); setSelectedIds(new Set()); }} title="Modo seleção em massa">
                                {bulkMode ? <X size={16} /> : <CheckSquare size={16} />} {bulkMode ? 'Cancelar' : 'Selecionar'}
                            </button>
                            <button className="btn btn-primary" onClick={() => { setEditingPlayer(null); setForm({ name: '', nickname: '', photo: '' }); setShowModal(true); }}>
                                <UserPlus size={18} /> Novo Jogador
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Bulk action bar */}
            {bulkMode && (
                <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: '#60a5fa', fontWeight: 700 }}>{selectedIds.size} selecionado(s)</span>
                    <button onClick={() => setSelectedIds(new Set(filtered.map(p => p.id)))} className="btn btn-secondary btn-sm">Selecionar todos</button>
                    <button onClick={() => setSelectedIds(new Set())} className="btn btn-secondary btn-sm">Limpar</button>
                    {selectedIds.size > 0 && (
                        <button onClick={handleBulkDelete} className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }}>
                            <Trash2 size={14} /> Apagar {selectedIds.size}
                        </button>
                    )}
                </div>
            )}

            {/* Filters bar */}
            <div style={{ marginBottom: 16, display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {[
                    { key: 'all', label: 'Todos', count: counts.all },
                    { key: 'active', label: 'Ativos', count: counts.active },
                    { key: 'streak', label: '🔥 Em sequência', count: counts.streak },
                    { key: 'newcomer', label: 'Novatos', count: counts.newcomer },
                    { key: 'nogames', label: 'Sem partidas', count: counts.nogames },
                    { key: 'favorites', label: '⭐ Favoritos', count: counts.favorites },
                    { key: 'inactive', label: 'Inativos', count: counts.inactive },
                ].map(f => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className={`filter-pill ${filter === f.key ? 'active' : ''}`}>
                        {f.label} <span className="count">{f.count}</span>
                    </button>
                ))}
            </div>

            {/* Search + Sort + View toggle */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220, maxWidth: 360 }}>
                    <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input className="form-input" placeholder="Buscar jogador..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40, width: '100%' }} />
                </div>

                {/* Sort dropdown */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowSortMenu(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        <Filter size={14} /> {sortLabels[sortMode]} <ChevronDown size={12} />
                    </button>
                    {showSortMenu && (
                        <div onMouseLeave={() => setShowSortMenu(false)} style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'rgba(15,20,32,0.98)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 10, minWidth: 180, zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}>
                            {Object.entries(sortLabels).map(([k, v]) => (
                                <button key={k} onClick={() => { setSortMode(k); setShowSortMenu(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: sortMode === k ? 'rgba(52,211,153,0.1)' : 'transparent', color: sortMode === k ? '#34d399' : '#94a3b8', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{v}</button>
                            ))}
                        </div>
                    )}
                </div>

                {/* View toggle */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 10, padding: 3 }}>
                    <button onClick={() => setViewMode('cards')} title="Cards" style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: viewMode === 'cards' ? 'rgba(52,211,153,0.15)' : 'transparent', color: viewMode === 'cards' ? '#34d399' : '#64748b', cursor: 'pointer' }}><LayoutGrid size={14} /></button>
                    <button onClick={() => setViewMode('table')} title="Tabela" style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: viewMode === 'table' ? 'rgba(52,211,153,0.15)' : 'transparent', color: viewMode === 'table' ? '#34d399' : '#64748b', cursor: 'pointer' }}><List size={14} /></button>
                </div>

                {isAdmin && filtered.length >= 2 && (
                    <button onClick={() => startCompare(filtered[0])} className="btn btn-secondary" title="Comparar 1v1">
                        <GitCompare size={14} /> Comparar
                    </button>
                )}
            </div>

            {/* Grid OR Table */}
            {loading && players.length === 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                    {[1, 2, 3, 4, 5, 6].map(i => <SkeletonCard key={i} />)}
                </div>
            ) : filtered.length > 0 ? (
                viewMode === 'cards' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                        {filtered.map((player, index) => (
                            <PlayerCard
                                key={player.id}
                                player={player}
                                index={index}
                                isAdmin={isAdmin}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onClickProfile={setProfilePlayer}
                                loading={loading}
                                leagueStats={leagueStats}
                                recentForm={player.recentForm}
                                posDelta={player.posDelta}
                                sparkline={player.sparkline}
                                isFavorite={player.isFavorite}
                                onToggleFavorite={toggleFavorite}
                                isInactive={player.isInactive}
                                onToggleInactive={toggleInactive}
                                isSelected={selectedIds.has(player.id)}
                                onToggleSelect={toggleSelect}
                                bulkMode={bulkMode}
                                animDelay={Math.min(index * 40, 400)}
                            />
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div className="hide-mob" style={{ display: 'grid', gridTemplateColumns: bulkMode ? '32px 40px 1fr 90px 60px 60px 70px 70px 70px 110px' : '40px 40px 1fr 90px 60px 60px 70px 70px 70px 110px', gap: 10, padding: '6px 14px', fontSize: 9, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>
                            <span></span>
                            {!bulkMode && <span>#</span>}
                            <span></span>
                            <span>Jogador</span>
                            <span style={{ textAlign: 'center' }}>Forma</span>
                            <span style={{ textAlign: 'center' }}>V</span>
                            <span style={{ textAlign: 'center' }}>D</span>
                            <span style={{ textAlign: 'center' }}>%</span>
                            <span style={{ textAlign: 'center' }}>Seq.</span>
                            <span style={{ textAlign: 'center' }}>Pts</span>
                            <span></span>
                        </div>
                        {filtered.map((player, index) => (
                            <PlayerRow
                                key={player.id}
                                player={player}
                                index={index}
                                isAdmin={isAdmin}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onClickProfile={setProfilePlayer}
                                recentForm={player.recentForm}
                                posDelta={player.posDelta}
                                isFavorite={player.isFavorite}
                                onToggleFavorite={toggleFavorite}
                                isInactive={player.isInactive}
                                onToggleInactive={toggleInactive}
                                isSelected={selectedIds.has(player.id)}
                                onToggleSelect={toggleSelect}
                                bulkMode={bulkMode}
                            />
                        ))}
                    </div>
                )
            ) : (
                <div className="empty-state">
                    <div className="empty-state-icon">👤</div>
                    <div className="empty-state-title">Nenhum jogador encontrado</div>
                    <div className="empty-state-desc">{search ? 'Tente outro nome ou apelido' : 'Adicione o primeiro jogador para começar'}</div>
                </div>
            )}

            {/* ── Stats Footer ── */}
            {filtered.length > 0 && (
                <div style={{ marginTop: 28, padding: '16px 22px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(26,35,50,0.95) 0%, rgba(15,20,32,0.98) 100%)', border: '1px solid rgba(148,163,184,0.08)', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', justifyContent: 'space-around' }}>
                    {[
                        { icon: UsersIcon, label: 'Jogadores', value: counts.all, color: '#34d399' },
                        { icon: Eye, label: 'Ativos', value: counts.active, color: '#60a5fa' },
                        { icon: EyeOff, label: 'Inativos', value: counts.inactive, color: '#f87171' },
                        { icon: Flame, label: 'Em sequência', value: counts.streak, color: '#fb923c' },
                        { icon: Trophy, label: 'Partidas', value: Math.round(totalGamesAll), color: '#fbbf24' },
                    ].map(s => (
                        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <s.icon size={16} color={s.color} />
                            </div>
                            <div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Create / Edit Modal ── */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingPlayer ? 'Editar Jogador' : 'Novo Jogador'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)} disabled={loading}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Nome *</label>
                                    <input className="form-input" placeholder="Nome completo" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required disabled={loading} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Apelido</label>
                                    <input className="form-input" placeholder="Ex: Tubarão" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} disabled={loading} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Foto do Jogador</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                        <div
                                            style={{ width: 96, height: 96, borderRadius: '50%', background: form.photo ? 'none' : 'var(--bg-elevated)', border: '2px dashed var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: loading ? 'default' : 'pointer', position: 'relative', transition: 'border-color 0.2s', opacity: loading ? 0.5 : 1 }}
                                            onClick={() => !loading && document.getElementById('photo-file-input').click()}
                                            onMouseOver={e => !loading && (e.currentTarget.style.borderColor = 'var(--green-400)')}
                                            onMouseOut={e => !loading && (e.currentTarget.style.borderColor = '')}
                                        >
                                            {form.photo
                                                ? <img src={form.photo} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Camera size={32} style={{ color: 'var(--text-dim)' }} />
                                            }
                                        </div>
                                        <input id="photo-file-input" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} disabled={loading} />
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => document.getElementById('photo-file-input').click()} disabled={loading}>
                                                <Upload size={14} /> Upload Foto
                                            </button>
                                            {form.photo && (
                                                <button type="button" className="btn btn-danger btn-sm" onClick={() => setForm({ ...form, photo: '' })} disabled={loading}>
                                                    <X size={14} /> Remover
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <button type="button" style={{ background: 'none', border: 'none', color: 'var(--green-400)', fontSize: 12, cursor: loading ? 'default' : 'pointer', textDecoration: 'underline', padding: 0, opacity: loading ? 0.5 : 1 }} onClick={() => !loading && setPhotoMode(prev => prev === 'upload' ? 'url' : 'upload')} disabled={loading}>
                                            {photoMode === 'upload' ? 'Ou inserir URL da foto' : 'Ou fazer upload do dispositivo'}
                                        </button>
                                    </div>
                                    {photoMode === 'url' && (
                                        <input className="form-input" placeholder="https://..." value={form.photo.startsWith('data:') ? '' : form.photo} onChange={e => setForm({ ...form, photo: e.target.value })} disabled={loading} />
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={loading}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>
                                    {loading ? <Loader className="animate-spin" size={16} /> : (editingPlayer ? 'Salvar' : 'Adicionar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Profile Modal ── */}
            {profilePlayer && (
                <ProfileModal
                    player={profilePlayer}
                    onClose={() => setProfilePlayer(null)}
                    allMatches={allMatches}
                    allPlayers={players}
                    selectives={allSelectives}
                />
            )}

            {/* ── Compare Modal ── */}
            {compareA && (
                <CompareModal
                    playerA={compareA}
                    playerB={compareB}
                    allPlayers={players}
                    allMatches={allMatches}
                    onClose={() => { setCompareA(null); setCompareB(null); }}
                    onSelectB={setCompareB}
                />
            )}

            {/* ── Import Modal ── */}
            {importOpen && (
                <ImportModal
                    onClose={() => setImportOpen(false)}
                    onImport={handleImport}
                    loading={loading}
                />
            )}
        </div>
    );
}
