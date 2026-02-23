import React, { useState, useEffect } from 'react';
import { getSeasons, getPlayer, closeSeason, getSelectives, deleteSeason } from '../data/db.js';
import { getRankings } from '../data/rankingEngine.js';
import { Calendar, Trophy, Medal, CheckCircle, Trash2, AlertTriangle, XCircle } from 'lucide-react';

export default function History() {
    const [seasons, setSeasons] = useState([]);
    const [activeSeason, setActiveSeason] = useState(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    useEffect(() => { refresh(); }, []);

    function refresh() {
        const all = getSeasons().sort((a, b) => b.year - a.year);
        setSeasons(all);
        if (all.length > 0) {
            setActiveSeason(all[0]);
        }
    }

    function handleCloseSeason() {
        if (!activeSeason || activeSeason.status === 'completed') return;

        const rankings = getRankings();
        if (rankings.length < 2) {
            alert('É preciso ter pelo menos 2 jogadores para fechar a temporada.');
            return;
        }

        const champion = rankings[0];
        const vice = rankings[1];

        closeSeason(activeSeason.id, champion.id, vice.id, rankings.map(p => ({
            playerId: p.id,
            name: p.name,
            nickname: p.nickname,
            points: p.points,
            eloRating: p.eloRating,
            wins: p.wins,
            losses: p.losses
        })));

        refresh();
    }

    function handleDeleteSeason() {
        if (!activeSeason) return;
        deleteSeason(activeSeason.id);
        setDeleteConfirmOpen(false);
        refresh();
    }

    const champion = activeSeason?.championId ? getPlayer(activeSeason.championId) : null;
    const vice = activeSeason?.viceId ? getPlayer(activeSeason.viceId) : null;
    const finalRanking = activeSeason?.finalRanking || [];
    const seasonSelectives = getSelectives().filter(s => s.seasonId === activeSeason?.id);

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Histórico</h1>
                    <p className="page-subtitle">Temporadas e resultados anteriores</p>
                </div>
                {activeSeason?.status === 'active' && (
                    <button className="btn btn-gold" onClick={handleCloseSeason}>
                        <CheckCircle size={18} /> Fechar Temporada {activeSeason.year}
                    </button>
                )}
            </div>

            {/* Season Tabs */}
            {seasons.length > 0 && (
                <div className="season-tabs">
                    {seasons.map(s => (
                        <button
                            key={s.id}
                            className={`season-tab ${activeSeason?.id === s.id ? 'active' : ''}`}
                            onClick={() => setActiveSeason(s)}
                        >
                            <Calendar size={14} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                            {s.year}
                            {s.status === 'completed' && ' 🏆'}
                        </button>
                    ))}
                </div>
            )}

            {activeSeason && (
                <div>
                    {/* Season Status */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: activeSeason.status === 'active' ? 'var(--green-400)' : 'var(--gold-400)'
                                }} />
                                <span style={{ fontSize: 14, fontWeight: 600 }}>
                                    Temporada {activeSeason.year} – {activeSeason.status === 'active' ? 'Em Andamento' : 'Finalizada'}
                                </span>
                            </div>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmOpen(true)}>
                                <Trash2 size={16} /> Apagar Temporada
                            </button>
                        </div>
                    </div>

                    {/* Champion & Vice (if completed) */}
                    {activeSeason.status === 'completed' && champion && (
                        <div className="grid-2" style={{ marginBottom: 20 }}>
                            <div className="card card-gold" style={{ textAlign: 'center', padding: 32 }}>
                                <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--gold-400)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                    Campeão
                                </div>
                                <div className="player-card-avatar" style={{ margin: '12px auto' }}>
                                    {getInitials(champion.name)}
                                </div>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--gold-400)' }}>
                                    {champion.name}
                                </div>
                                {champion.nickname && (
                                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>"{champion.nickname}"</div>
                                )}
                            </div>

                            {vice && (
                                <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                                    <div style={{ fontSize: 40, marginBottom: 8 }}>🥈</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--silver)', textTransform: 'uppercase', letterSpacing: 1 }}>
                                        Vice-Campeão
                                    </div>
                                    <div className="player-card-avatar" style={{ margin: '12px auto', borderColor: 'var(--silver)' }}>
                                        {getInitials(vice.name)}
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--silver)' }}>
                                        {vice.name}
                                    </div>
                                    {vice.nickname && (
                                        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>"{vice.nickname}"</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Final Ranking */}
                    {finalRanking.length > 0 && (
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div className="card-header">
                                <h3 className="card-title">📊 Ranking Final</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="ranking-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Jogador</th>
                                            <th>Pontos</th>
                                            <th>ELO</th>
                                            <th>V</th>
                                            <th>D</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {finalRanking.map((player, index) => (
                                            <tr key={player.playerId}>
                                                <td>
                                                    <div className={`rank-position ${index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : ''}`}>
                                                        {index + 1}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="player-cell">
                                                        <div className="player-avatar-sm">{getInitials(player.name)}</div>
                                                        <div>
                                                            <div className="player-info-name">{player.name}</div>
                                                            <div className="player-info-nickname">{player.nickname}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ fontWeight: 700, color: 'var(--green-400)' }}>{player.points || 0}</td>
                                                <td style={{ color: 'var(--text-secondary)' }}>{player.eloRating || 1000}</td>
                                                <td style={{ color: 'var(--green-400)' }}>{player.wins || 0}</td>
                                                <td style={{ color: 'var(--red-400)' }}>{player.losses || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Season Selectives */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">📋 Seletivas da Temporada</h3>
                        </div>
                        {seasonSelectives.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {seasonSelectives.map(s => (
                                    <div key={s.id} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '12px 16px',
                                        background: 'var(--bg-deep)',
                                        borderRadius: 'var(--radius-md)',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                                {s.mode === 'elimination' ? 'Eliminatória' :
                                                    s.mode === 'round-robin' ? 'Todos contra Todos' : 'Sistema Suíço'}
                                                {' · '}{s.playerIds?.length} jogadores
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: 11,
                                            padding: '4px 10px',
                                            borderRadius: 'var(--radius-full)',
                                            background: s.status === 'completed'
                                                ? 'rgba(16, 185, 129, 0.1)'
                                                : 'rgba(251, 191, 36, 0.1)',
                                            color: s.status === 'completed' ? 'var(--green-400)' : 'var(--gold-400)',
                                            fontWeight: 600
                                        }}>
                                            {s.status === 'completed' ? 'Finalizada' : 'Em Andamento'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Nenhuma seletiva nesta temporada</div>
                        )}
                    </div>
                </div>
            )}

            {seasons.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon">📅</div>
                    <div className="empty-state-title">Sem temporadas</div>
                    <div className="empty-state-desc">Uma temporada será criada automaticamente ao usar o sistema</div>
                </div>
            )}

            {/* Delete Season Modal */}
            {deleteConfirmOpen && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-400)' }}>
                                <AlertTriangle size={20} /> Apagar Temporada
                            </h3>
                            <button className="modal-close" onClick={() => setDeleteConfirmOpen(false)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--text-secondary)' }}>
                                Tem certeza que deseja apagar a <strong style={{ color: 'var(--text-primary)' }}>Temporada {activeSeason?.year}</strong>?
                            </p>
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--red-400)', marginBottom: 16 }}>
                                ⚠️ Esta ação apagará todas as Seletivas finalizadas e as partidas individuais que pertenceram a esta temporada. O Histórico não poderá ser recuperado.
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
                                Cancelar
                            </button>
                            <button className="btn" style={{ background: 'var(--red-500)', color: 'white', fontWeight: 700 }} onClick={handleDeleteSeason}>
                                🗑️ CONFIRMAR EXCLUSÃO
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
