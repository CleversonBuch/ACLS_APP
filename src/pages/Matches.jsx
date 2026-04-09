import React, { useState, useEffect } from 'react';
import { getPlayers, getSelectives, getMatchesBySelective, updateMatch, updateSelective, deleteSelective, createMatch, updatePlayer } from '../data/db.js';
import { applyMatchResult, reverseMatchResult, recalculateAllRankings, getHeadToHeadResult } from '../data/rankingEngine.js';
import { generateSwissRound } from '../data/tournamentEngine.js';
import { computeTop5Chances } from '../data/monteCarloEngine.js';
import { CheckCircle, X, XCircle, Undo2, Trash2, AlertTriangle, Loader, HelpCircle, Target, TrendingUp, Sparkles, BrainCircuit, Swords, Activity, Zap, Search, Flame, ArrowUp, ArrowDown, Minus, RefreshCw, Trophy, Crown, Medal, Star, Play } from 'lucide-react';
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
    const [searchPlayer, setSearchPlayer] = useState('');
    const [h2hModalPlayer, setH2hModalPlayer] = useState(null);
    const [recalculating, setRecalculating] = useState(false);

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
        try {
        const loserId = match.winnerId === match.player1Id ? match.player2Id : match.player1Id;

        // Reset match to pending FIRST so rebuildPlayerStats (inside reverseMatchResult) não conta esta partida
        await updateMatch(match.id, {
            winnerId: null,
            score1: null,
            score2: null,
            status: 'pending'
        });

        // Recalculate ALL player rankings from scratch (garante consistência total após undo)
        if (match.player1Id && match.player2Id) {
            await recalculateAllRankings();
        }

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

        } catch (err) {
            console.error('Erro ao desfazer resultado:', err);
        } finally {
            setRefresh(r => r + 1);
        }
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

    async function handleRecalculate() {
        if (recalculating) return;
        setRecalculating(true);
        try {
            await recalculateAllRankings();
        } catch (e) {
            console.error('Erro ao recalcular:', e);
        } finally {
            setRecalculating(false);
            setRefresh(r => r + 1);
        }
    }

    // Compute current consecutive win streak for a player within the current selective
    function computeWinStreak(playerId, completedMatchesSorted) {
        let streak = 0;
        for (let i = completedMatchesSorted.length - 1; i >= 0; i--) {
            const m = completedMatchesSorted[i];
            if (m.player1Id !== playerId && m.player2Id !== playerId) continue;
            if (m.winnerId === playerId) streak++;
            else break;
        }
        return streak;
    }

    // Compute previous-round standings to detect position changes
    function computePreviousStandings(playerIds, completedMatches, config) {
        if (!completedMatches || completedMatches.length === 0) return [];
        const ptsWin = config?.pointsPerWin ?? 3;
        const ptsLoss = config?.pointsPerLoss ?? 0;
        // Get the highest round that has been played
        const maxRound = Math.max(...completedMatches.map(m => m.round || 1));
        const prevMatches = completedMatches.filter(m => (m.round || 1) < maxRound);
        if (prevMatches.length === 0) return [];

        const map = {};
        playerIds.forEach(pid => { map[pid] = { id: pid, points: 0, wins: 0, losses: 0 }; });
        prevMatches.forEach(m => {
            if (map[m.winnerId]) { map[m.winnerId].points += ptsWin; map[m.winnerId].wins += 1; }
            const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
            if (loserId && map[loserId]) { map[loserId].points += ptsLoss; map[loserId].losses += 1; }
        });
        return Object.values(map).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
        });
    }

    // Get head-to-head record between two players (within current selective)
    function getH2HDetails(playerAId, playerBId, allMatches) {
        const h2hMatches = allMatches.filter(m =>
            m.status === 'completed' && m.winnerId &&
            ((m.player1Id === playerAId && m.player2Id === playerBId) ||
             (m.player1Id === playerBId && m.player2Id === playerAId))
        );
        let aWins = 0, bWins = 0;
        h2hMatches.forEach(m => {
            if (m.winnerId === playerAId) aWins++;
            else if (m.winnerId === playerBId) bWins++;
        });
        return { aWins, bWins, total: h2hMatches.length, matches: h2hMatches };
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

    // Filter matches by player search
    const searchTerm = searchPlayer.trim().toLowerCase();
    const filteredMatches = searchTerm ? matches.filter(m => {
        const p1 = m.player1Id ? playersMap[m.player1Id] : null;
        const p2 = m.player2Id ? playersMap[m.player2Id] : null;
        const n1 = (p1?.name || '').toLowerCase();
        const n2 = (p2?.name || '').toLowerCase();
        const k1 = (p1?.nickname || '').toLowerCase();
        const k2 = (p2?.nickname || '').toLowerCase();
        return n1.includes(searchTerm) || n2.includes(searchTerm) || k1.includes(searchTerm) || k2.includes(searchTerm);
    }) : matches;

    // Group matches by round
    const rounds = {};
    filteredMatches.forEach(m => {
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
            map[pid] = { id: pid, name: p?.name || '?', nickname: p?.nickname || '', photo: p?.photo || '', wins: 0, losses: 0, points: 0, sbScore: 0, streak: 0 };
        });
        const completedMatches = matches.filter(m => m.status === 'completed' && m.winnerId);

        // Sort completed matches chronologically by round/createdAt for streak calculation
        const sortedMatches = [...completedMatches].sort((a, b) => {
            const rA = a.round || 1;
            const rB = b.round || 1;
            if (rA !== rB) return rA - rB;
            const tA = new Date(a.createdAt || 0).getTime();
            const tB = new Date(b.createdAt || 0).getTime();
            return tA - tB;
        });

        // 1. Calculate standard points
        const config = activeSelective.config || {};
        const ptsWin = config.pointsPerWin ?? 3;
        const ptsLoss = config.pointsPerLoss ?? 0;
        completedMatches.forEach(m => {
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
        Object.values(map).forEach(player => {
            const wins = completedMatches.filter(m => m.winnerId === player.id);
            wins.forEach(w => {
                const loserId = w.player1Id === player.id ? w.player2Id : w.player1Id;
                if (loserId && map[loserId]) {
                    player.sbScore += map[loserId].points;
                }
            });
            // Compute current win streak
            player.streak = computeWinStreak(player.id, sortedMatches);
        });

        const sorted = Object.values(map).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const h2h = getHeadToHeadResult(a.id, b.id, completedMatches);
            if (h2h !== 0) return -h2h;
            if (b.sbScore !== a.sbScore) return b.sbScore - a.sbScore;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
        });

        // Compute previous-round positions for delta arrows
        const prev = computePreviousStandings(playerIds, completedMatches, config);
        const prevPosMap = {};
        prev.forEach((p, i) => { prevPosMap[p.id] = i; });
        sorted.forEach((s, i) => {
            const prevPos = prevPosMap[s.id];
            s.posChange = (prevPos !== undefined) ? (prevPos - i) : 0;
            s.hadPrevPos = prevPos !== undefined;
        });

        return sorted;
    })();

    // ── Compute AI Classification Chances (Monte Carlo Profissional) ──
    const top5Chances = computeTop5Chances(standings, matches, activeSelective);

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
                @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(1.2)}}
                @keyframes shimmer-ai{0%{background-position:-200% 0}100%{background-position:200% 0}}
                @keyframes float-orb{0%,100%{transform:translate(0,0)}50%{transform:translate(10px,-10px)}}
                .sel-tab:hover{background:rgba(52,211,153,0.08)!important;color:#e2e8f0!important;}
                .match-row-hover:hover{background:rgba(52,211,153,0.04)!important;transform:translateX(1px);}
                .match-row-hover{transition:all 0.18s ease!important;}
                .bracket-match-new:hover{border-color:rgba(52,211,153,0.3)!important;box-shadow:0 4px 20px rgba(0,0,0,0.3)!important;}
                .bracket-match-playable:hover{border-color:rgba(96,165,250,0.5)!important;box-shadow:0 6px 24px rgba(96,165,250,0.18)!important;}
                
                @media (max-width: 768px) {
                    .sel-standings-grid { grid-template-columns: 24px 1fr 28px 28px 28px 36px !important; padding: 10px 8px !important; gap: 4px !important; }
                    .hide-mob { display: none !important; }
                    .sel-header-wrap { flex-direction: column !important; align-items: flex-start !important; gap: 16px !important; }
                    .mob-text-sm { font-size: 11px !important; }
                    .mob-text-md { font-size: 14px !important; }
                    .ai-row { gap: 8px !important; padding: 7px 9px !important; }
                    .ai-row-pos { display: none !important; }
                    .ai-row-avatar { width: 26px !important; height: 26px !important; }
                    .ai-row-name { width: auto !important; flex: 1 1 0 !important; min-width: 0 !important; }
                    .ai-row-bar { display: none !important; }
                    .ai-row-chance { width: 42px !important; }
                    .ai-row-status { display: none !important; }
                    .ai-module-header { padding: 14px 16px 10px !important; }
                    .ai-module-rows { padding: 6px 12px 14px !important; }
                    .ai-module-footer { padding: 8px 14px 12px !important; }
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
                        <button onClick={handleRecalculate} disabled={recalculating || loading} title="Reprocessa pontos, ELO e estatísticas de todos os jogadores a partir das partidas concluídas" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(96,165,250,0.25)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: recalculating ? 'wait' : 'pointer', opacity: recalculating ? 0.7 : 1 }}>
                            <RefreshCw size={14} style={{ animation: recalculating ? 'spin 0.8s linear infinite' : 'none' }} /> {recalculating ? 'Recalculando…' : 'Recalcular'}
                        </button>
                    )}
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
                                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Classificação da Seletiva</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', padding: '2px 6px', borderRadius: 5, letterSpacing: 0.5, textTransform: 'uppercase' }}>apenas este torneio</span>
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
                                    <div key={s.id} onClick={() => setH2hModalPlayer(s)} className="match-row-hover sel-standings-grid" style={{ display: 'grid', gridTemplateColumns: '44px 1fr 44px 44px 44px 70px 64px', alignItems: 'center', padding: '10px 20px', borderBottom: `1px solid rgba(148,163,184,0.04)`, borderLeft: `3px solid ${rowColor}22`, background: isClassing ? `rgba(52,211,153,0.03)` : 'transparent', gap: 8, cursor: 'pointer' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: `${rowColor}15`, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13, color: rowColor, position: 'relative' }}>
                                            {i < 3 ? medalMap[i] : i + 1}
                                            {s.hadPrevPos && s.posChange !== 0 && (
                                                <span style={{ position: 'absolute', top: -4, right: -6, width: 14, height: 14, borderRadius: '50%', background: s.posChange > 0 ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 6px ${s.posChange > 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'}` }} title={s.posChange > 0 ? `Subiu ${s.posChange}` : `Caiu ${Math.abs(s.posChange)}`}>
                                                    {s.posChange > 0 ? <ArrowUp size={9} color="#fff" strokeWidth={3} /> : <ArrowDown size={9} color="#fff" strokeWidth={3} />}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `2px solid ${rowColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: rowColor, flexShrink: 0, overflow: 'hidden' }}>
                                                {s.photo ? <img src={s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(s.name)}
                                            </div>
                                            <div style={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                                                <div className="mob-text-sm" style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                                                    {s.streak >= 2 && (
                                                        <span title={`${s.streak} vitórias seguidas`} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, padding: '1px 5px', borderRadius: 6, background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.25)', flexShrink: 0 }}>
                                                            <Flame size={10} color="#fb923c" />
                                                            <span style={{ fontSize: 9, color: '#fb923c', fontWeight: 800 }}>{s.streak}</span>
                                                        </span>
                                                    )}
                                                </div>
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
                        <div style={{
                            background: 'radial-gradient(ellipse at top left, rgba(52,211,153,0.08), rgba(15,20,32,0.98) 60%)',
                            border: '1px solid rgba(52,211,153,0.2)',
                            borderRadius: 22, overflow: 'hidden', marginBottom: 20, position: 'relative',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 60px rgba(52,211,153,0.06)',
                        }}>
                            {/* Top accent line with shimmer */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%)', backgroundSize: '200% 100%', animation: 'shimmer-ai 4s linear infinite' }} />

                            {/* Glow orb */}
                            <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

                            {/* Header */}
                            <div className="ai-module-header" style={{ padding: '18px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', flexWrap: 'wrap', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.08))', border: '1px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(52,211,153,0.15)' }}>
                                        <BrainCircuit size={18} color="#34d399" />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: '#f1f5f9', letterSpacing: 0.3 }}>Módulo Dinâmico IA</span>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '2px 7px', borderRadius: 10, border: '1px solid rgba(52,211,153,0.25)' }}>
                                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399', animation: 'pulse 1.6s ease-in-out infinite' }} />
                                                LIVE
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>Monte Carlo · 5000 simulações</div>
                                    </div>
                                    <button onClick={() => setAiModalOpen(true)} title="Como funciona" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', cursor: 'pointer', padding: 5, borderRadius: 8, display: 'flex' }}>
                                        <HelpCircle size={13} />
                                    </button>
                                </div>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#34d399', background: 'rgba(52,211,153,0.08)', padding: '4px 12px', borderRadius: 20, fontWeight: 700, border: '1px solid rgba(52,211,153,0.2)' }}>
                                    <Trophy size={11} /> Chances Top 5
                                </span>
                            </div>

                            {/* Player rows */}
                            <div className="ai-module-rows" style={{ padding: '6px 18px 18px', display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
                                {standings.map((s, idx) => {
                                    const chance = top5Chances[s.id] || 0;
                                    const isLikely = chance >= 70;
                                    const isMaybe = chance >= 30 && chance < 70;
                                    const color = isLikely ? '#34d399' : isMaybe ? '#fbbf24' : chance > 0 ? '#f87171' : '#475569';
                                    const bgColor = isLikely ? 'rgba(52,211,153,0.06)' : isMaybe ? 'rgba(251,191,36,0.05)' : chance > 0 ? 'rgba(248,113,113,0.04)' : 'rgba(255,255,255,0.02)';
                                    const borderColor = isLikely ? 'rgba(52,211,153,0.18)' : isMaybe ? 'rgba(251,191,36,0.15)' : chance > 0 ? 'rgba(248,113,113,0.12)' : 'rgba(148,163,184,0.06)';
                                    return (
                                        <div key={s.id} className="ai-row" style={{
                                            display: 'flex', alignItems: 'center', gap: 12,
                                            padding: '8px 12px',
                                            background: bgColor,
                                            border: `1px solid ${borderColor}`,
                                            borderRadius: 12,
                                            transition: 'all 0.25s',
                                        }}
                                            onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; e.currentTarget.style.borderColor = `${color}40`; }}
                                            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = borderColor; }}
                                        >
                                            {/* Position */}
                                            <div className="ai-row-pos" style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 800, color: '#475569', width: 16, textAlign: 'center', flexShrink: 0 }}>
                                                {idx + 1}
                                            </div>

                                            {/* Avatar */}
                                            <div className="ai-row-avatar" style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: `1.5px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color, flexShrink: 0, overflow: 'hidden', boxShadow: chance >= 70 ? `0 0 12px ${color}30` : 'none' }}>
                                                {s.photo ? <img src={s.photo} alt={s.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : getInitials(s.name)}
                                            </div>

                                            {/* Name */}
                                            <div className="ai-row-name" style={{ width: 110, flexShrink: 0, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nickname || s.name?.split(' ')[0]}</div>
                                                <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{s.points}pts</div>
                                            </div>

                                            {/* Bar */}
                                            <div className="ai-row-bar" style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 99, overflow: 'hidden', position: 'relative', minWidth: 60 }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${Math.max(chance, 1)}%`,
                                                    background: `linear-gradient(90deg, ${color}aa, ${color})`,
                                                    borderRadius: 99,
                                                    transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    boxShadow: `0 0 10px ${color}80`,
                                                    position: 'relative',
                                                }}>
                                                    {/* Inner shine */}
                                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: `linear-gradient(180deg, rgba(255,255,255,0.18), transparent)`, borderRadius: '99px 99px 0 0' }} />
                                                </div>
                                            </div>

                                            {/* Chance % */}
                                            <div className="ai-row-chance" style={{ display: 'flex', alignItems: 'baseline', gap: 1, fontFamily: 'var(--font-display)', fontWeight: 900, width: 52, justifyContent: 'flex-end', flexShrink: 0 }}>
                                                <span style={{ fontSize: 18, color, lineHeight: 1, textShadow: chance >= 70 ? `0 0 12px ${color}80` : 'none' }}>{chance}</span>
                                                <span style={{ fontSize: 10, color: `${color}aa`, fontWeight: 700 }}>%</span>
                                            </div>

                                            {/* Status badge */}
                                            <div className="ai-row-status" style={{ width: 56, flexShrink: 0, textAlign: 'right' }}>
                                                {chance >= 90 ? (
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '2px 6px', borderRadius: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Garantido</span>
                                                ) : chance >= 70 ? (
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#34d399', background: 'rgba(52,211,153,0.08)', padding: '2px 6px', borderRadius: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Provável</span>
                                                ) : chance >= 30 ? (
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', padding: '2px 6px', borderRadius: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Disputa</span>
                                                ) : chance > 0 ? (
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,0.08)', padding: '2px 6px', borderRadius: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Difícil</span>
                                                ) : (
                                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#475569', background: 'rgba(148,163,184,0.06)', padding: '2px 6px', borderRadius: 6, letterSpacing: 0.4, textTransform: 'uppercase' }}>Fora</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer hint */}
                            <div className="ai-module-footer" style={{ padding: '0 22px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#475569', borderTop: '1px solid rgba(148,163,184,0.05)', paddingTop: 10, marginTop: 2 }}>
                                <Sparkles size={10} color="#34d399" />
                                <span>Atualizado a cada resultado · Considera força, momentum, qualidade das vitórias e desempates</span>
                            </div>
                        </div>
                    )}

                    {/* ── Final Summary (when selective is completed) ── */}
                    {activeSelective?.status === 'completed' && standings.length > 0 && (
                        (() => {
                            const champion = standings[0];
                            const runnerUp = standings[1];
                            const third = standings[2];
                            const mvp = [...standings].sort((a, b) => (b.wins || 0) - (a.wins || 0))[0];
                            const longestStreak = [...standings].sort((a, b) => (b.streak || 0) - (a.streak || 0))[0];
                            return (
                                <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.06), rgba(15,20,32,0.98))', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 20, overflow: 'hidden', marginBottom: 20, position: 'relative' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)' }} />
                                    <div style={{ padding: '18px 22px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Trophy size={18} color="#fbbf24" />
                                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: '#fbbf24', letterSpacing: 0.3 }}>Resumo Final</span>
                                        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '2px 10px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.8 }}>Encerrada</span>
                                    </div>
                                    <div style={{ padding: '12px 20px 22px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                        {champion && (
                                            <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.03))', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Crown size={28} color="#fbbf24" />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Campeão</div>
                                                    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{champion.name}</div>
                                                    <div style={{ fontSize: 11, color: '#fbbf24' }}>{champion.points} pts</div>
                                                </div>
                                            </div>
                                        )}
                                        {runnerUp && (
                                            <div style={{ background: 'rgba(148,163,184,0.05)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Medal size={26} color="#cbd5e1" />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Vice</div>
                                                    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{runnerUp.name}</div>
                                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{runnerUp.points} pts</div>
                                                </div>
                                            </div>
                                        )}
                                        {third && (
                                            <div style={{ background: 'rgba(180,83,9,0.06)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Medal size={26} color="#d97706" />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 9, color: '#d97706', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>3º Lugar</div>
                                                    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{third.name}</div>
                                                    <div style={{ fontSize: 11, color: '#d97706' }}>{third.points} pts</div>
                                                </div>
                                            </div>
                                        )}
                                        {mvp && mvp.wins > 0 && (
                                            <div style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Star size={26} color="#34d399" />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 9, color: '#34d399', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Mais Vitórias</div>
                                                    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mvp.name}</div>
                                                    <div style={{ fontSize: 11, color: '#34d399' }}>{mvp.wins} V</div>
                                                </div>
                                            </div>
                                        )}
                                        {longestStreak && longestStreak.streak >= 2 && (
                                            <div style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <Flame size={26} color="#fb923c" />
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 9, color: '#fb923c', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>Maior Sequência</div>
                                                    <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{longestStreak.name}</div>
                                                    <div style={{ fontSize: 11, color: '#fb923c' }}>{longestStreak.streak} seguidas</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    )}

                    {/* ── Next Match Highlight (admin only, active selective) ── */}
                    {activeSelective?.status === 'active' && isAdmin && (() => {
                        const nextMatch = matches.find(m => m.status !== 'completed' && m.player1Id && m.player2Id);
                        if (!nextMatch) return null;
                        const np1 = playersMap[nextMatch.player1Id];
                        const np2 = playersMap[nextMatch.player2Id];
                        return (
                            <div style={{ background: 'linear-gradient(135deg, rgba(96,165,250,0.08), rgba(15,20,32,0.98))', border: '1px solid rgba(96,165,250,0.25)', borderLeft: '3px solid #60a5fa', borderRadius: 18, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    <Play size={16} color="#60a5fa" fill="#60a5fa" />
                                    <div>
                                        <div style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', letterSpacing: 1.2, textTransform: 'uppercase' }}>Próxima Partida</div>
                                        <div style={{ fontSize: 11, color: '#64748b' }}>Rodada {nextMatch.round || 1}</div>
                                    </div>
                                </div>
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, minWidth: 200 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(96,165,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                            {np1?.photo ? <img src={np1.photo} alt={np1.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa' }}>{getInitials(np1?.name || '?')}</span>}
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{np1?.name || '?'}</span>
                                    </div>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: '#475569', letterSpacing: 1 }}>VS</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{np2?.name || '?'}</span>
                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(96,165,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                            {np2?.photo ? <img src={np2.photo} alt={np2.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa' }}>{getInitials(np2?.name || '?')}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Match search filter ── */}
                    {matches.length > 6 && (
                        <div style={{ marginBottom: 16, position: 'relative', maxWidth: 360 }}>
                            <Search size={14} color="#475569" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                value={searchPlayer}
                                onChange={e => setSearchPlayer(e.target.value)}
                                placeholder="Filtrar partidas por jogador…"
                                style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)', background: 'rgba(15,20,32,0.6)', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
                            />
                            {searchPlayer && (
                                <button onClick={() => setSearchPlayer('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(148,163,184,0.1)', border: 'none', borderRadius: 6, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94a3b8' }}>
                                    <XCircle size={12} />
                                </button>
                            )}
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

                                            const isPlayable = bothReady && !isCompleted && !isByeMatch;
                                            return (
                                                <div key={match.id} className={`bracket-match-new ${isPlayable ? 'bracket-match-playable' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', background: isCompleted ? 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(15,20,32,0.98))' : isPlayable ? 'linear-gradient(135deg, rgba(96,165,250,0.06), rgba(15,20,32,0.98))' : 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.25)' : isPlayable ? 'rgba(96,165,250,0.25)' : 'rgba(148,163,184,0.08)'}`, borderRadius: 16, overflow: 'hidden', padding: 12, position: 'relative', transition: 'all 0.2s', boxShadow: isCompleted ? '0 4px 16px rgba(52,211,153,0.08)' : isPlayable ? '0 4px 16px rgba(96,165,250,0.1)' : '0 4px 12px rgba(0,0,0,0.15)', opacity: (!bothReady && !isByeMatch) ? 0.55 : 1 }}>
                                                    {isPlayable && (
                                                        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 99, background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}>
                                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 6px #60a5fa', animation: 'pulse 1.6s ease-in-out infinite' }} />
                                                            <span style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', letterSpacing: 0.5, textTransform: 'uppercase' }}>Pronto</span>
                                                        </div>
                                                    )}
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

                                        const isPlayableSwiss = bothReady && !isCompleted && !isByeMatch;
                                        return (
                                            <div key={match.id} style={{ background: isCompleted ? 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(15,20,32,0.98))' : isPlayableSwiss ? 'linear-gradient(135deg, rgba(96,165,250,0.05), rgba(15,20,32,0.98))' : 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))', border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.22)' : isPlayableSwiss ? 'rgba(96,165,250,0.2)' : 'rgba(148,163,184,0.08)'}`, borderRadius: 16, overflow: 'hidden', position: 'relative', boxShadow: isCompleted ? '0 4px 14px rgba(52,211,153,0.06)' : isPlayableSwiss ? '0 4px 14px rgba(96,165,250,0.08)' : 'none', transition: 'all 0.2s' }}>
                                                {/* Status pill */}
                                                <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: `1px solid ${isCompleted ? 'rgba(52,211,153,0.1)' : isPlayableSwiss ? 'rgba(96,165,250,0.1)' : 'rgba(148,163,184,0.05)'}` }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: isCompleted ? '#34d399' : isPlayableSwiss ? '#60a5fa' : '#fbbf24', boxShadow: `0 0 6px ${isCompleted ? '#34d399' : isPlayableSwiss ? '#60a5fa' : '#fbbf24'}`, animation: isPlayableSwiss ? 'pulse 1.6s ease-in-out infinite' : 'none' }} />
                                                    <span style={{ fontSize: 10, fontWeight: 700, color: isCompleted ? '#34d399' : isPlayableSwiss ? '#60a5fa' : '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.8 }}>{isCompleted ? 'Finalizado' : isPlayableSwiss ? 'Pronto' : 'Aguardando'}</span>
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

                    {matches.length > 0 && filteredMatches.length === 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', gap: 8, background: 'rgba(15,20,32,0.5)', border: '1px dashed rgba(148,163,184,0.15)', borderRadius: 14 }}>
                            <Search size={28} color="#475569" />
                            <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: 14 }}>Nenhum confronto encontrado</div>
                            <div style={{ color: '#475569', fontSize: 12 }}>Tente outro nome ou apelido.</div>
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
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(10px)', padding: 16 }} onClick={() => setAiModalOpen(false)}>
                    <div style={{
                        background: 'radial-gradient(ellipse at top, rgba(52,211,153,0.08), #0f1420 70%)',
                        border: '1px solid rgba(52,211,153,0.25)',
                        borderRadius: 24, width: '100%', maxWidth: 540,
                        boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 100px rgba(52,211,153,0.08)',
                        maxHeight: '88vh', overflowY: 'auto', position: 'relative',
                        animation: 'fadeInUp 0.3s ease',
                    }} onClick={e => e.stopPropagation()}>
                        {/* Top accent shimmer */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #10b981, #34d399, #10b981, transparent)', backgroundSize: '200% 100%', animation: 'shimmer-ai 4s linear infinite', borderRadius: '24px 24px 0 0' }} />

                        {/* Header */}
                        <div style={{ padding: '24px 26px 18px', borderBottom: '1px solid rgba(148,163,184,0.06)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, rgba(52,211,153,0.25), rgba(16,185,129,0.08))', border: '1px solid rgba(52,211,153,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 28px rgba(52,211,153,0.2)', flexShrink: 0 }}>
                                <BrainCircuit size={26} color="#34d399" />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: 0.3 }}>
                                    Como funciona a IA?
                                </h3>
                                <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>Motor Monte Carlo · 5000 simulações</p>
                            </div>
                            <button onClick={() => setAiModalOpen(false)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.1)', color: '#94a3b8', cursor: 'pointer', padding: 6, borderRadius: 10, display: 'flex' }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '20px 26px 24px' }}>
                            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 18 }}>
                                A IA simula o restante do torneio milhares de vezes, calculando a chance de cada jogador terminar no <strong style={{ color: '#34d399' }}>Top 5</strong>. Não é "chute aleatório" — usa a força real de cada jogador, momentum, qualidade das vitórias e regras de desempate.
                            </p>

                            {/* Steps */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {[
                                    {
                                        icon: '🎲',
                                        title: '5000 Simulações Monte Carlo',
                                        desc: 'O torneio é jogado 5000 vezes em frações de segundo. Cada simulação respeita as forças individuais, regras de desempate e gera um ranking final.',
                                        color: '#34d399', border: 'rgba(52,211,153,0.2)', bg: 'rgba(52,211,153,0.05)'
                                    },
                                    {
                                        icon: '📐',
                                        title: 'Força com Laplace Smoothing',
                                        desc: <>Calculada como <code style={{ background: 'rgba(96,165,250,0.1)', padding: '2px 7px', borderRadius: 5, fontSize: 12, color: '#60a5fa', fontFamily: 'monospace' }}>(V+1)/(J+2)</code>, evita distorções para quem jogou poucos jogos. Quem ganhou 2 de 2 jogos não vira "100% imbatível".</>,
                                        color: '#60a5fa', border: 'rgba(96,165,250,0.2)', bg: 'rgba(96,165,250,0.05)'
                                    },
                                    {
                                        icon: '🎯',
                                        title: 'Calibração Anti-Superconfiança',
                                        desc: 'Probabilidades são suavizadas pra evitar valores irreais. No início do torneio há mais incerteza; quanto mais jogos completos, mais precisas ficam as previsões.',
                                        color: '#fbbf24', border: 'rgba(251,191,36,0.2)', bg: 'rgba(251,191,36,0.05)'
                                    },
                                    {
                                        icon: '⚡',
                                        title: 'Momentum e Qualidade',
                                        desc: 'Jogadores em sequência de vitórias ganham bônus de força. Vencer adversários fortes vale mais que vencer fracos — a IA pesa essa qualidade.',
                                        color: '#a78bfa', border: 'rgba(167,139,250,0.2)', bg: 'rgba(167,139,250,0.05)'
                                    },
                                    {
                                        icon: '🧮',
                                        title: 'Desempates Corretos',
                                        desc: 'A simulação respeita pontos → vitórias → derrotas, igual à classificação real. Não decide só por pontos.',
                                        color: '#22d3ee', border: 'rgba(34,211,238,0.2)', bg: 'rgba(34,211,238,0.05)'
                                    },
                                    {
                                        icon: '🛡️',
                                        title: 'Verificação Matemática',
                                        desc: <>Quando um jogador <strong>ainda pode</strong> matematicamente classificar (vencendo todos os jogos restantes), a IA mostra pelo menos <strong style={{ color: '#34d399' }}>1%</strong> — distinguindo "improvável" de "impossível".</>,
                                        color: '#fb923c', border: 'rgba(251,146,60,0.2)', bg: 'rgba(251,146,60,0.05)'
                                    },
                                ].map((step, i) => (
                                    <div key={i} style={{
                                        background: step.bg,
                                        border: `1px solid ${step.border}`,
                                        borderRadius: 12,
                                        padding: '12px 14px',
                                        display: 'flex', gap: 12,
                                        transition: 'all 0.2s',
                                    }}
                                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; e.currentTarget.style.borderColor = step.color + '55'; }}
                                        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = step.border; }}
                                    >
                                        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${step.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0, border: `1px solid ${step.color}25` }}>
                                            {step.icon}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: step.color, marginBottom: 3 }}>
                                                {step.title}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
                                                {step.desc}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Color legend */}
                            <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(148,163,184,0.08)' }}>
                                <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Como interpretar</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {[
                                        { label: 'Garantido', range: '90%+', color: '#34d399' },
                                        { label: 'Provável', range: '70-89%', color: '#34d399' },
                                        { label: 'Disputa', range: '30-69%', color: '#fbbf24' },
                                        { label: 'Difícil', range: '1-29%', color: '#f87171' },
                                        { label: 'Fora', range: '0%', color: '#475569' },
                                    ].map(l => (
                                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 8, background: `${l.color}10`, border: `1px solid ${l.color}20` }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.color, boxShadow: `0 0 5px ${l.color}` }} />
                                            <span style={{ fontSize: 10, fontWeight: 700, color: l.color }}>{l.label}</span>
                                            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>{l.range}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Footer */}
                            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Sparkles size={13} color="#34d399" />
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>Atualizado automaticamente a cada resultado registrado</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Head-to-Head Modal ── */}
            {h2hModalPlayer && (() => {
                const opponents = standings.filter(s => s.id !== h2hModalPlayer.id);
                const completedMatches = matches.filter(m => m.status === 'completed' && m.winnerId);
                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(8px)', padding: 16 }} onClick={() => setH2hModalPlayer(null)}>
                        <div style={{ background: 'linear-gradient(135deg, #1a2332, #111827)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 20, padding: 24, maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(96,165,250,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                    {h2hModalPlayer.photo ? <img src={h2hModalPlayer.photo} alt={h2hModalPlayer.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 16, fontWeight: 800, color: '#60a5fa' }}>{getInitials(h2hModalPlayer.name)}</span>}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>{h2hModalPlayer.name}</div>
                                    <div style={{ fontSize: 12, color: '#60a5fa' }}>{h2hModalPlayer.wins}V · {h2hModalPlayer.losses}D · {h2hModalPlayer.points}pts</div>
                                </div>
                                <button onClick={() => setH2hModalPlayer(null)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><XCircle size={20} /></button>
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Confrontos diretos</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {opponents.map(op => {
                                    const h2h = getH2HDetails(h2hModalPlayer.id, op.id, completedMatches);
                                    if (h2h.total === 0) return (
                                        <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.02)', opacity: 0.5 }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {op.photo ? <img src={op.photo} alt={op.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{getInitials(op.name)}</span>}
                                            </div>
                                            <span style={{ flex: 1, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.name}</span>
                                            <span style={{ fontSize: 10, color: '#475569', fontStyle: 'italic' }}>sem partidas</span>
                                        </div>
                                    );
                                    const winning = h2h.aWins > h2h.bWins;
                                    const tied = h2h.aWins === h2h.bWins;
                                    return (
                                        <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: winning ? 'rgba(52,211,153,0.06)' : tied ? 'rgba(148,163,184,0.05)' : 'rgba(239,68,68,0.06)', border: `1px solid ${winning ? 'rgba(52,211,153,0.18)' : tied ? 'rgba(148,163,184,0.12)' : 'rgba(239,68,68,0.18)'}` }}>
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {op.photo ? <img src={op.photo} alt={op.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{getInitials(op.name)}</span>}
                                            </div>
                                            <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{op.name}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>
                                                <span style={{ color: '#34d399' }}>{h2h.aWins}</span>
                                                <span style={{ color: '#475569', fontSize: 11 }}>×</span>
                                                <span style={{ color: '#f87171' }}>{h2h.bWins}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p style={{ marginTop: 14, fontSize: 11, color: '#475569', textAlign: 'center' }}>Apenas confrontos desta seletiva</p>
                        </div>
                    </div>
                );
            })()}

            <TiebreakerHelpModal
                isOpen={helpModalOpen}
                onClose={() => setHelpModalOpen(false)}
                isElo={false}
            />
        </div >
    );
}
