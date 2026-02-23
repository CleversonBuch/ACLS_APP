import React, { useState, useEffect } from 'react';
import { getPlayers, getSeasons, getPlayer, resetHallOfFame } from '../data/db.js';
import { getRankings, getWinRate } from '../data/rankingEngine.js';
import { Crown, Trophy, Flame, Star, Medal, Award, Trash2, AlertTriangle, XCircle, Loader } from 'lucide-react';

export default function HallOfFame() {
    const [rankings, setRankingsList] = useState([]);
    const [seasons, setSeasons] = useState([]);
    const [players, setPlayers] = useState([]);
    const [playersMap, setPlayersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    useEffect(() => { refresh(); }, []);

    async function refresh() {
        setLoading(true);
        const [r, s, p] = await Promise.all([
            getRankings(),
            getSeasons(),
            getPlayers()
        ]);
        setRankingsList(r);
        setSeasons(s.filter(season => season.status === 'completed').sort((a, b) => b.year - a.year));
        setPlayers(p);

        const map = {};
        p.forEach(player => map[player.id] = player);
        setPlayersMap(map);

        setLoading(false);
    }

    async function handleResetHallOfFame() {
        setLoading(true);
        await resetHallOfFame();
        setDeleteConfirmOpen(false);
        await refresh();
    }

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    // All-time stats
    const topWins = [...players].sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, 5);
    const topStreak = [...players].sort((a, b) => (b.bestStreak || 0) - (a.bestStreak || 0)).slice(0, 5);
    const topWinRate = [...players]
        .filter(p => (p.wins || 0) + (p.losses || 0) >= 3)
        .sort((a, b) => getWinRate(b) - getWinRate(a))
        .slice(0, 5);

    const allBadgeHolders = players.filter(p => p.badges && p.badges.length > 0);

    if (loading && players.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
                <Loader className="animate-spin" size={32} style={{ marginBottom: 16 }} />
                <p>Carregando Hall da Fama...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">🏛️ Hall da Fama</h1>
                    <p className="page-subtitle">Os maiores feitos da liga</p>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmOpen(true)}>
                    <Trash2 size={16} /> Apagar Dados
                </button>
            </div>

            {/* Champions Timeline */}
            <div className="card" style={{ marginBottom: 24 }}>
                <div className="card-header">
                    <h3 className="card-title">🏆 Campeões por Temporada</h3>
                </div>
                {seasons.length > 0 ? (
                    <div className="champions-timeline">
                        {seasons.map(season => {
                            const champ = season.championId ? playersMap[season.championId] : null;
                            const vice = season.viceId ? playersMap[season.viceId] : null;
                            return (
                                <div key={season.id} className="timeline-item">
                                    <div className="timeline-year">Temporada {season.year}</div>
                                    <div className="timeline-champion">
                                        {champ ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <span>👑</span>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--gold-400)', overflow: 'hidden', flexShrink: 0 }}>
                                                    {champ.photo ? <img src={champ.photo} alt={champ.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(champ.name)}
                                                </div>
                                                {champ.name}
                                                {champ.nickname && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>"{champ.nickname}"</span>}
                                            </span>
                                        ) : 'Campeão desconhecido'}
                                    </div>
                                    {vice && (
                                        <div className="timeline-vice" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            🥈
                                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--silver)', overflow: 'hidden', flexShrink: 0 }}>
                                                {vice.photo ? <img src={vice.photo} alt={vice.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(vice.name)}
                                            </div>
                                            Vice: {vice.name}
                                            {vice.nickname && ` "${vice.nickname}"`}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state" style={{ padding: 24 }}>
                        <div className="empty-state-icon">🏆</div>
                        <div className="empty-state-title">Nenhuma temporada finalizada</div>
                        <div className="empty-state-desc">Finalize uma temporada no Histórico para ver os campeões aqui</div>
                    </div>
                )}
            </div>

            {/* Records Grid */}
            <div className="grid-3" style={{ marginBottom: 24 }}>
                {/* Most Wins */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">⚔️ Mais Vitórias</h3>
                    </div>
                    {topWins.map((p, i) => (
                        <div key={p.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 0',
                            borderBottom: i < topWins.length - 1 ? '1px solid var(--border-subtle)' : 'none'
                        }}>
                            <span style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 700,
                                fontSize: 14,
                                width: 22,
                                color: i === 0 ? 'var(--gold-400)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--text-dim)'
                            }}>
                                {i + 1}
                            </span>
                            <div className="player-avatar-sm" style={{ width: 28, height: 28, fontSize: 11, overflow: 'hidden' }}>
                                {p.photo ? <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : getInitials(p.name)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name.split(' ')[0]}</div>
                            </div>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--green-400)' }}>
                                {p.wins || 0}
                            </span>
                        </div>
                    ))}
                    {topWins.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</div>}
                </div>

                {/* Best Streak */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">🔥 Maior Sequência</h3>
                    </div>
                    {topStreak.map((p, i) => (
                        <div key={p.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 0',
                            borderBottom: i < topStreak.length - 1 ? '1px solid var(--border-subtle)' : 'none'
                        }}>
                            <span style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 700,
                                fontSize: 14,
                                width: 22,
                                color: i === 0 ? 'var(--gold-400)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--text-dim)'
                            }}>
                                {i + 1}
                            </span>
                            <div className="player-avatar-sm" style={{ width: 28, height: 28, fontSize: 11 }}>
                                {getInitials(p.name)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name.split(' ')[0]}</div>
                            </div>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--gold-400)' }}>
                                🔥 {p.bestStreak || 0}
                            </span>
                        </div>
                    ))}
                    {topStreak.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sem dados</div>}
                </div>

                {/* Best Win Rate */}
                <div className="card">
                    <div className="card-header">
                        <h3 className="card-title">🎯 Melhor Aproveitamento</h3>
                    </div>
                    {topWinRate.map((p, i) => (
                        <div key={p.id} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 0',
                            borderBottom: i < topWinRate.length - 1 ? '1px solid var(--border-subtle)' : 'none'
                        }}>
                            <span style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 700,
                                fontSize: 14,
                                width: 22,
                                color: i === 0 ? 'var(--gold-400)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--text-dim)'
                            }}>
                                {i + 1}
                            </span>
                            <div className="player-avatar-sm" style={{ width: 28, height: 28, fontSize: 11 }}>
                                {getInitials(p.name)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name.split(' ')[0]}</div>
                            </div>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--blue-400)' }}>
                                {getWinRate(p)}%
                            </span>
                        </div>
                    ))}
                    {topWinRate.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Mín. 3 jogos</div>}
                </div>
            </div>

            {/* Badges / Medals */}
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">🏅 Medalhas e Conquistas</h3>
                </div>
                {allBadgeHolders.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                        {allBadgeHolders.map(p => (
                            <div key={p.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: 12,
                                background: 'var(--bg-deep)',
                                borderRadius: 'var(--radius-md)'
                            }}>
                                <div className="player-avatar-sm" style={{ overflow: 'hidden' }}>{p.photo ? <img src={p.photo} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : getInitials(p.name)}</div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name.split(' ')[0]}</div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                        {p.badges.map((b, i) => (
                                            <span key={i} style={{ fontSize: 18 }}>{b}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                        Nenhuma conquista alcançada ainda. Continue jogando!
                    </div>
                )}
            </div>

            {/* Current Top 3 */}
            {rankings.length >= 3 && (
                <div className="card" style={{ marginTop: 24 }}>
                    <div className="card-header">
                        <h3 className="card-title">👑 Top 3 Atual</h3>
                    </div>
                    <div className="podium">
                        <div className="podium-place second">
                            <div className="podium-medal">🥈</div>
                            <div className="podium-avatar">{rankings[1].photo ? <img src={rankings[1].photo} alt={rankings[1].name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : getInitials(rankings[1].name)}</div>
                            <div className="podium-name">{rankings[1].name.split(' ')[0]}</div>
                            <div className="podium-bar" />
                        </div>
                        <div className="podium-place first">
                            <div className="podium-medal">🥇</div>
                            <div className="podium-avatar">{rankings[0].photo ? <img src={rankings[0].photo} alt={rankings[0].name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : getInitials(rankings[0].name)}</div>
                            <div className="podium-name">{rankings[0].name.split(' ')[0]}</div>
                            <div className="podium-bar" />
                        </div>
                        <div className="podium-place third">
                            <div className="podium-medal">🥉</div>
                            <div className="podium-avatar">{rankings[2].photo ? <img src={rankings[2].photo} alt={rankings[2].name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : getInitials(rankings[2].name)}</div>
                            <div className="podium-name">{rankings[2].name.split(' ')[0]}</div>
                            <div className="podium-bar" />
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Limpeza */}
            {deleteConfirmOpen && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-400)' }}>
                                <AlertTriangle size={20} /> Apagar Hall da Fama
                            </h3>
                            <button className="modal-close" onClick={() => setDeleteConfirmOpen(false)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--text-secondary)' }}>
                                Tem certeza que deseja apagar os registros do <strong style={{ color: 'var(--text-primary)' }}>Hall da Fama</strong>?
                            </p>
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--red-400)', marginBottom: 16 }}>
                                ⚠️ Esta ação redefinirá o total de vitórias, sequências, medalhas de todos e apagará todas as temporadas finalizadas. Isto não apagará os jogadores do ranking ativo de pontos e elo. O processo é irreversível.
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
                                Cancelar
                            </button>
                            <button className="btn" style={{ background: 'var(--red-500)', color: 'white', fontWeight: 700 }} onClick={handleResetHallOfFame} disabled={loading}>
                                {loading ? <Loader className="animate-spin" size={16} /> : '🗑️ CONFIRMAR LIMPEZA'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
