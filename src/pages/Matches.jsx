import React, { useState, useEffect } from 'react';
import { getSelectives, getMatchesBySelective, getPlayer, updateMatch, updateSelective, deleteSelective, saveStageResults, updatePlayer } from '../data/db.js';
import { applyMatchResult, reverseMatchResult, getHeadToHeadResult, applyFixedPoints } from '../data/rankingEngine.js';
import { CheckCircle, XCircle, Undo2, Trash2, AlertTriangle, Swords, Trophy, Shield } from 'lucide-react';

export default function Matches() {
    const [selectives, setSelectives] = useState([]);
    const [activeSelectiveId, setActiveSelectiveId] = useState(null);
    const [matches, setMatches] = useState([]);
    const [refresh, setRefresh] = useState(0);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
    // Render wizard variables removed since Etapas are decoupled.

    useEffect(() => {
        const all = getSelectives().filter(s => s.eventType !== 'etapa');
        setSelectives(all);
        // Default to latest active
        const active = all.find(s => s.status === 'active') || all[all.length - 1];
        if (active) {
            setActiveSelectiveId(active.id);
        }
    }, [refresh]);

    useEffect(() => {
        if (activeSelectiveId) {
            setMatches(getMatchesBySelective(activeSelectiveId));
        }
    }, [activeSelectiveId, refresh]);


    function handleSetWinner(match, winnerId) {
        const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

        // Update match
        updateMatch(match.id, {
            winnerId,
            score1: winnerId === match.player1Id ? 1 : 0,
            score2: winnerId === match.player2Id ? 1 : 0,
            status: 'completed'
        });

        // Apply ranking
        const selective = selectives.find(s => s.id === activeSelectiveId);
        applyMatchResult(winnerId, loserId, selective?.config);

        setRefresh(r => r + 1);
    }

    function handleUndoResult(match) {
        if (!match.winnerId) return;
        const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;
        const selective = selectives.find(s => s.id === activeSelectiveId);

        // Reverse ranking impact
        reverseMatchResult(match.winnerId, loserId, selective?.config);

        // Reset match to pending
        updateMatch(match.id, {
            winnerId: null,
            score1: null,
            score2: null,
            status: 'pending'
        });

        setRefresh(r => r + 1);
    }

    function handleSetScore(matchId, field, value) {
        updateMatch(matchId, { [field]: parseInt(value) || 0 });
        setRefresh(r => r + 1);
    }

    function handleCompleteSelective() {
        if (!activeSelectiveId) return;
        const selective = selectives.find(s => s.id === activeSelectiveId);

        // For selectives, we don't save external final placements formally yet, but logic is preserved for future rankings
        updateSelective(activeSelectiveId, { status: 'completed' });
        setRefresh(r => r + 1);
    }

    function handleDeleteSelective() {
        if (!activeSelectiveId) return;
        const selective = selectives.find(s => s.id === activeSelectiveId);

        // Reverse all completed match rankings for this selective
        const selectiveMatches = matches.filter(m => m.status === 'completed' && m.winnerId);
        selectiveMatches.forEach(m => {
            const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
            reverseMatchResult(m.winnerId, loserId, selective?.config);
        });

        // Delete selective + its matches
        deleteSelective(activeSelectiveId);
        setActiveSelectiveId(null);
        setDeleteConfirmStep(0);
        setRefresh(r => r + 1);
    }

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    const activeSelective = selectives.find(s => s.id === activeSelectiveId);
    const completedCount = matches.filter(m => m.status === 'completed').length;
    const totalMatches = matches.length;
    const progress = totalMatches > 0 ? Math.round((completedCount / totalMatches) * 100) : 0;

    const canComplete = completedCount === totalMatches && totalMatches > 0;

    // Group matches by round
    const rounds = {};
    matches.forEach(m => {
        const round = m.round || 1;
        if (!rounds[round]) rounds[round] = [];
        rounds[round].push(m);
    });

    const isElimination = activeSelective?.mode === 'elimination';

    // ── Compute standings per selective ──
    const standings = (() => {
        if (!activeSelective) return [];
        const playerIds = activeSelective.playerIds || [];
        const map = {};
        playerIds.forEach(pid => {
            const p = getPlayer(pid);
            map[pid] = { id: pid, name: p?.name || '?', nickname: p?.nickname || '', wins: 0, losses: 0, points: 0 };
        });
        const completedMatches = matches.filter(m => m.status === 'completed' && m.winnerId);
        completedMatches.forEach(m => {
            const config = activeSelective.config || {};
            const ptsWin = config.pointsPerWin ?? 3;
            const ptsLoss = config.pointsPerLoss ?? 0;
            if (map[m.winnerId]) {
                map[m.winnerId].wins += 1;
                map[m.winnerId].points += ptsWin;
            }
            const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
            if (loserId && map[loserId]) {
                map[loserId].losses += 1;
                map[loserId].points += ptsLoss;
            }
        });
        return Object.values(map).sort((a, b) => {
            // 1st: points
            if (b.points !== a.points) return b.points - a.points;
            // 2nd: confronto direto (head-to-head within this selective)
            const h2h = getHeadToHeadResult(a.id, b.id, completedMatches);
            if (h2h !== 0) return -h2h;
            // 3rd: more wins
            if (b.wins !== a.wins) return b.wins - a.wins;
            // 4th: fewer losses
            return a.losses - b.losses;
        });
    })();

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Confrontos</h1>
                    <p className="page-subtitle">Definir resultados das partidas</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {activeSelective && (
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmStep(1)}>
                            <Trash2 size={16} /> Apagar Seletiva
                        </button>
                    )}
                    {activeSelective?.status === 'active' && canComplete && (
                        <button className="btn btn-gold" onClick={handleCompleteSelective}>
                            <CheckCircle size={18} /> Finalizar Seletiva
                        </button>
                    )}
                </div>
            </div>

            {/* Selective Selector */}
            {selectives.length > 0 && (
                <div className="season-tabs" style={{ marginBottom: 20 }}>
                    {selectives.map(s => (
                        <button
                            key={s.id}
                            className={`season-tab ${activeSelectiveId === s.id ? 'active' : ''}`}
                            onClick={() => setActiveSelectiveId(s.id)}
                        >
                            {s.name} {s.status === 'completed' ? '✅' : '🔵'}
                        </button>
                    ))}
                </div>
            )}

            {activeSelective && (
                <>
                    {/* Progress Bar */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                Progresso: {completedCount}/{totalMatches} partidas
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-400)' }}>{progress}%</span>
                        </div>
                        <div style={{
                            height: 8,
                            background: 'var(--bg-elevated)',
                            borderRadius: 999,
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${progress}%`,
                                background: 'linear-gradient(90deg, var(--green-500), var(--green-400))',
                                borderRadius: 999,
                                transition: 'width 0.4s ease'
                            }} />
                        </div>
                    </div>

                    {/* ── Resultado por Seletiva ── */}
                    {standings.length > 0 && completedCount > 0 && (
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div className="card-header">
                                <h3 className="card-title">📊 Resultado da Seletiva</h3>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {activeSelective?.config?.pointsPerWin ?? 3} pts/vitória · {activeSelective?.config?.pointsPerLoss ?? 0} pts/derrota
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="ranking-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 50 }}>#</th>
                                            <th>Jogador</th>
                                            <th>V</th>
                                            <th>D</th>
                                            <th>J</th>
                                            <th>Aprov.</th>
                                            <th>Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {standings.map((s, i) => {
                                            const total = s.wins + s.losses;
                                            const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
                                            const zoneColor = i < 5 ? '#10b981' : i === 5 ? '#f59e0b' : '#ef4444';
                                            const zoneBg = i < 5 ? 'rgba(16,185,129,0.15)' : i === 5 ? 'rgba(245,158,11,0.18)' : 'rgba(239,68,68,0.15)';
                                            return (
                                                <tr key={s.id}>
                                                    <td style={{ background: zoneBg, borderLeft: `4px solid ${zoneColor}` }}>
                                                        <div className={`rank-position ${i === 0 ? 'top-1' : i === 1 ? 'top-2' : i === 2 ? 'top-3' : ''}`}>
                                                            {i + 1}
                                                        </div>
                                                    </td>
                                                    <td style={{ background: zoneBg }}>
                                                        <div className="player-cell">
                                                            <div className="player-avatar-sm">{getInitials(s.name)}</div>
                                                            <div>
                                                                <div className="player-info-name">{s.name}</div>
                                                                {s.nickname && <div className="player-info-nickname">{s.nickname}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ color: 'var(--green-400)', fontWeight: 600, background: zoneBg }}>{s.wins}</td>
                                                    <td style={{ color: 'var(--red-400)', fontWeight: 600, background: zoneBg }}>{s.losses}</td>
                                                    <td style={{ color: 'var(--text-secondary)', background: zoneBg }}>{total}</td>
                                                    <td style={{ background: zoneBg }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span>{rate}%</span>
                                                            <div className="win-rate-bar" style={{ width: 50 }}>
                                                                <div className="win-rate-fill" style={{ width: `${rate}%` }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ background: zoneBg }}>
                                                        <span style={{
                                                            fontFamily: 'var(--font-display)',
                                                            fontWeight: 700,
                                                            fontSize: 16,
                                                            color: zoneColor
                                                        }}>
                                                            {s.points}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ETAPA UI HAS BEEN REMOVED */}

                    {/* Matches */}
                    {isElimination ? (
                        // Bracket View for Elimination
                        <div className="bracket-container">
                            {Object.entries(rounds).map(([roundNum, roundMatches]) => (
                                <div key={roundNum} className="bracket-round">
                                    <div className="bracket-round-title">
                                        {Object.keys(rounds).length === parseInt(roundNum) ? 'Final' :
                                            parseInt(roundNum) === Object.keys(rounds).length - 1 ? 'Semifinal' :
                                                `Rodada ${roundNum}`}
                                    </div>
                                    {roundMatches.map(match => {
                                        const p1 = getPlayer(match.player1Id);
                                        const p2 = match.player2Id ? getPlayer(match.player2Id) : null;
                                        return (
                                            <div key={match.id} className="bracket-match">
                                                <div
                                                    className={`bracket-player ${match.winnerId === match.player1Id ? 'winner' : ''}`}
                                                    onClick={() => p1 && p2 && match.status !== 'completed' && handleSetWinner(match, match.player1Id)}
                                                >
                                                    <span className="bracket-player-name">{p1?.name || 'BYE'}</span>
                                                    <span className="bracket-player-score">
                                                        {match.winnerId === match.player1Id ? '✓' : match.score1 ?? '-'}
                                                    </span>
                                                </div>
                                                <div
                                                    className={`bracket-player ${match.winnerId === match.player2Id ? 'winner' : ''}`}
                                                    onClick={() => p1 && p2 && match.status !== 'completed' && handleSetWinner(match, match.player2Id)}
                                                >
                                                    <span className="bracket-player-name">{p2?.name || 'BYE'}</span>
                                                    <span className="bracket-player-score">
                                                        {match.winnerId === match.player2Id ? '✓' : match.score2 ?? '-'}
                                                    </span>
                                                </div>
                                                {match.status === 'completed' && (
                                                    <div style={{ textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ width: '100%', borderRadius: 0, color: 'var(--red-400)', background: 'rgba(239,68,68,0.06)', fontSize: 11, padding: '6px 0' }}
                                                            onClick={() => handleUndoResult(match)}
                                                        >
                                                            <Undo2 size={12} /> Desfazer
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ) : (
                        // Grid View for Round-Robin & Swiss
                        Object.entries(rounds).map(([roundNum, roundMatches]) => (
                            <div key={roundNum} style={{ marginBottom: 24 }}>
                                <h3 style={{
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 16,
                                    fontWeight: 600,
                                    color: 'var(--green-400)',
                                    marginBottom: 12,
                                    textTransform: 'uppercase',
                                    letterSpacing: 1
                                }}>
                                    Rodada {roundNum}
                                </h3>
                                <div className="matches-grid">
                                    {roundMatches.map(match => {
                                        const p1 = getPlayer(match.player1Id);
                                        const p2 = match.player2Id ? getPlayer(match.player2Id) : null;
                                        const isCompleted = match.status === 'completed';

                                        return (
                                            <div key={match.id} className={`match-card ${isCompleted ? 'completed' : ''}`}>
                                                <div className="match-round">
                                                    {isCompleted ? '✅ Finalizado' : '⏳ Aguardando resultado'}
                                                </div>
                                                <div className="match-versus">
                                                    <div
                                                        className={`match-player ${match.winnerId === match.player1Id ? 'winner' : ''}`}
                                                        onClick={() => !isCompleted && p1 && p2 && handleSetWinner(match, match.player1Id)}
                                                    >
                                                        <div className="player-avatar-sm" style={{ margin: '0 auto 6px' }}>
                                                            {p1 ? getInitials(p1.name) : '?'}
                                                        </div>
                                                        <div className="match-player-name">{p1?.name || 'TBD'}</div>
                                                        {p1?.nickname && (
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p1.nickname}</div>
                                                        )}
                                                    </div>
                                                    <div className="match-vs">VS</div>
                                                    <div
                                                        className={`match-player ${match.winnerId === match.player2Id ? 'winner' : ''}`}
                                                        onClick={() => !isCompleted && p1 && p2 && handleSetWinner(match, match.player2Id)}
                                                    >
                                                        <div className="player-avatar-sm" style={{ margin: '0 auto 6px' }}>
                                                            {p2 ? getInitials(p2.name) : '?'}
                                                        </div>
                                                        <div className="match-player-name">{p2?.name || 'TBD'}</div>
                                                        {p2?.nickname && (
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p2.nickname}</div>
                                                        )}
                                                    </div>
                                                </div>
                                                {!isCompleted && p1 && p2 && (
                                                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                                                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                                            Clique no vencedor para registrar resultado
                                                        </span>
                                                    </div>
                                                )}
                                                {isCompleted && (
                                                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() => handleUndoResult(match)}
                                                        >
                                                            <Undo2 size={14} /> Desfazer Resultado
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}

                    {matches.length === 0 && (
                        <div className="empty-state">
                            <div className="empty-state-icon">⚔️</div>
                            <div className="empty-state-title">Sem confrontos</div>
                            <div className="empty-state-desc">Crie uma seletiva para gerar os confrontos.</div>
                        </div>
                    )}
                </>
            )}

            {selectives.length === 0 && (
                <div className="empty-state">
                    <div className="empty-state-icon">🎱</div>
                    <div className="empty-state-title">Nenhuma seletiva criada</div>
                    <div className="empty-state-desc">Vá para "Nova Seletiva" para começar</div>
                </div>
            )}

            {/* ── Modal Dupla Confirmação para Apagar ── */}
            {deleteConfirmStep > 0 && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmStep(0)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-400)' }}>
                                <AlertTriangle size={20} /> Apagar Seletiva
                            </h3>
                            <button className="modal-close" onClick={() => setDeleteConfirmStep(0)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {deleteConfirmStep === 1 && (
                                <div>
                                    <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--text-secondary)' }}>
                                        Tem certeza que deseja apagar a seletiva <strong style={{ color: 'var(--text-primary)' }}>"{activeSelective?.name}"</strong>?
                                    </p>
                                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--red-400)' }}>
                                        ⚠️ Esta ação irá remover <strong>{totalMatches} partidas</strong> e reverter todos os resultados do ranking.
                                    </div>
                                </div>
                            )}
                            {deleteConfirmStep === 2 && (
                                <div>
                                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                        <AlertTriangle size={48} style={{ color: 'var(--red-400)' }} />
                                    </div>
                                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--red-400)', textAlign: 'center', marginBottom: 8 }}>
                                        ATENÇÃO: ESTA AÇÃO É IRREVERSÍVEL!
                                    </p>
                                    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                                        A seletiva "{activeSelective?.name}" e todas as suas {totalMatches} partidas serão apagadas permanentemente.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirmStep(0)}>
                                Cancelar
                            </button>
                            {deleteConfirmStep === 1 && (
                                <button className="btn btn-danger" onClick={() => setDeleteConfirmStep(2)}>
                                    Sim, quero apagar
                                </button>
                            )}
                            {deleteConfirmStep === 2 && (
                                <button
                                    className="btn"
                                    style={{ background: 'var(--red-500)', color: 'white', fontWeight: 700 }}
                                    onClick={handleDeleteSelective}
                                >
                                    🗑️ CONFIRMAR EXCLUSÃO
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )
            }
        </div >
    );
}
