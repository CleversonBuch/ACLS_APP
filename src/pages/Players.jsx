import React, { useState, useEffect } from 'react';
import { getPlayers, createPlayer, updatePlayer, deletePlayer, getPlayerStageStats, getPlayerExternalStats } from '../data/db.js';
import { getWinRate, getRankings } from '../data/rankingEngine.js';
import { UserPlus, X, Edit, Trash2, Search, Upload, Camera, Loader, Flame, Trophy, Target, Zap, Award, HelpCircle } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';

// ─── Mini Radar Chart ────────────────────────────────────────
function PlayerRadar({ player }) {
    const wins = player.wins || 0;
    const losses = player.losses || 0;
    const total = wins + losses;
    const wr = total > 0 ? (wins / total) * 100 : 0;
    const streak = player.streak || 0;
    const bestStreak = player.bestStreak || 0;
    const points = player.points || 0;
    const maxPoints = 100; // scale reference

    // Normalise all dims 0-100
    const data = [
        { subject: 'Vitórias',   A: Math.min(100, wins * 5) },
        { subject: 'Aproveit.',  A: Math.round(wr) },
        { subject: 'Sequência',  A: Math.min(100, streak * 10) },
        { subject: 'Melhor Seq', A: Math.min(100, bestStreak * 8) },
        { subject: 'Pontos',     A: Math.min(100, points > 0 ? (points / Math.max(points, maxPoints)) * 100 : 0) },
        { subject: 'Jogos',      A: Math.min(100, total * 4) },
    ];

    return (
        <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <PolarGrid stroke="rgba(148,163,184,0.12)" />
                <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: 'rgba(148,163,184,0.7)', fontSize: 9, fontWeight: 500 }}
                />
                <Radar
                    dataKey="A"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.18}
                    strokeWidth={2}
                />
                <Tooltip
                    contentStyle={{
                        background: '#0f1c2e',
                        border: '1px solid rgba(16,185,129,0.2)',
                        borderRadius: 8,
                        fontSize: 11,
                        color: '#f1f5f9'
                    }}
                    formatter={(v) => [`${Math.round(v)}`, '']}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
}

// ─── Inline stat pill ────────────────────────────────────────
function StatPill({ label, value, color = 'var(--text-primary)', icon }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            minWidth: 48,
        }}>
            <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 800,
                color,
                lineHeight: 1,
            }}>
                {icon && <span style={{ marginRight: 2 }}>{icon}</span>}
                {value}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
                {label}
            </div>
        </div>
    );
}

// ─── Player Card ─────────────────────────────────────────────
function PlayerCard({ player, index, isAdmin, onEdit, onDelete, loading }) {
    const wins   = player.wins || 0;
    const losses = player.losses || 0;
    const total  = wins + losses;
    const wr     = getWinRate(player);
    const streak     = player.streak || 0;
    const bestStreak = player.bestStreak || 0;
    const points = player.points || 0;
    const elo    = player.eloRating || 1000;

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    // Colour accent by rank
    const rankColors = [
        { border: '#fbbf24', glow: 'rgba(251,191,36,0.25)', fill: 'rgba(251,191,36,0.06)' }, // 1st
        { border: '#94a3b8', glow: 'rgba(148,163,184,0.2)', fill: 'rgba(148,163,184,0.05)' }, // 2nd
        { border: '#cd7f32', glow: 'rgba(205,127,50,0.2)',  fill: 'rgba(205,127,50,0.05)'  }, // 3rd
    ];
    const accent = index < 3 ? rankColors[index] : { border: 'rgba(148,163,184,0.15)', glow: 'none', fill: 'transparent' };

    return (
        <div style={{
            background: `linear-gradient(145deg, ${accent.fill} 0%, var(--bg-card) 100%)`,
            border: `1.5px solid ${accent.border}`,
            borderRadius: 20,
            padding: '20px 18px 18px',
            position: 'relative',
            boxShadow: index < 3 ? `0 0 28px ${accent.glow}, 0 8px 24px rgba(0,0,0,0.3)` : '0 4px 16px rgba(0,0,0,0.2)',
            transition: 'transform 0.25s ease, box-shadow 0.25s ease',
            cursor: 'default',
            opacity: loading ? 0.6 : 1,
        }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 0 40px ${accent.glow}, 0 16px 32px rgba(0,0,0,0.35)`; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = index < 3 ? `0 0 28px ${accent.glow}, 0 8px 24px rgba(0,0,0,0.3)` : '0 4px 16px rgba(0,0,0,0.2)'; }}
        >
            {/* Rank badge */}
            <div style={{
                position: 'absolute',
                top: 14,
                left: 16,
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 700,
                color: index < 3 ? accent.border : 'var(--text-dim)',
                letterSpacing: 1,
            }}>
                #{index + 1}
            </div>

            {/* Streak badge */}
            {streak > 0 && (
                <div style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    background: 'rgba(251,191,36,0.12)',
                    border: '1px solid rgba(251,191,36,0.3)',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                }}>
                    <Flame size={11} /> {streak}
                </div>
            )}

            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
                <div style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: 'var(--bg-deep)',
                    border: `3px solid ${accent.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    fontWeight: 800,
                    color: accent.border,
                    overflow: 'hidden',
                    boxShadow: `0 0 20px ${accent.glow}`,
                    marginBottom: 10,
                }}>
                    {player.photo
                        ? <img src={player.photo} alt={player.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : getInitials(player.name)
                    }
                </div>

                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.2 }}>
                    {player.name}
                </div>
                {player.nickname && (
                    <div style={{ fontSize: 12, color: accent.border, fontWeight: 500, marginTop: 2 }}>
                        "{player.nickname}"
                    </div>
                )}
                {player.badges && player.badges.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {player.badges.map((b, i) => <span key={i} style={{ fontSize: 16 }}>{b}</span>)}
                    </div>
                )}
            </div>

            {/* Main stats row */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-around',
                paddingBottom: 12,
                borderBottom: '1px solid rgba(148,163,184,0.08)',
                marginBottom: 4,
            }}>
                <StatPill label="Vitórias"  value={wins}    color="var(--green-400)" />
                <StatPill label="Derrotas"  value={losses}  color="var(--red-400)" />
                <StatPill label="Jogos"     value={total}   color="var(--text-secondary)" />
                <StatPill label="Aprov."    value={`${wr}%`} color={wr >= 50 ? 'var(--green-400)' : 'var(--red-400)'} />
            </div>

            {/* Radar chart */}
            <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.5, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'center', marginBottom: 2 }}>
                    Perfil de Desempenho
                </div>
                <PlayerRadar player={player} />
            </div>

            {/* Secondary stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                marginTop: 4,
            }}>
                <div style={{
                    background: 'rgba(16,185,129,0.06)',
                    border: '1px solid rgba(16,185,129,0.12)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    textAlign: 'center',
                }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--green-400)' }}>{points}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pontos</div>
                </div>
                <div style={{
                    background: 'rgba(96,165,250,0.06)',
                    border: '1px solid rgba(96,165,250,0.12)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    textAlign: 'center',
                }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: '#60a5fa' }}>{elo}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>ELO Rating</div>
                </div>
                <div style={{
                    background: 'rgba(251,191,36,0.06)',
                    border: '1px solid rgba(251,191,36,0.12)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    textAlign: 'center',
                }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>
                        {streak > 0 ? `🔥${streak}` : '–'}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Seq. Atual</div>
                </div>
                <div style={{
                    background: 'rgba(167,139,250,0.06)',
                    border: '1px solid rgba(167,139,250,0.12)',
                    borderRadius: 10,
                    padding: '8px 10px',
                    textAlign: 'center',
                }}>
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
                    <div style={{
                        height: '100%',
                        width: `${wr}%`,
                        background: wr >= 60 ? 'var(--green-400)' : wr >= 40 ? '#fbbf24' : 'var(--red-400)',
                        borderRadius: 4,
                        transition: 'width 0.8s ease',
                    }} />
                </div>
            </div>

            {/* Stage & External stats */}
            {player.stageStats && player.stageStats.stagesPlayed > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,0.08)', display: 'flex', justifyContent: 'space-around' }}>
                    <StatPill label="Etapas"  value={player.stageStats.stagesPlayed} color="var(--text-secondary)" />
                    <StatPill label="🏆 Títulos" value={player.stageStats.titles}   color="var(--gold-400)" />
                    <StatPill label="🥇🥈🥉"   value={player.stageStats.podiums}   color="var(--bronze)" />
                </div>
            )}

            {player.extStats && player.extStats.total > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,0.08)', display: 'flex', justifyContent: 'space-around' }}>
                    <StatPill label="⚔️ Externos"  value={player.extStats.total}    color="var(--text-secondary)" />
                    <StatPill label="V Ext."        value={player.extStats.wins}     color="var(--green-400)" />
                    <StatPill label="Aprov. Ext."   value={`${player.extStats.winRate}%`} color={player.extStats.winRate >= 50 ? 'var(--green-400)' : 'var(--red-400)'} />
                </div>
            )}

            {/* Admin buttons */}
            {isAdmin && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => onEdit(player)} disabled={loading}>
                        <Edit size={14} /> Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => onDelete(player.id)} disabled={loading}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────
export default function Players() {
    const { isAdmin } = useAdmin();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [search, setSearch] = useState('');
    const [showHelp, setShowHelp] = useState(false);
    const [form, setForm] = useState({ name: '', nickname: '', photo: '' });
    const [photoMode, setPhotoMode] = useState('upload');

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

    useEffect(() => { refresh(); }, []);

    async function refresh() {
        setLoading(true);
        const ranked = await getRankings();
        const enriched = await Promise.all(ranked.map(async p => {
            const stageStats = await getPlayerStageStats(p.id);
            const extStats = await getPlayerExternalStats(p.id);
            return { ...p, stageStats, extStats };
        }));
        setPlayers(enriched);
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
        setForm({ name: player.name, nickname: player.nickname, photo: player.photo || '' });
        setShowModal(true);
    }

    async function handleDelete(id) {
        if (confirm('Tem certeza que deseja remover este jogador?')) {
            setLoading(true);
            await deletePlayer(id);
            await refresh();
        }
    }

    const filtered = players.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.nickname && p.nickname.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                    <div>
                        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            Jogadores
                            <button
                                onClick={() => setShowHelp(v => !v)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, marginTop: 2 }}
                                title="Como ler o card?"
                            >
                                <HelpCircle size={18} />
                            </button>
                        </h1>
                        <p className="page-subtitle">{players.length} jogadores cadastrados</p>
                    </div>

                    {/* Floating help panel */}
                    {showHelp && (
                        <div
                            onClick={() => setShowHelp(false)}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 999,
                                background: 'rgba(0,0,0,0.4)',
                                display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
                                paddingTop: 80, paddingLeft: 24,
                            }}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    background: 'var(--bg-card)',
                                    border: '1px solid rgba(16,185,129,0.25)',
                                    borderRadius: 16,
                                    padding: '20px 22px',
                                    maxWidth: 340,
                                    width: '90vw',
                                    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                                    position: 'relative',
                                }}
                            >
                                <button
                                    onClick={() => setShowHelp(false)}
                                    style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
                                >
                                    <X size={16} />
                                </button>

                                <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--green-400)', marginBottom: 14, letterSpacing: 1, textTransform: 'uppercase' }}>
                                    📖 Como ler o card
                                </h4>

                                {[
                                    { icon: '🔥', label: 'Badge de Sequência (canto direito)', desc: 'Quantas vitórias consecutivas o jogador tem no momento.' },
                                    { icon: '🏅', label: 'Vitórias / Derrotas / Jogos', desc: 'Totais de partidas registradas na liga.' },
                                    { icon: '📊', label: 'Aproveitamento %', desc: 'Percentual de vitórias em relação ao total de jogos.' },
                                    { icon: '🕸️', label: 'Radar — Perfil de Desempenho', desc: 'Gráfico com 6 dimensões normalizadas (0–100). Vitórias, Aproveit., Sequência Atual, Melhor Sequência, Pontos e Jogos. Quanto maior a área preenchida, mais completo o jogador.' },
                                    { icon: '🟢', label: 'Pontos', desc: 'Pontos acumulados no sistema de pontos fixos (vitória = 3 pts).' },
                                    { icon: '🔵', label: 'ELO Rating', desc: 'Classificação pelo sistema ELO. Começa em 1000. Sobe ao bater rivais fortes.' },
                                    { icon: '🏆', label: 'Seq. Atual / Melhor Seq.', desc: 'Sequência ativa agora e o recorde histórico de vitórias consecutivas.' },
                                    { icon: '⭐', label: 'Borda colorida', desc: '🥇 Ouro = 1º lugar · 🥈 Prata = 2º lugar · 🥉 Bronze = 3º lugar.' },
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
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => { setEditingPlayer(null); setForm({ name: '', nickname: '', photo: '' }); setShowModal(true); }}>
                        <UserPlus size={18} /> Novo Jogador
                    </button>
                )}
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 24, maxWidth: 360 }}>
                <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                    className="form-input"
                    placeholder="Buscar jogador..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingLeft: 40 }}
                />
            </div>

            {/* Grid */}
            {loading && players.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', color: 'var(--text-dim)' }}>
                    <Loader className="animate-spin" size={32} style={{ marginBottom: 16 }} />
                    <p>Sincronizando jogadores...</p>
                </div>
            ) : filtered.length > 0 ? (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 20,
                }}>
                    {filtered.map((player, index) => (
                        <PlayerCard
                            key={player.id}
                            player={player}
                            index={index}
                            isAdmin={isAdmin}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            loading={loading}
                        />
                    ))}
                </div>
            ) : (
                <div className="empty-state">
                    <div className="empty-state-icon">👤</div>
                    <div className="empty-state-title">Nenhum jogador encontrado</div>
                    <div className="empty-state-desc">Adicione o primeiro jogador para começar</div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingPlayer ? 'Editar Jogador' : 'Novo Jogador'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)} disabled={loading}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Nome *</label>
                                    <input
                                        className="form-input"
                                        placeholder="Nome completo"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        required
                                        disabled={loading}
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Apelido</label>
                                    <input
                                        className="form-input"
                                        placeholder="Ex: Tubarão"
                                        value={form.nickname}
                                        onChange={e => setForm({ ...form, nickname: e.target.value })}
                                        disabled={loading}
                                    />
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
                                            {form.photo ? (
                                                <img src={form.photo} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <Camera size={32} style={{ color: 'var(--text-dim)' }} />
                                            )}
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
                                        <button
                                            type="button"
                                            style={{ background: 'none', border: 'none', color: 'var(--green-400)', fontSize: 12, cursor: loading ? 'default' : 'pointer', textDecoration: 'underline', padding: 0, opacity: loading ? 0.5 : 1 }}
                                            onClick={() => !loading && setPhotoMode(prev => prev === 'upload' ? 'url' : 'upload')}
                                            disabled={loading}
                                        >
                                            {photoMode === 'upload' ? 'Ou inserir URL da foto' : 'Ou fazer upload do dispositivo'}
                                        </button>
                                    </div>
                                    {photoMode === 'url' && (
                                        <input
                                            className="form-input"
                                            placeholder="https://..."
                                            value={form.photo.startsWith('data:') ? '' : form.photo}
                                            onChange={e => setForm({ ...form, photo: e.target.value })}
                                            disabled={loading}
                                        />
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
        </div>
    );
}
