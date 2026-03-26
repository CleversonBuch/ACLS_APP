import React, { useState, useEffect } from 'react';
import { getPlayers, getSelectives, getMatchesBySelective, updateMatch, updateSelective, deleteSelective, createMatch, updatePlayer } from '../data/db.js';
import { applyMatchResult, reverseMatchResult, getHeadToHeadResult } from '../data/rankingEngine.js';
import { generateSwissRound } from '../data/tournamentEngine.js';
import { CheckCircle, XCircle, Undo2, Trash2, AlertTriangle, Loader, HelpCircle, Target, TrendingUp, Sparkles, BrainCircuit } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useAdmin } from '../contexts/AdminContext.jsx';
import TiebreakerHelpModal from '../components/TiebreakerHelpModal.jsx';

export default function Matches() {
    const { isAdmin } = useAdmin();
    const [selectives, setSelectives] = useState([]);
    const [activeSelectiveId, setActiveSelectiveId] = useState(null);
    const [matches, setMatches] = useState([]);
    const [playersMap, setPlayersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
    const [helpModalOpen, setHelpModalOpen] = useState(false);
    const [aiModalOpen, setAiModalOpen] = useState(false);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            const [allPlayers, allSelectives] = await Promise.all([
                getPlayers(),
                getSelectives()
            ]);

            const map = {};
            allPlayers.forEach(p => map[p.id] = p);
            setPlayersMap(map);

            const internalSelectives = allSelectives.filter(s => s.eventType !== 'etapa');
            setSelectives(internalSelectives);

            let currentId = activeSelectiveId;
            if (!currentId && internalSelectives.length > 0) {
                const active = internalSelectives.find(s => s.status === 'active') || internalSelectives[internalSelectives.length - 1];
                currentId = active.id;
                setActiveSelectiveId(currentId);
            }

            if (currentId) {
                const selectiveMatches = await getMatchesBySelective(currentId);
                setMatches(selectiveMatches);
            } else {
                setMatches([]);
            }
            setLoading(false);
        }
        loadData();
    }, [refresh, activeSelectiveId]);

    // ── Find the next-round match that this match feeds into ──
    function findNextRoundMatch(match, allMatches) {
        const nextRound = match.round + 1;
        const nextBracketPos = Math.floor(match.bracketPosition / 2);
        return allMatches.find(m => m.round === nextRound && m.bracketPosition === nextBracketPos);
    }

    // ── Which slot (player1 or player2) this match feeds into ──
    function getSlotInNextMatch(match) {
        // Even bracketPosition → player1 slot, Odd → player2 slot
        return match.bracketPosition % 2 === 0 ? 'player1Id' : 'player2Id';
    }

    // ── Advance a winner through the bracket, auto-completing BYEs ──
    async function advanceWinnerInBracket(winnerId, currentMatch, allMatches) {
        let current = currentMatch;
        let pId = winnerId;

        while (current) {
            const nextMatch = findNextRoundMatch(current, allMatches);
            if (!nextMatch) break; // Finished the bracket

            const slot = getSlotInNextMatch(current);
            const updates = { [slot]: pId };

            // Check if this nextMatch is a structural BYE (it only has one valid feeder, meaning one slot will always be null)
            // A structural BYE is one where the other slot is explicitly meant to be null forever.
            // Wait, we don't have the explicit bracket structure here. 
            // Instead, we can determine this by checking if the other feeder match exists in allMatches.
            const otherSlotBracketPos = (current.bracketPosition % 2 === 0) ? current.bracketPosition + 1 : current.bracketPosition - 1;
            const otherFeederExists = allMatches.some(m => m.round === current.round && m.bracketPosition === otherSlotBracketPos);

            if (!otherFeederExists) {
                // This nextMatch is a BYE for pId. Auto-advance them!
                updates.status = 'completed';
                updates.winnerId = pId;
                updates.score1 = slot === 'player1Id' ? 1 : 0;
                updates.score2 = slot === 'player2Id' ? 1 : 0;
            }

            // Apply updates
            await updateMatch(nextMatch.id, updates);

            // Update in-memory for the loop
            Object.assign(nextMatch, updates);

            if (updates.status === 'completed') {
                // If it auto-completed (BYE), we need to keep cascading to the NEXT round
                current = nextMatch;
            } else {
                // Stopped at a real match waiting for an opponent
                break;
            }
        }
    }

    async function handleSetWinner(match, winnerId) {
        setLoading(true);
        const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;
        const selective = selectives.find(s => s.id === activeSelectiveId);

        // Update match
        await updateMatch(match.id, {
            winnerId,
            score1: winnerId === match.player1Id ? 1 : 0,
            score2: winnerId === match.player2Id ? 1 : 0,
            status: 'completed'
        });

        // Apply ranking (only for real matches, not BYEs)
        if (match.player1Id && match.player2Id) {
            await applyMatchResult(winnerId, loserId, selective?.config);
        }

        // ── Elimination auto-advance ──
        if (selective?.mode === 'elimination' && match.bracketPosition != null) {
            const allMatches = await getMatchesBySelective(activeSelectiveId);
            await advanceWinnerInBracket(winnerId, match, allMatches);
        }

        // ── Swiss auto-generate next round ──
        if (selective?.mode === 'swiss') {
            const allMatches = await getMatchesBySelective(activeSelectiveId);
            const currentRound = match.round;
            const maxRounds = selective.config?.rounds || 3;
            const currentRoundMatches = allMatches.filter(m => m.round === currentRound);
            const allDone = currentRoundMatches.every(m => m.status === 'completed');

            // Check if next round already exists
            const nextRoundExists = allMatches.some(m => m.round === currentRound + 1);

            if (allDone && currentRound < maxRounds && !nextRoundExists) {
                console.log(`[Swiss] Round ${currentRound} complete! Generating round ${currentRound + 1}...`);

                // Build simple rankings from current standings
                const playerIds = selective.playerIds || [];
                const rankMap = {};
                playerIds.forEach(pid => { rankMap[pid] = { id: pid, points: 0 }; });
                const completedMatches = allMatches.filter(m => m.status === 'completed' && m.winnerId);
                const ptsWin = selective.config?.pointsPerWin ?? 3;
                completedMatches.forEach(m => {
                    if (rankMap[m.winnerId]) rankMap[m.winnerId].points += ptsWin;
                });
                const rankings = Object.values(rankMap).sort((a, b) => b.points - a.points);

                // Generate next round
                const { matches: nextMatches } = generateSwissRound(
                    selective.id,
                    playerIds,
                    rankings,
                    currentRound + 1,
                    completedMatches
                );

                for (const nm of nextMatches) {
                    await createMatch(nm);
                }
                console.log(`[Swiss] Generated ${nextMatches.length} matches for round ${currentRound + 1}`);
            }
        }

        setRefresh(r => r + 1);
    }

    async function handleUndoResult(match) {
        if (!match.winnerId) return;
        const selective = selectives.find(s => s.id === activeSelectiveId);

        // ── Elimination: check if next match was already played ──
        if (selective?.mode === 'elimination' && match.bracketPosition != null) {
            const allMatches = await getMatchesBySelective(activeSelectiveId);
            const nextMatch = findNextRoundMatch(match, allMatches);

            // Allow undo if the next match is completed ONLY IF it was an auto-completed BYE
            const otherSlotBracketPos = (match.bracketPosition % 2 === 0) ? match.bracketPosition + 1 : match.bracketPosition - 1;
            const otherFeederExists = allMatches.some(m => m.round === match.round && m.bracketPosition === otherSlotBracketPos);
            const isNextMatchStructuralBye = !otherFeederExists;

            if (nextMatch && nextMatch.status === 'completed' && !isNextMatchStructuralBye) {
                alert('Não é possível desfazer: a próxima partida do bracket já foi jogada. Desfaça ela primeiro.');
                return;
            }
        }

        setLoading(true);
        const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;

        // Reverse ranking impact (only for real matches, not BYEs)
        if (match.player1Id && match.player2Id) {
            await reverseMatchResult(match.winnerId, loserId, selective?.config);
        }

        // Reset match to pending
        await updateMatch(match.id, {
            winnerId: null,
            score1: null,
            score2: null,
            status: 'pending'
        });

        // ── Elimination: cascade undo ──
        if (selective?.mode === 'elimination' && match.bracketPosition != null) {
            const allMatches = await getMatchesBySelective(activeSelectiveId);
            let current = match;

            while (current) {
                const nextMatch = findNextRoundMatch(current, allMatches);
                if (!nextMatch) break;

                const slot = getSlotInNextMatch(current);
                const updates = { [slot]: null };

                const otherSlotBracketPos = (current.bracketPosition % 2 === 0) ? current.bracketPosition + 1 : current.bracketPosition - 1;
                const otherFeederExists = allMatches.some(m => m.round === current.round && m.bracketPosition === otherSlotBracketPos);
                const isNextMatchStructuralBye = !otherFeederExists;

                if (isNextMatchStructuralBye) {
                    // Reset its completed state too
                    updates.status = 'pending';
                    updates.winnerId = null;
                    updates.score1 = null;
                    updates.score2 = null;
                }

                await updateMatch(nextMatch.id, updates);
                Object.assign(nextMatch, updates);

                if (isNextMatchStructuralBye) {
                    current = nextMatch; // Keep going up the tree undoing the BYE cascade
                } else {
                    break;
                }
            }
        }

        setRefresh(r => r + 1);
    }

    async function handleCompleteSelective() {
        if (!activeSelectiveId) return;
        setLoading(true);

        // ── Save Evolution History for all active players ──
        const selectiveEvent = selectives.find(s => s.id === activeSelectiveId);
        const eventName = selectiveEvent ? selectiveEvent.name : `Evento ${activeSelectiveId}`;
        const allPlayers = await getPlayers();

        // We save the history for ALL players in the database so the chart advances a "round" for everyone
        for (const p of allPlayers) {
            const history = Array.isArray(p.pointsHistory) ? [...p.pointsHistory] : [];
            history.push({
                eventName: eventName,
                points: p.points || 0,
                eloRating: p.eloRating || 1000,
                date: new Date().toISOString()
            });
            await updatePlayer(p.id, { pointsHistory: history });
        }

        await updateSelective(activeSelectiveId, { status: 'completed' });
        setRefresh(r => r + 1);
    }

    async function handleDeleteSelective() {
        if (!activeSelectiveId) return;
        setLoading(true);
        const selective = selectives.find(s => s.id === activeSelectiveId);

        // Reverse all completed match rankings for this selective
        const selectiveMatches = matches.filter(m => m.status === 'completed' && m.winnerId);
        for (const m of selectiveMatches) {
            const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
            await reverseMatchResult(m.winnerId, loserId, selective?.config);
        }

        // Delete selective + its matches
        await deleteSelective(activeSelectiveId);
        setActiveSelectiveId(null);
        setDeleteConfirmStep(0);
        setRefresh(r => r + 1);
    }

    function getInitials(name) {
        return name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';
    }

    const activeSelective = selectives.find(s => s.id === activeSelectiveId);

    // For elimination, exclude BYE matches from progress
    const realMatches = activeSelective?.mode === 'elimination'
        ? matches.filter(m => m.player1Id && m.player2Id)
        : matches;
    const completedCount = realMatches.filter(m => m.status === 'completed').length;
    const totalMatches = realMatches.length;
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
            const p = playersMap[pid];
            map[pid] = { id: pid, name: p?.name || '?', nickname: p?.nickname || '', photo: p?.photo || '', wins: 0, losses: 0, points: 0, sbScore: 0 };
        });
        const completedMatches = matches.filter(m => m.status === 'completed' && m.winnerId);

        // 1. Calculate standard points
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

        // 2. Calculate Sonneborn-Berger (SB) Score for tiebreakers
        // SB Score = sum of points of all defeated opponents
        Object.values(map).forEach(player => {
            const wins = completedMatches.filter(m => m.winnerId === player.id);
            wins.forEach(w => {
                const loserId = w.player1Id === player.id ? w.player2Id : w.player1Id;
                if (loserId && map[loserId]) {
                    player.sbScore += map[loserId].points;
                }
            });
        });

        return Object.values(map).sort((a, b) => {
            // 1st: points
            if (b.points !== a.points) return b.points - a.points;
            // 2nd: confronto direto (head-to-head within this selective)
            const h2h = getHeadToHeadResult(a.id, b.id, completedMatches);
            if (h2h !== 0) return -h2h;
            // 3rd: Sonneborn-Berger score (Qualidade de vitórias)
            if (b.sbScore !== a.sbScore) return b.sbScore - a.sbScore;
            // 4th: more wins
            if (b.wins !== a.wins) return b.wins - a.wins;
            // 5th: fewer losses
            return a.losses - b.losses;
        });
    })();

    // ── Compute AI Classification Chances (Monte Carlo) ──
    const top5Chances = (() => {
        if (!activeSelective || matches.length === 0 || standings.length === 0) return {};
        const config = activeSelective.config || {};
        const ptsWin = config.pointsPerWin ?? 3;
        const ptsLoss = config.pointsPerLoss ?? 0;
        
        const pendingMatches = matches.filter(m => m.status !== 'completed' && m.player1Id && m.player2Id);
        const chances = {};
        standings.forEach(s => chances[s.id] = 0);
        
        if (pendingMatches.length === 0) {
            standings.slice(0, 5).forEach(s => chances[s.id] = 100);
            return chances;
        }

        const SIMULATIONS = 800;
        for (let i = 0; i < SIMULATIONS; i++) {
            const simPoints = {};
            standings.forEach(s => simPoints[s.id] = s.points);
            
            pendingMatches.forEach(pm => {
                const winner = Math.random() < 0.5 ? pm.player1Id : pm.player2Id;
                const loser = winner === pm.player1Id ? pm.player2Id : pm.player1Id;
                simPoints[winner] += ptsWin;
                simPoints[loser] += ptsLoss;
            });
            
            const simResult = standings.map(s => ({ id: s.id, points: simPoints[s.id] })).sort((a,b) => b.points - a.points);
            for(let rank = 0; rank < 5 && rank < simResult.length; rank++) {
                chances[simResult[rank].id]++;
            }
        }
        
        Object.keys(chances).forEach(id => {
            chances[id] = Math.round((chances[id] / SIMULATIONS) * 100);
        });
        return chances;
    })();

    // ── Compute LineChart Data (Points per round strictly for this selective) ──
    const chartLineColors = ['#10b981', '#fbbf24', '#60a5fa', '#f87171', '#a78bfa', '#f472b6', '#34d399', '#818cf8'];
    const selectiveChartData = (() => {
        if (!activeSelective || matches.length === 0 || standings.length === 0) return [];
        const completedMatches = matches.filter(m => m.status === 'completed' && m.winnerId);
        if (completedMatches.length === 0) return [];
        
        const config = activeSelective.config || {};
        const ptsWin = config.pointsPerWin ?? 3;
        const ptsLoss = config.pointsPerLoss ?? 0;
        const maxRoundPlayed = Math.max(...completedMatches.map(m => m.round || 1));
        
        const data = [{ name: 'Início', ...Object.fromEntries(standings.map(s => [s.nickname || s.name, 0])) }];
        const playerAcc = {};
        standings.forEach(s => playerAcc[s.nickname || s.name] = 0);
        
        for (let r = 1; r <= maxRoundPlayed; r++) {
            const rMatches = completedMatches.filter(m => m.round === r);
            rMatches.forEach(m => {
                const winnerIdx = standings.find(x => x.id === m.winnerId);
                const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
                const loserIdx = standings.find(x => x.id === loserId);
                if (winnerIdx) playerAcc[winnerIdx.nickname || winnerIdx.name] += ptsWin;
                if (loserIdx) playerAcc[loserIdx.nickname || loserIdx.name] += ptsLoss;
            });
            
            const point = { name: `Rod ${r}` };
            standings.forEach(s => point[s.nickname || s.name] = playerAcc[s.nickname || s.name]);
            data.push(point);
        }
        return data;
    })();

    if (loading && Object.keys(playersMap).length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
                <Loader className="animate-spin" size={32} style={{ marginBottom: 16 }} />
                <p>Carregando chaves da seletiva...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Confrontos</h1>
                    <p className="page-subtitle">Definir resultados das partidas</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {activeSelective && isAdmin && (
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmStep(1)}>
                            <Trash2 size={16} /> Apagar Seletiva
                        </button>
                    )}
                    {activeSelective?.status === 'active' && canComplete && isAdmin && (
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
                            disabled={loading}
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
                                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    📊 Resultado da Seletiva
                                    <button
                                        onClick={() => setHelpModalOpen(true)}
                                        style={{
                                            background: 'none', border: 'none', color: 'var(--text-muted)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center'
                                        }}
                                    >
                                        <HelpCircle size={14} />
                                    </button>
                                </h3>
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
                                            <th className="hide-mobile">J</th>
                                            <th className="hide-mobile">Aprov.</th>
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
                                                            <div className="player-avatar-sm" style={{ overflow: 'hidden' }}>{s.photo ? <img src={s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : getInitials(s.name)}</div>
                                                            <div>
                                                                <div className="player-info-name">{s.name}</div>
                                                                {s.nickname && <div className="player-info-nickname">{s.nickname}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ color: 'var(--green-400)', fontWeight: 600, background: zoneBg }}>{s.wins}</td>
                                                    <td style={{ color: 'var(--red-400)', fontWeight: 600, background: zoneBg }}>{s.losses}</td>
                                                    <td className="hide-mobile" style={{ color: 'var(--text-secondary)', background: zoneBg }}>{total}</td>
                                                    <td className="hide-mobile" style={{ background: zoneBg }}>
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

                    {/* ── Line Chart of Current Selective ── */}
                    {selectiveChartData.length > 0 && (
                        <div className="card" style={{ marginBottom: 20 }}>
                            <div className="card-header">
                                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <TrendingUp size={16} style={{ color: 'var(--blue-400)' }} /> Desempenho (Desta Seletiva)
                                </h3>
                            </div>
                            <ResponsiveContainer width="100%" height={180}>
                                <LineChart data={selectiveChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.06)" />
                                    <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#475569', fontSize: 10 }} />
                                    <Tooltip contentStyle={{ background: '#1a2332', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 8, fontSize: 12, color: '#f1f5f9' }} />
                                    {standings.slice(0, 8).map((p, i) => (
                                        <Line key={p.id} type="monotone" dataKey={p.nickname || p.name} stroke={chartLineColors[i % chartLineColors.length]} strokeWidth={2} dot={true} connectNulls />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* ── AI Classification Chances Table ── */}
                    {standings.length > 0 && progress < 100 && (
                        <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(to right, rgba(16,185,129,0.03), var(--bg-card))', borderLeft: '3px solid var(--green-500)' }}>
                            <div className="card-header">
                                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BrainCircuit size={16} className="text-green" /> Módulo Dinâmico IA
                                    <button
                                        onClick={() => setAiModalOpen(true)}
                                        style={{
                                            background: 'none', border: 'none', color: 'var(--text-muted)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center'
                                        }}
                                        title="Como funciona a IA?"
                                    >
                                        <HelpCircle size={14} />
                                    </button>
                                </h3>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chances de Top 5</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="ranking-table" style={{ fontSize: 13 }}>
                                    <thead>
                                        <tr>
                                            <th>Jogador</th>
                                            <th>Pontos Atuais</th>
                                            <th>Chance Real (%)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {standings.map((s, i) => {
                                            const chance = top5Chances[s.id] || 0;
                                            let color = 'var(--red-400)';
                                            if (chance > 80) color = 'var(--green-400)';
                                            else if (chance > 40) color = 'var(--gold-400)';
                                            
                                            return (
                                                <tr key={s.id}>
                                                    <td>{s.nickname || s.name}</td>
                                                    <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{s.points} pts</td>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span style={{ color, fontWeight: 700, width: 34 }}>{chance}%</span>
                                                            <div style={{ height: 6, flex: 1, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                                                <div style={{ height: '100%', width: `${chance}%`, background: color }} />
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Matches */}
                    {isElimination ? (
                        // Bracket View for Elimination
                        <div className="bracket-container">
                            {Object.entries(rounds).map(([roundNum, roundMatches]) => {
                                const totalRoundsCount = Object.keys(rounds).length;
                                const rn = parseInt(roundNum);
                                const roundLabel = rn === totalRoundsCount ? '🏆 Final' :
                                    rn === totalRoundsCount - 1 ? 'Semifinal' :
                                        rn === totalRoundsCount - 2 && totalRoundsCount > 3 ? 'Quartas de Final' :
                                            `Rodada ${roundNum}`;

                                // Filter out BYE-only matches? No, we want to show them now so it's clear everyone starts in Round 1.
                                const visibleMatches = roundMatches;

                                if (visibleMatches.length === 0) return null;

                                return (
                                    <div key={roundNum} className="bracket-round">
                                        <div className="bracket-round-title">{roundLabel}</div>
                                        {visibleMatches.map(match => {
                                            const p1 = match.player1Id ? playersMap[match.player1Id] : null;
                                            const p2 = match.player2Id ? playersMap[match.player2Id] : null;
                                            const bothReady = match.player1Id && match.player2Id;
                                            const canPlay = bothReady && match.status !== 'completed' && !loading && isAdmin;

                                            // Verify if it's a structural BYE (Round 1 or later auto-completed with a null player)
                                            // Since we auto-complete structural byes immediately, checking for status === 'completed', 
                                            // and possessing exactly one player at the time is a good heuristic.
                                            // BUT wait, p1 and p2 might just not be ready yet. A true structural bye means one specific slot will NEVER be filled.
                                            // The safest way is to check the feeder matches to see if the other slot even exists...
                                            // But for rendering, checking if one player is null and it's already 'completed' works because normal unfinished matches are 'pending'.
                                            const isByeMatch = (!match.player1Id || !match.player2Id) && match.status === 'completed';

                                            return (
                                                <div key={match.id} className={`bracket-match ${!bothReady && !isByeMatch ? 'waiting' : ''}`}>
                                                    <div
                                                        className={`bracket-player ${match.winnerId === match.player1Id ? 'winner' : ''}`}
                                                        onClick={() => canPlay && handleSetWinner(match, match.player1Id)}
                                                        style={{ cursor: canPlay ? 'pointer' : 'default', opacity: (!match.player1Id && !isByeMatch) ? 0.4 : 1 }}
                                                    >
                                                        <span className="bracket-player-name" style={{ color: isByeMatch && !match.player1Id ? 'var(--text-muted)' : 'inherit' }}>
                                                            {p1?.name || (isByeMatch && !match.player1Id ? 'Avanço Direto (W.O.)' : (match.player1Id ? 'Jogador' : 'Aguardando...'))}
                                                        </span>
                                                        <span className="bracket-player-score">
                                                            {match.winnerId === match.player1Id ? '✓' : (match.player1Id ? (match.score1 ?? '-') : (isByeMatch ? '-' : ''))}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={`bracket-player ${match.winnerId === match.player2Id ? 'winner' : ''}`}
                                                        onClick={() => canPlay && handleSetWinner(match, match.player2Id)}
                                                        style={{ cursor: canPlay ? 'pointer' : 'default', opacity: (!match.player2Id && !isByeMatch) ? 0.4 : 1 }}
                                                    >
                                                        <span className="bracket-player-name" style={{ color: isByeMatch && !match.player2Id ? 'var(--text-muted)' : 'inherit' }}>
                                                            {p2?.name || (isByeMatch && !match.player2Id ? 'Avanço Direto (W.O.)' : (match.player2Id ? 'Jogador' : 'Aguardando...'))}
                                                        </span>
                                                        <span className="bracket-player-score">
                                                            {match.winnerId === match.player2Id ? '✓' : (match.player2Id ? (match.score2 ?? '-') : (isByeMatch ? '-' : ''))}
                                                        </span>
                                                    </div>
                                                    {match.status === 'completed' && bothReady && !isByeMatch && isAdmin && (
                                                        <div style={{ textAlign: 'center', borderTop: '1px solid var(--border-subtle)' }}>
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ width: '100%', borderRadius: 0, color: 'var(--red-400)', background: 'rgba(239,68,68,0.06)', fontSize: 11, padding: '6px 0' }}
                                                                onClick={() => !loading && handleUndoResult(match)}
                                                                disabled={loading}
                                                            >
                                                                <Undo2 size={12} /> Desfazer
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
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
                                        const p1 = playersMap[match.player1Id];
                                        const p2 = match.player2Id ? playersMap[match.player2Id] : null;
                                        const isCompleted = match.status === 'completed';

                                        return (
                                            <div key={match.id} className={`match-card ${isCompleted ? 'completed' : ''}`}>
                                                <div className="match-round">
                                                    {isCompleted ? '✅ Finalizado' : '⏳ Aguardando resultado'}
                                                </div>
                                                <div className="match-versus">
                                                    <div
                                                        className={`match-player ${match.winnerId === match.player1Id ? 'winner' : ''}`}
                                                        onClick={() => !loading && !isCompleted && p1 && p2 && isAdmin && handleSetWinner(match, match.player1Id)}
                                                    >
                                                        <div className="player-avatar-sm" style={{ margin: '0 auto 6px', overflow: 'hidden' }}>
                                                            {p1?.photo ? <img src={p1.photo} alt={p1.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : (p1 ? getInitials(p1.name) : '?')}
                                                        </div>
                                                        <div className="match-player-name">{p1?.name || 'TBD'}</div>
                                                        {p1?.nickname && (
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p1.nickname}</div>
                                                        )}
                                                    </div>
                                                    <div className="match-vs">VS</div>
                                                    <div
                                                        className={`match-player ${match.winnerId === match.player2Id ? 'winner' : ''}`}
                                                        onClick={() => !loading && !isCompleted && p1 && p2 && isAdmin && handleSetWinner(match, match.player2Id)}
                                                    >
                                                        <div className="player-avatar-sm" style={{ margin: '0 auto 6px', overflow: 'hidden' }}>
                                                            {p2?.photo ? <img src={p2.photo} alt={p2.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} /> : (p2 ? getInitials(p2.name) : '?')}
                                                        </div>
                                                        <div className="match-player-name">{p2?.name || 'TBD'}</div>
                                                        {p2?.nickname && (
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p2.nickname}</div>
                                                        )}
                                                    </div>
                                                </div>
                                                {!isCompleted && p1 && p2 && isAdmin && (
                                                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                                                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                                            Clique no vencedor para registrar resultado
                                                        </span>
                                                    </div>
                                                )}
                                                {isCompleted && isAdmin && (
                                                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() => !loading && handleUndoResult(match)}
                                                            disabled={loading}
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
                    )
                    }

                    {
                        matches.length === 0 && (
                            <div className="empty-state">
                                <div className="empty-state-icon">⚔️</div>
                                <div className="empty-state-title">Sem confrontos</div>
                                <div className="empty-state-desc">Crie uma seletiva para gerar os confrontos.</div>
                            </div>
                        )
                    }
                </>
            )}

            {
                selectives.length === 0 && !loading && (
                    <div className="empty-state">
                        <div className="empty-state-icon">🎱</div>
                        <div className="empty-state-title">Nenhuma seletiva criada</div>
                        <div className="empty-state-desc">Vá para "Nova Seletiva" para começar</div>
                    </div>
                )
            }

            {/* ── Modal Dupla Confirmação para Apagar ── */}
            {
                deleteConfirmStep > 0 && (
                    <div className="modal-overlay" onClick={() => !loading && setDeleteConfirmStep(0)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                            <div className="modal-header">
                                <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-400)' }}>
                                    <AlertTriangle size={20} /> Apagar Seletiva
                                </h3>
                                <button className="modal-close" onClick={() => !loading && setDeleteConfirmStep(0)} disabled={loading}>
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
                                <button className="btn btn-secondary" onClick={() => !loading && setDeleteConfirmStep(0)} disabled={loading}>
                                    Cancelar
                                </button>
                                {deleteConfirmStep === 1 && (
                                    <button className="btn btn-danger" onClick={() => !loading && setDeleteConfirmStep(2)} disabled={loading}>
                                        Sim, quero apagar
                                    </button>
                                )}
                                {deleteConfirmStep === 2 && (
                                    <button
                                        className="btn"
                                        style={{ background: 'var(--red-500)', color: 'white', fontWeight: 700 }}
                                        onClick={() => !loading && handleDeleteSelective()}
                                        disabled={loading}
                                    >
                                        {loading ? <Loader className="animate-spin" size={16} /> : '🗑️ CONFIRMAR EXCLUSÃO'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ── Modal Módulo IA ── */}
            {aiModalOpen && (
                <div className="modal-overlay" onClick={() => setAiModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green-400)' }}>
                                <BrainCircuit size={20} /> Como funciona a IA?
                            </h3>
                            <button className="modal-close" onClick={() => setAiModalOpen(false)}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body" style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
                            <p style={{ marginBottom: 16 }}>
                                O <strong>Módulo Dinâmico de IA</strong> realiza previsões avançadas sobre as chances de cada jogador terminar a seletiva no <strong>Top 5</strong>.
                            </p>
                            <div style={{ background: 'var(--bg-elevated)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                                <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                                    <li style={{ marginBottom: 12 }}>
                                        <strong>🎲 Simulação de Monte Carlo</strong><br />
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>A IA joga o restante do torneio <strong>800 vezes</strong> em frações de segundo, testando todas as combinações possíveis de vitórias e derrotas para as partidas que ainda não aconteceram.</span>
                                    </li>
                                    <li>
                                        <strong>📊 Probabilidade Real</strong><br />
                                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Se um jogador se classifica em 400 das 800 simulações, sua chance real matemática de classificação é calculada exatamente como 50%.</span>
                                    </li>
                                </ul>
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                Apenas estatística pura e direta, atualizada em tempo real de forma dinâmica após cada resultado inserido.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <TiebreakerHelpModal
                isOpen={helpModalOpen}
                onClose={() => setHelpModalOpen(false)}
                isElo={false}
            />
        </div >
    );
}
