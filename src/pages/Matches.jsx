import React, { useState, useEffect } from 'react';
import { getPlayers, getSelectives, getMatchesBySelective, updateMatch, updateSelective, deleteSelective, createMatch, updatePlayer } from '../data/db.js';
import { applyMatchResult, reverseMatchResult, getHeadToHeadResult } from '../data/rankingEngine.js';
import { generateSwissRound } from '../data/tournamentEngine.js';
import { CheckCircle, XCircle, Undo2, Trash2, AlertTriangle, Loader, HelpCircle, Target, TrendingUp, Sparkles, BrainCircuit, Swords, Activity, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
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

            const simResult = standings.map(s => ({ id: s.id, points: simPoints[s.id] })).sort((a, b) => b.points - a.points);
            for (let rank = 0; rank < 5 && rank < simResult.length; rank++) {
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid rgba(52,211,153,0.15)', borderTopColor: '#34d399', animation: 'spin 0.8s linear infinite' }} />
                <p style={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>Carregando seletivas...</p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
        );
    }

    return (
        <div style={{ opacity: loading ? 0.65 : 1, transition: 'opacity 0.25s', animation: 'fadeInUp 0.4s ease' }}>
            <style>{`
                @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
                @keyframes spin{to{transform:rotate(360deg)}}
                .sel-tab:hover{background:rgba(52,211,153,0.08)!important;color:#e2e8f0!important;}
                .match-row-hover:hover{background:rgba(52,211,153,0.04)!important;transform:translateX(1px);}
                .match-row-hover{transition:all 0.18s ease!important;}
                .bracket-match-new:hover{border-color:rgba(52,211,153,0.3)!important;box-shadow:0 4px 20px rgba(0,0,0,0.3)!important;}
                
                @media (max-width: 768px) {
                    .sel-standings-grid { grid-template-columns: 24px 1fr 28px 28px 28px 36px !important; padding: 10px 8px !important; gap: 4px !important; }
                    .hide-mob { display: none !important; }
                    .sel-header-wrap { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
                    .mob-text-sm { font-size: 11px !important; }
                    .mob-text-md { font-size: 14px !important; }
                }
            `}</style>

            {/* ── Header ── */}
            <div className="sel-header-wrap" style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 32, borderRadius: 3, background: 'linear-gradient(180deg, #60a5fa, #3b82f6)' }} />
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Swords size={24} color="#60a5fa" /> Seletivas
                        </h1>
                    </div>
                    <p style={{ color: '#475569', fontSize: 14, marginLeft: 16 }}>Confrontos e resultados das partidas</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activeSelective && isAdmin && (
                        <button onClick={() => setDeleteConfirmStep(1)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <Trash2 size={14} /> Apagar Seletiva
                        </button>
                    )}
                    {activeSelective?.status === 'active' && canComplete && isAdmin && (
                        <button onClick={handleCompleteSelective} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(251,191,36,0.3)', background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))', color: '#fbbf24', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 20px rgba(251,191,36,0.1)' }}>
                            <CheckCircle size={16} /> Finalizar Seletiva
                        </button>
                    )}
                </div>
            </div>

            {/* ── Selective Tabs ── */}
            {selectives.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                    {selectives.map(s => {
                        const isActive = activeSelectiveId === s.id;
                        const isDone = s.status === 'completed';
                        return (
                            <button key={s.id} className="sel-tab" onClick={() => setActiveSelectiveId(s.id)} disabled={loading} style={{
                                padding: '8px 16px', borderRadius: 12, border: `1px solid ${isActive ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.06)'}`,
                                background: isActive ? 'linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.08))' : 'rgba(255,255,255,0.03)',
                                color: isActive ? '#60a5fa' : '#64748b',
                                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 6,
                                boxShadow: isActive ? '0 0 16px rgba(96,165,250,0.1)' : 'none',
                                transition: 'all 0.2s',
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isDone ? '#34d399' : '#60a5fa', flexShrink: 0 }} />
                                {s.name}
                                {isDone && <span style={{ fontSize: 9, fontWeight: 800, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '1px 6px', borderRadius: 6 }}>FINALIZADA</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            {activeSelective && (
                <>
                    {/* ── Progress Bar ── */}
                    <div style={{ background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: '1px solid rgba(96,165,250,0.12)', borderRadius: 18, padding: '18px 22px', marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Activity size={15} color="#60a5fa" />
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Progresso</span>
                                <span style={{ fontSize: 12, color: '#475569' }}>{completedCount}/{totalMatches} partidas</span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 900, color: progress === 100 ? '#34d399' : '#60a5fa', letterSpacing: -1 }}>{progress}%</span>
                        </div>
                        <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: 999, transition: 'width 0.5s ease', boxShadow: progress > 0 ? `0 0 12px ${progress === 100 ? 'rgba(52,211,153,0.4)' : 'rgba(96,165,250,0.4)'}` : 'none' }} />
                        </div>
                    </div>

                    {/* ── Standings ── */}
                    {standings.length > 0 && completedCount > 0 && (
                        <div style={{ background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: '1px solid rgba(148,163,184,0.08)', borderRadius: 20, overflow: 'hidden', marginBottom: 20, position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.3), transparent)' }} />
                            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 17 }}>📊</span>
                                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Resultado da Seletiva</span>
                                    <button onClick={() => setHelpModalOpen(true)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}><HelpCircle size={14} /></button>
                                </div>
                                <span style={{ fontSize: 11, color: '#475569', background: 'rgba(255,255,255,0.04)', padding: '3px 10px', borderRadius: 20 }}>
                                    {activeSelective?.config?.pointsPerWin ?? 3}pts/V · {activeSelective?.config?.pointsPerLoss ?? 0}pts/D
                                </span>
                            </div>
                            {/* Table header */}
                            <div className="sel-standings-grid" style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 44px 44px 70px 64px', padding: '6px 20px', fontSize: 10, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid rgba(148,163,184,0.06)', gap: 8 }}>
                                <span>#</span><span>Jogador</span><span style={{ textAlign: 'center' }}>V</span><span style={{ textAlign: 'center' }}>D</span><span style={{ textAlign: 'center' }}>J</span><span className="hide-mob" style={{ textAlign: 'center' }}>Aprov.</span><span style={{ textAlign: 'center' }}>Pts</span>
                            </div>
                            {standings.map((s, i) => {
                                const total = s.wins + s.losses;
                                const rate = total > 0 ? Math.round((s.wins / total) * 100) : 0;
                                const isClassing = i < 5;
                                const isBubble = i === 5;
                                const rowColor = isClassing ? '#34d399' : isBubble ? '#f59e0b' : '#f87171';
                                const medalMap = ['🥇', '🥈', '🥉'];
                                return (
                                    <div key={s.id} className="match-row-hover sel-standings-grid" style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 44px 44px 70px 64px', alignItems: 'center', padding: '10px 20px', borderBottom: `1px solid rgba(148,163,184,0.04)`, borderLeft: `3px solid ${rowColor}22`, background: isClassing ? `rgba(52,211,153,0.03)` : 'transparent', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: `${rowColor}15`, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: rowColor }}>
                                            {i < 3 ? medalMap[i] : i + 1}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${rowColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: rowColor, flexShrink: 0, overflow: 'hidden' }}>
                                                {s.photo ? <img src={s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(s.name)}
                                            </div>
                                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                                                <div className="mob-text-sm" style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                                                {s.nickname && <div className="hide-mob" style={{ fontSize: 10, color: rowColor, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nickname}</div>}
                                            </div>
                                        </div>
                                        <div className="mob-text-sm" style={{ textAlign: 'center', color: '#34d399', fontWeight: 700, fontSize: 14 }}>{s.wins}</div>
                                        <div className="mob-text-sm" style={{ textAlign: 'center', color: '#f87171', fontWeight: 700, fontSize: 14 }}>{s.losses}</div>
                                        <div className="mob-text-sm" style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>{total}</div>
                                        <div className="hide-mob" style={{ textAlign: 'center' }}>
                                            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 3 }}>
                                                <div style={{ height: '100%', width: `${rate}%`, background: rowColor, borderRadius: 99 }} />
                                            </div>
                                            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{rate}%</span>
                                        </div>
                                        <div className="mob-text-md" style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18, color: rowColor, textShadow: `0 0 10px ${rowColor}40` }}>{s.points}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Chart ── */}
                    {selectiveChartData.length > 0 && (
                        <div style={{ background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: '1px solid rgba(96,165,250,0.1)', borderRadius: 20, overflow: 'hidden', marginBottom: 20, position: 'relative' }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)' }} />
                            <div style={{ padding: '16px 20px 8px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <TrendingUp size={16} color="#60a5fa" />
                                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Desempenho</span>
                                <span style={{ fontSize: 11, color: '#475569', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 20 }}>Desta Seletiva</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    {standings.slice(0, 8).map((p, i) => (
                                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: chartLineColors[i % chartLineColors.length], boxShadow: `0 0 5px ${chartLineColors[i % chartLineColors.length]}80` }} />
                                            <span style={{ fontSize: 10, color: '#64748b' }}>{p.nickname || p.name?.split(' ')[0]}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ padding: '0 8px 16px' }}>
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={selectiveChartData} margin={{ top: 8, right: 16, bottom: 0, left: -10 }}>
                                        <defs>
                                            {chartLineColors.map((c, i) => (
                                                <linearGradient key={i} id={`sg${i}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={c} stopOpacity={0.18} />
                                                    <stop offset="95%" stopColor={c} stopOpacity={0} />
                                                </linearGradient>
                                            ))}
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.05)" />
                                        <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
                                        <Tooltip contentStyle={{ background: 'rgba(10,14,23,0.95)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: 10, fontSize: 11, color: '#f1f5f9' }} />
                                        {standings.slice(0, 8).map((p, i) => (
                                            <Area key={p.id} type="monotone" dataKey={p.nickname || p.name} stroke={chartLineColors[i % chartLineColors.length]} strokeWidth={2} fill={`url(#sg${i})`} dot={{ r: 3, fill: chartLineColors[i % chartLineColors.length], stroke: '#0a0e17', strokeWidth: 1.5 }} activeDot={{ r: 5 }} connectNulls />
                                        ))}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* ── AI Module ── */}
                    {standings.length > 0 && progress < 100 && (
                        <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.05), rgba(15,20,32,0.98))', border: '1px solid rgba(52,211,153,0.15)', borderLeft: '3px solid #10b981', borderRadius: 20, overflow: 'hidden', marginBottom: 20, position: 'relative' }}>
                            <div style={{ padding: '16px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BrainCircuit size={16} color="#34d399" />
                                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Módulo Dinâmico IA</span>
                                    <button onClick={() => setAiModalOpen(true)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}><HelpCircle size={13} /></button>
                                </div>
                                <span style={{ fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>Chances Top 5</span>
                            </div>
                            <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {standings.map(s => {
                                    const chance = top5Chances[s.id] || 0;
                                    const color = chance > 80 ? '#34d399' : chance > 40 ? '#fbbf24' : '#f87171';
                                    return (
                                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color, flexShrink: 0, overflow: 'hidden' }}>
                                                {s.photo ? <img src={s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(s.name)}
                                            </div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', width: 100, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nickname || s.name}</div>
                                            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${chance}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease', boxShadow: `0 0 8px ${color}60` }} />
                                            </div>
                                            <span style={{ fontSize: 13, fontWeight: 800, color, width: 38, textAlign: 'right', flexShrink: 0 }}>{chance}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Matches */}
                    {isElimination ? (
                        // Bracket View for Elimination
                        <div style={{ display: 'flex', gap: 32, overflowX: 'auto', padding: '10px 10px 32px' }}>
                            {Object.entries(rounds).map(([roundNum, roundMatches]) => {
                                const totalRoundsCount = Object.keys(rounds).length;
                                const rn = parseInt(roundNum);
                                const roundLabel = rn === totalRoundsCount ? '🏆 Final' : rn === totalRoundsCount - 1 ? 'Semifinal' : rn === totalRoundsCount - 2 && totalRoundsCount > 3 ? 'Quartas de Final' : `Rodada ${roundNum}`;
                                const visibleMatches = roundMatches;
                                if (visibleMatches.length === 0) return null;

                                return (
                                    <div key={roundNum} style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 260 }}>
                                        <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', padding: '6px 16px', borderRadius: 99 }}>
                                                <Target size={14} color="#60a5fa" />
                                                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 1 }}>{roundLabel}</span>
                                            </div>
                                        </div>
                                        {visibleMatches.map(match => {
                                            const p1 = match.player1Id ? playersMap[match.player1Id] : null;
                                            const p2 = match.player2Id ? playersMap[match.player2Id] : null;
                                            const bothReady = match.player1Id && match.player2Id;
                                            const canPlay = bothReady && match.status !== 'completed' && !loading && isAdmin;
                                            const isByeMatch = (!match.player1Id || !match.player2Id) && match.status === 'completed';
                                            const isCompleted = match.status === 'completed';

                                            return (
                                                <div key={match.id} className="bracket-match-new" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.12)' : 'rgba(148,163,184,0.08)'}`, borderRadius: 16, overflow: 'hidden', padding: 12, position: 'relative', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', opacity: (!bothReady && !isByeMatch) ? 0.6 : 1 }}>
                                                    {/* Player 1 */}
                                                    <div onClick={() => canPlay && handleSetWinner(match, match.player1Id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, cursor: canPlay ? 'pointer' : 'default', background: match.winnerId === match.player1Id ? 'rgba(52,211,153,0.1)' : 'transparent', border: `1px solid ${match.winnerId === match.player1Id ? 'rgba(52,211,153,0.3)' : 'transparent'}`, transition: 'all 0.2s', opacity: (!match.player1Id && !isByeMatch) ? 0.4 : 1 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${match.winnerId === match.player1Id ? '#34d399' : 'rgba(148,163,184,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: match.winnerId === match.player1Id ? '#34d399' : '#64748b', overflow: 'hidden', flexShrink: 0 }}>
                                                            {p1?.photo ? <img src={p1.photo} alt={p1.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p1 ? getInitials(p1.name) : '?')}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: match.winnerId === match.player1Id ? '#34d399' : (isByeMatch && !match.player1Id) ? '#64748b' : '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                {p1?.name || (isByeMatch && !match.player1Id ? 'Avanço Direto (W.O.)' : (match.player1Id ? 'Jogador' : 'Aguardando...'))}
                                                                {match.winnerId === match.player1Id && <CheckCircle size={12} color="#34d399" />}
                                                            </div>
                                                            {p1?.nickname && <div style={{ fontSize: 11, color: '#475569' }}>{p1.nickname}</div>}
                                                        </div>
                                                    </div>

                                                    <div style={{ height: 1, background: 'rgba(148,163,184,0.05)', margin: '8px 0' }} />

                                                    {/* Player 2 */}
                                                    <div onClick={() => canPlay && handleSetWinner(match, match.player2Id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, cursor: canPlay ? 'pointer' : 'default', background: match.winnerId === match.player2Id ? 'rgba(52,211,153,0.1)' : 'transparent', border: `1px solid ${match.winnerId === match.player2Id ? 'rgba(52,211,153,0.3)' : 'transparent'}`, transition: 'all 0.2s', opacity: (!match.player2Id && !isByeMatch) ? 0.4 : 1 }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${match.winnerId === match.player2Id ? '#34d399' : 'rgba(148,163,184,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: match.winnerId === match.player2Id ? '#34d399' : '#64748b', overflow: 'hidden', flexShrink: 0 }}>
                                                            {p2?.photo ? <img src={p2.photo} alt={p2.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p2 ? getInitials(p2.name) : '?')}
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: 13, fontWeight: 700, color: match.winnerId === match.player2Id ? '#34d399' : (isByeMatch && !match.player2Id) ? '#64748b' : '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                {p2?.name || (isByeMatch && !match.player2Id ? 'Avanço Direto (W.O.)' : (match.player2Id ? 'Jogador' : 'Vencedor Prev.'))}
                                                                {match.winnerId === match.player2Id && <CheckCircle size={12} color="#34d399" />}
                                                            </div>
                                                            {p2?.nickname && <div style={{ fontSize: 11, color: '#475569' }}>{p2.nickname}</div>}
                                                        </div>
                                                    </div>

                                                    {/* Undo Btn */}
                                                    {isCompleted && bothReady && !isByeMatch && isAdmin && (
                                                        <div style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)' }}>
                                                            <button onClick={() => !loading && handleUndoResult(match)} disabled={loading} style={{ background: 'rgba(239,68,68,0.1)', border: 'none', color: '#f87171', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Desfazer">
                                                                <Undo2 size={14} />
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
                        // Grid View for Swiss & Round-Robin
                        Object.entries(rounds).map(([roundNum, roundMatches]) => (
                            <div key={roundNum} style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <Zap size={14} color="#60a5fa" />
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: '#60a5fa', letterSpacing: 3, textTransform: 'uppercase' }}>Rodada {roundNum}</span>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(96,165,250,0.1)', marginLeft: 4 }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                                    {roundMatches.map(match => {
                                        const p1 = playersMap[match.player1Id];
                                        const p2 = match.player2Id ? playersMap[match.player2Id] : null;
                                        const isCompleted = match.status === 'completed';
                                        const bothReady = match.player1Id && match.player2Id;
                                        const canClick = !loading && !isCompleted && bothReady && isAdmin;
                                        const isByeMatch = (!match.player1Id || !match.player2Id) && match.status === 'completed';

                                        return (
                                            <div key={match.id} style={{ background: isCompleted ? 'linear-gradient(135deg, rgba(52,211,153,0.05), rgba(15,20,32,0.98))' : 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.15)' : 'rgba(148,163,184,0.08)'}`, borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
                                                {/* Status pill */}
                                                <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${isCompleted ? 'rgba(52,211,153,0.1)' : 'rgba(148,163,184,0.05)'}` }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: isCompleted ? '#34d399' : '#fbbf24', boxShadow: `0 0 6px ${isCompleted ? '#34d399' : '#fbbf24'}` }} />
                                                    <span style={{ fontSize: 10, fontWeight: 700, color: isCompleted ? '#34d399' : '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.8 }}>{isCompleted ? 'Finalizado' : 'Aguardando'}</span>
                                                </div>
                                                {/* Players */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, padding: '16px 12px' }}>
                                                    {/* Player 1 */}
                                                    <div onClick={() => canClick && handleSetWinner(match, match.player1Id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 8px', borderRadius: 12, cursor: canClick ? 'pointer' : 'default', background: match.winnerId === match.player1Id ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${match.winnerId === match.player1Id ? 'rgba(52,211,153,0.3)' : 'rgba(148,163,184,0.06)'}`, transition: 'all 0.2s', opacity: (!match.player1Id && !isByeMatch) ? 0.4 : 1 }}>
                                                        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${match.winnerId === match.player1Id ? '#34d399' : 'rgba(148,163,184,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: match.winnerId === match.player1Id ? '#34d399' : '#64748b', overflow: 'hidden' }}>
                                                            {p1?.photo ? <img src={p1.photo} alt={p1.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p1 ? getInitials(p1.name) : '?')}
                                                        </div>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: match.winnerId === match.player1Id ? '#34d399' : (isByeMatch && !match.player1Id) ? '#64748b' : '#e2e8f0' }}>{p1?.name || (isByeMatch && !match.player1Id ? 'W.O.' : 'TBD')}</div>
                                                            {p1?.nickname && <div style={{ fontSize: 10, color: '#475569' }}>{p1.nickname}</div>}
                                                            {match.winnerId === match.player1Id && <div style={{ fontSize: 10, color: '#34d399', fontWeight: 800, marginTop: 2 }}>✓ VENCEDOR</div>}
                                                        </div>
                                                    </div>
                                                    {/* VS */}
                                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 900, color: '#334155', letterSpacing: 1 }}>VS</div>
                                                    {/* Player 2 */}
                                                    <div onClick={() => canClick && handleSetWinner(match, match.player2Id)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '10px 8px', borderRadius: 12, cursor: canClick ? 'pointer' : 'default', background: match.winnerId === match.player2Id ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.02)', border: `1px solid ${match.winnerId === match.player2Id ? 'rgba(52,211,153,0.3)' : 'rgba(148,163,184,0.06)'}`, transition: 'all 0.2s', opacity: (!match.player2Id && !isByeMatch) ? 0.4 : 1 }}>
                                                        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${match.winnerId === match.player2Id ? '#34d399' : 'rgba(148,163,184,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: match.winnerId === match.player2Id ? '#34d399' : '#64748b', overflow: 'hidden' }}>
                                                            {p2?.photo ? <img src={p2.photo} alt={p2.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (p2 ? getInitials(p2.name) : '?')}
                                                        </div>
                                                        <div style={{ textAlign: 'center' }}>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: match.winnerId === match.player2Id ? '#34d399' : (isByeMatch && !match.player2Id) ? '#64748b' : '#e2e8f0' }}>{p2?.name || (isByeMatch && !match.player2Id ? 'W.O.' : 'TBD')}</div>
                                                            {p2?.nickname && <div style={{ fontSize: 10, color: '#475569' }}>{p2.nickname}</div>}
                                                            {match.winnerId === match.player2Id && <div style={{ fontSize: 10, color: '#34d399', fontWeight: 800, marginTop: 2 }}>✓ VENCEDOR</div>}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Hint or Undo */}
                                                {!isCompleted && canClick && (
                                                    <div style={{ textAlign: 'center', padding: '0 12px 12px' }}>
                                                        <span style={{ fontSize: 10, color: '#334155', fontWeight: 500 }}>Clique no vencedor para registrar</span>
                                                    </div>
                                                )}
                                                {isCompleted && bothReady && !isByeMatch && isAdmin && (
                                                    <div style={{ borderTop: '1px solid rgba(148,163,184,0.05)' }}>
                                                        <button onClick={() => !loading && handleUndoResult(match)} disabled={loading} style={{ width: '100%', padding: '8px', background: 'none', border: 'none', color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                                                            <Undo2 size={12} /> Desfazer
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
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: 12 }}>
                            <div style={{ fontSize: 48 }}>⚔️</div>
                            <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: 16 }}>Sem confrontos ainda</div>
                            <div style={{ color: '#475569', fontSize: 13 }}>Crie uma seletiva para gerar os confrontos.</div>
                        </div>
                    )}
                </>
            )
            }

            {
                selectives.length === 0 && !loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '40vh', gap: 12 }}>
                        <div style={{ fontSize: 52 }}>🎱</div>
                        <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: 16 }}>Nenhuma seletiva criada</div>
                        <div style={{ color: '#475569', fontSize: 13 }}>Vá para "Nova Seletiva" para começar</div>
                    </div>
                )
            }

            {/* ── Modal Dupla Confirmação para Apagar ── */}
            {/* ── Delete Modal ── */}
            {deleteConfirmStep > 0 && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }} onClick={() => !loading && setDeleteConfirmStep(0)}>
                    <div style={{ background: 'linear-gradient(135deg, #1a2332, #111827)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 20, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontSize: 17, fontWeight: 700, margin: 0 }}>
                                <AlertTriangle size={20} /> Apagar Seletiva
                            </h3>
                            <button onClick={() => !loading && setDeleteConfirmStep(0)} disabled={loading} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><XCircle size={20} /></button>
                        </div>
                        {deleteConfirmStep === 1 && (
                            <div>
                                <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 14 }}>Tem certeza que deseja apagar a seletiva <strong style={{ color: '#f1f5f9' }}>"{activeSelective?.name}"</strong>?</p>
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: '#f87171', marginBottom: 20 }}>
                                    ⚠️ Esta ação irá remover <strong>{totalMatches} partidas</strong> e reverter todos os resultados do ranking.
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button onClick={() => !loading && setDeleteConfirmStep(0)} disabled={loading} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                                    <button onClick={() => !loading && setDeleteConfirmStep(2)} disabled={loading} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Sim, quero apagar</button>
                                </div>
                            </div>
                        )}
                        {deleteConfirmStep === 2 && (
                            <div>
                                <div style={{ textAlign: 'center', marginBottom: 16 }}><AlertTriangle size={48} color="#f87171" /></div>
                                <p style={{ fontSize: 15, fontWeight: 700, color: '#f87171', textAlign: 'center', marginBottom: 8 }}>ATENÇÃO: AÇÃO IRREVERSÍVEL!</p>
                                <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 }}>A seletiva "{activeSelective?.name}" e todas as {totalMatches} partidas serão apagadas permanentemente.</p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                                    <button onClick={() => !loading && setDeleteConfirmStep(0)} disabled={loading} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(255,255,255,0.04)', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                                    <button onClick={() => !loading && handleDeleteSelective()} disabled={loading} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                        {loading ? <Loader size={14} className="animate-spin" /> : '🗑️ CONFIRMAR EXCLUSÃO'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── AI Modal ── */}
            {aiModalOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)' }} onClick={() => setAiModalOpen(false)}>
                    <div style={{ background: 'linear-gradient(135deg, #1a2332, #111827)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 20, padding: 28, maxWidth: 440, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#34d399', fontSize: 17, fontWeight: 700, margin: 0 }}>
                                <BrainCircuit size={20} /> Como funciona a IA?
                            </h3>
                            <button onClick={() => setAiModalOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><XCircle size={20} /></button>
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
                            <p style={{ marginBottom: 16 }}>O <strong>Módulo Dinâmico de IA</strong> realiza previsões avançadas sobre as chances de cada jogador terminar a seletiva no <strong>Top 5</strong>.</p>
                            <div style={{ background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.1)', padding: 16, borderRadius: 12, marginBottom: 16 }}>
                                <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    <li>
                                        <div style={{ color: '#34d399', fontWeight: 600, marginBottom: 4 }}>🎲 Simulação de Monte Carlo</div>
                                        <div style={{ fontSize: 13, color: '#94a3b8' }}>A IA joga o restante do torneio <strong>{SIMULATION_COUNT} vezes</strong> em frações de segundo, testando todas as combinações possíveis de vitórias e derrotas para as partidas que ainda não aconteceram.</div>
                                    </li>
                                    <li>
                                        <div style={{ color: '#34d399', fontWeight: 600, marginBottom: 4 }}>📊 Probabilidade Real</div>
                                        <div style={{ fontSize: 13, color: '#94a3b8' }}>Se um jogador se classifica em {Math.floor(SIMULATION_COUNT / 2)} das {SIMULATION_COUNT} simulações, sua chance real matemática de classificação é calculada exatamente como 50%.</div>
                                    </li>
                                </ul>
                            </div>
                            <p style={{ fontSize: 13, color: '#64748b', textAlign: 'center' }}>Apenas estatística pura e direta, atualizada em tempo real.</p>
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
