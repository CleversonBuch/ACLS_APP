import React, { useState, useEffect } from 'react';
import { getSelectives, getPlayer, getPlayers, updateSelective, deleteSelective, updatePlayer } from '../data/db.js';
import { applyFixedPoints } from '../data/rankingEngine.js';
import { CheckCircle, XCircle, Undo2, Trash2, AlertTriangle, Swords, Shield, Loader } from 'lucide-react';

export default function Etapas() {
    const [selectives, setSelectives] = useState([]);
    const [activeSelectiveId, setActiveSelectiveId] = useState(null);
    const [playersMap, setPlayersMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [refresh, setRefresh] = useState(0);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState(0);
    // Etapa 5x5 wizard state
    const [wizardStep, setWizardStep] = useState(0); // 0=hidden, 1=pick players, 2=team name, 3=assign opponents
    const [wizardData, setWizardData] = useState({ selectedPlayers: [], opponentTeam: '', opponents: ['', '', '', '', ''] });
    const [allPlayersArray, setAllPlayersArray] = useState([]);

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
            setAllPlayersArray(allPlayers);

            const etapas = allSelectives.filter(s => s.eventType === 'etapa');
            setSelectives(etapas);

            let currentId = activeSelectiveId;
            if (!currentId && etapas.length > 0) {
                const active = etapas.find(s => s.status === 'active') || etapas[etapas.length - 1];
                currentId = active.id;
                setActiveSelectiveId(currentId);
            }
            setLoading(false);
        }
        loadData();
    }, [refresh, activeSelectiveId]);

    async function handleCompleteSelective() {
        if (!activeSelectiveId) return;
        setLoading(true);
        await updateSelective(activeSelectiveId, { status: 'completed' });
        setRefresh(r => r + 1);
    }

    async function handleDeleteSelective() {
        if (!activeSelectiveId) return;
        setLoading(true);
        await deleteSelective(activeSelectiveId);
        setActiveSelectiveId(null);
        setDeleteConfirmStep(0);
        setRefresh(r => r + 1);
    }

    const activeSelective = selectives.find(s => s.id === activeSelectiveId);

    let workingConfronts = activeSelective?.teamConfronts || [];
    // Backward compatibility
    if (workingConfronts.length === 0 && activeSelective?.teamConfront) {
        workingConfronts = [activeSelective.teamConfront];
    }

    let totalWins = 0;
    let totalLosses = 0;

    const mappedConfronts = workingConfronts.map(c => {
        const slots = c.slots || [];
        const ourWins = slots.filter(s => s.result === 'win').length;
        const theirWins = slots.filter(s => s.result === 'loss').length;
        const isFinished = ourWins >= 3 || theirWins >= 3;
        const isVictory = ourWins >= 3;

        if (isFinished) {
            if (isVictory) totalWins++;
            else totalLosses++;
        }

        return { ...c, ourWins, theirWins, isFinished, isVictory, slots };
    });

    const isEliminated = totalLosses >= 2;
    const isActive = activeSelective?.status === 'active';
    const hasActiveConfront = mappedConfronts.some(c => !c.isFinished);
    const canComplete = isEliminated;

    if (loading && Object.keys(playersMap).length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-dim)' }}>
                <Loader className="animate-spin" size={32} style={{ marginBottom: 16 }} />
                <p>Carregando chaves da etapa...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Etapas</h1>
                    <p className="page-subtitle">Gerenciar confrontos 5x5 contra outras equipes</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {activeSelective && (
                        <button className="btn btn-danger btn-sm" onClick={() => !loading && setDeleteConfirmStep(1)} disabled={loading}>
                            <Trash2 size={16} /> Apagar Etapa
                        </button>
                    )}
                    {isActive && canComplete && (
                        <button className="btn btn-gold" onClick={() => !loading && handleCompleteSelective()} disabled={loading}>
                            <CheckCircle size={18} /> Finalizar Etapa
                        </button>
                    )}
                </div>
            </div>

            {/* Etapa Selector */}
            {selectives.length > 0 && (
                <div className="season-tabs" style={{ marginBottom: 20 }}>
                    {selectives.map(s => (
                        <button
                            key={s.id}
                            className={`season-tab ${activeSelectiveId === s.id ? 'active' : ''}`}
                            onClick={() => !loading && setActiveSelectiveId(s.id)}
                            disabled={loading}
                        >
                            🏆 {s.name} {s.status === 'completed' ? '✅' : '🔵'}
                        </button>
                    ))}
                </div>
            )}

            {activeSelective && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
                    {/* ETAPA SUMMARY HEADER */}
                    {(workingConfronts.length > 0 || wizardStep > 0) && (
                        <div className="card" style={{
                            padding: 24, textAlign: 'center',
                            background: isEliminated ? 'rgba(239,68,68,0.05)' : 'var(--bg-elevated)',
                            border: isEliminated ? '2px solid rgba(239,68,68,0.3)' : '1px solid var(--border-subtle)'
                        }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '0 0 16px', color: isEliminated ? 'var(--red-400)' : 'var(--text-primary)' }}>
                                {isEliminated ? '🚨 EQUIPE ELIMINADA' : 'Desempenho da Equipe'}
                            </h2>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--green-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Vitórias</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 900, color: 'var(--green-400)', lineHeight: 1 }}>{totalWins}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, color: 'var(--red-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Derrotas</div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 900, color: 'var(--red-400)', lineHeight: 1 }}>{totalLosses} <span style={{ fontSize: 20, color: 'var(--text-dim)', fontWeight: 500 }}>/ 2</span></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* LIST OF CONFRONTATIONS */}
                    {mappedConfronts.map((tc, tcIdx) => {
                        const { ourWins, theirWins, isFinished, isVictory, slots, opponentTeam } = tc;
                        return (
                            <div key={tcIdx} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                {/* Scoreboard header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    padding: '20px 16px',
                                    background: isFinished
                                        ? (isVictory ? 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))' : 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))')
                                        : 'linear-gradient(135deg, var(--bg-elevated), var(--bg-card))'
                                }}>
                                    <div style={{ textAlign: 'center', flex: 1 }}>
                                        <div style={{ fontSize: 12, color: 'var(--green-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>ACLS</div>
                                        <div style={{
                                            fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 900,
                                            color: isVictory ? 'var(--green-400)' : 'var(--text-primary)', lineHeight: 1
                                        }}>{ourWins}</div>
                                    </div>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: '50%',
                                        background: 'var(--bg-card)', border: '2px solid var(--border-default)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'var(--text-dim)', fontSize: 14, fontWeight: 300, flexShrink: 0
                                    }}>×</div>
                                    <div style={{ textAlign: 'center', flex: 1 }}>
                                        <div style={{ fontSize: 12, color: 'var(--red-400)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>{opponentTeam}</div>
                                        <div style={{
                                            fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 900,
                                            color: (isFinished && !isVictory) ? 'var(--red-400)' : 'var(--text-primary)', lineHeight: 1
                                        }}>{theirWins}</div>
                                    </div>
                                </div>

                                {/* Match result banner */}
                                {isFinished && (
                                    <div style={{
                                        textAlign: 'center', padding: '14px 16px',
                                        background: isVictory ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                                        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18,
                                        color: isVictory ? 'var(--green-400)' : 'var(--red-400)'
                                    }}>
                                        {isVictory ? '🏆 VITÓRIA DA EQUIPE!' : '😔 DERROTA DA EQUIPE'}
                                    </div>
                                )}

                                {/* 5 match slots */}
                                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {slots.map((slot, idx) => {
                                        const player = playersMap[slot.playerId];
                                        const isDone = slot.result != null;
                                        const isWin = slot.result === 'win';
                                        return (
                                            <div key={idx} style={{
                                                borderRadius: 14, overflow: 'hidden',
                                                border: isDone ? `2px solid ${isWin ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` : '2px solid var(--border-subtle)',
                                                background: isDone ? (isWin ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)') : 'var(--bg-elevated)'
                                            }}>
                                                {/* Names row */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 8,
                                                    padding: '10px 14px'
                                                }}>
                                                    <div style={{
                                                        width: 26, height: 26, borderRadius: '50%',
                                                        background: isDone ? (isWin ? 'var(--green-400)' : 'var(--red-400)') : 'var(--bg-card)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12,
                                                        color: isDone ? '#fff' : 'var(--text-muted)', flexShrink: 0
                                                    }}>{idx + 1}</div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {player?.name || '?'}
                                                        </div>
                                                    </div>
                                                    <div style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>VS</div>
                                                    <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
                                                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {slot.opponentName}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Big action buttons */}
                                                {!isDone && isActive && !isFinished ? (
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                                                        <button
                                                            disabled={loading}
                                                            onClick={async () => {
                                                                setLoading(true);
                                                                const newSlots = [...slots];
                                                                newSlots[idx] = { ...newSlots[idx], result: 'win' };
                                                                const newTeamConfronts = [...workingConfronts];
                                                                newTeamConfronts[tcIdx] = { ...tc, slots: newSlots };
                                                                await updateSelective(activeSelectiveId, { teamConfronts: newTeamConfronts });

                                                                const config = activeSelective?.config || {};
                                                                await applyFixedPoints(slot.playerId, null, config);
                                                                setRefresh(r => r + 1);
                                                            }}
                                                            style={{
                                                                padding: '14px 0', border: 'none', cursor: 'pointer',
                                                                background: 'rgba(16,185,129,0.12)', color: 'var(--green-400)',
                                                                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
                                                                borderRight: '1px solid var(--border-subtle)',
                                                                borderTop: '1px solid var(--border-subtle)'
                                                            }}
                                                        >
                                                            ✅ VITÓRIA
                                                        </button>
                                                        <button
                                                            disabled={loading}
                                                            onClick={async () => {
                                                                setLoading(true);
                                                                const newSlots = [...slots];
                                                                newSlots[idx] = { ...newSlots[idx], result: 'loss' };
                                                                const newTeamConfronts = [...workingConfronts];
                                                                newTeamConfronts[tcIdx] = { ...tc, slots: newSlots };
                                                                await updateSelective(activeSelectiveId, { teamConfronts: newTeamConfronts });

                                                                const p = playersMap[slot.playerId];
                                                                if (p) {
                                                                    const config = activeSelective?.config || {};
                                                                    await updatePlayer(slot.playerId, {
                                                                        losses: (p.losses || 0) + 1,
                                                                        points: (p.points || 0) + (config.pointsPerLoss ?? 0),
                                                                        streak: 0
                                                                    });
                                                                }
                                                                setRefresh(r => r + 1);
                                                            }}
                                                            style={{
                                                                padding: '14px 0', border: 'none', cursor: 'pointer',
                                                                background: 'rgba(239,68,68,0.12)', color: 'var(--red-400)',
                                                                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
                                                                borderTop: '1px solid var(--border-subtle)'
                                                            }}
                                                        >
                                                            ❌ DERROTA
                                                        </button>
                                                    </div>
                                                ) : isDone ? (
                                                    <div style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                                        padding: '10px 14px', borderTop: '1px solid var(--border-subtle)',
                                                        background: isWin ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'
                                                    }}>
                                                        <span style={{
                                                            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14,
                                                            color: isWin ? 'var(--green-400)' : 'var(--red-400)'
                                                        }}>
                                                            {isWin ? '✅ VITÓRIA' : '❌ DERROTA'}
                                                        </span>
                                                        {isActive && (
                                                            <button
                                                                disabled={loading}
                                                                onClick={async () => {
                                                                    setLoading(true);
                                                                    const p = playersMap[slot.playerId];
                                                                    if (p) {
                                                                        const config = activeSelective?.config || {};
                                                                        if (isWin) {
                                                                            await updatePlayer(slot.playerId, {
                                                                                wins: Math.max(0, (p.wins || 0) - 1),
                                                                                points: Math.max(0, (p.points || 0) - (config.pointsPerWin ?? 3)),
                                                                                streak: 0
                                                                            });
                                                                        } else {
                                                                            await updatePlayer(slot.playerId, {
                                                                                losses: Math.max(0, (p.losses || 0) - 1),
                                                                                points: Math.max(0, (p.points || 0) - (config.pointsPerLoss ?? 0))
                                                                            });
                                                                        }
                                                                    }
                                                                    const newSlots = [...slots];
                                                                    newSlots[idx] = { ...newSlots[idx], result: null };
                                                                    const newTeamConfronts = [...workingConfronts];
                                                                    newTeamConfronts[tcIdx] = { ...tc, slots: newSlots };
                                                                    await updateSelective(activeSelectiveId, { teamConfronts: newTeamConfronts });

                                                                    setRefresh(r => r + 1);
                                                                }}
                                                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}
                                                            >
                                                                <Undo2 size={14} /> Desfazer
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* ── WIZARD OR NEW CONFRONT BUTTON ── */}
                    {isActive && !isEliminated && wizardStep === 0 && (
                        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                            <Swords size={40} style={{ color: 'var(--gold-400)', marginBottom: 12 }} />
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 8 }}>Novo Confronto</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>Adicione mais uma equipe adversária à etapa</p>
                            <button className="btn btn-gold" onClick={() => { setWizardStep(1); setWizardData({ selectedPlayers: [], opponentTeam: '', opponents: ['', '', '', '', ''] }); }} disabled={loading}>
                                <Shield size={16} /> Iniciar Configuração
                            </button>
                        </div>
                    )}

                    {/* STEP 1: Select 5 players */}
                    {wizardStep === 1 && (
                        <div className="card">
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: 'var(--gold-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Passo 1 de 3</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Selecione 5 Jogadores</h3>
                                <div style={{
                                    width: 40, height: 4, borderRadius: 2, margin: '10px auto 0',
                                    background: 'linear-gradient(90deg, var(--gold-400) 33%, var(--bg-elevated) 33%)'
                                }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {allPlayersArray.map(player => {
                                    const pid = player.id;
                                    const p = player;
                                    const selected = wizardData.selectedPlayers.includes(pid);
                                    const isFull = wizardData.selectedPlayers.length >= 5 && !selected;
                                    return (
                                        <div
                                            key={pid}
                                            onClick={() => {
                                                if (isFull) return;
                                                const newSel = selected
                                                    ? wizardData.selectedPlayers.filter(id => id !== pid)
                                                    : [...wizardData.selectedPlayers, pid];
                                                setWizardData({ ...wizardData, selectedPlayers: newSel });
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '12px 16px', borderRadius: 12,
                                                background: selected ? 'rgba(16,185,129,0.1)' : 'var(--bg-elevated)',
                                                border: `2px solid ${selected ? 'var(--green-400)' : 'transparent'}`,
                                                cursor: isFull ? 'not-allowed' : 'pointer',
                                                opacity: isFull ? 0.4 : 1,
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <div style={{
                                                width: 24, height: 24, borderRadius: 6,
                                                border: `2px solid ${selected ? 'var(--green-400)' : 'var(--border-default)'}`,
                                                background: selected ? 'var(--green-400)' : 'transparent',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0, transition: 'all 0.15s'
                                            }}>
                                                {selected && <CheckCircle size={14} style={{ color: '#fff' }} />}
                                            </div>
                                            <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                                                {p?.name || pid}
                                            </div>
                                            {selected && (
                                                <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--green-400)', fontWeight: 700 }}>
                                                    #{wizardData.selectedPlayers.indexOf(pid) + 1}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(0)}>Cancelar</button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 13, color: wizardData.selectedPlayers.length === 5 ? 'var(--green-400)' : 'var(--text-muted)' }}>
                                        {wizardData.selectedPlayers.length}/5
                                    </span>
                                    <button
                                        className="btn btn-gold"
                                        disabled={wizardData.selectedPlayers.length !== 5}
                                        onClick={() => setWizardStep(2)}
                                        style={{ opacity: wizardData.selectedPlayers.length === 5 ? 1 : 0.4 }}
                                    >
                                        Próximo →
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: Opponent team name */}
                    {wizardStep === 2 && (
                        <div className="card">
                            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                                <div style={{ fontSize: 11, color: 'var(--gold-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Passo 2 de 3</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Equipe Adversária</h3>
                                <div style={{
                                    width: 40, height: 4, borderRadius: 2, margin: '10px auto 0',
                                    background: 'linear-gradient(90deg, var(--gold-400) 66%, var(--bg-elevated) 66%)'
                                }} />
                            </div>
                            <div style={{ maxWidth: 320, margin: '0 auto' }}>
                                <input
                                    className="form-input"
                                    value={wizardData.opponentTeam}
                                    onChange={e => setWizardData({ ...wizardData, opponentTeam: e.target.value })}
                                    placeholder="Ex: Equipe Tigres"
                                    style={{ textAlign: 'center', fontSize: 16, marginBottom: 16 }}
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(1)}>← Voltar</button>
                                <button
                                    className="btn btn-gold"
                                    disabled={!wizardData.opponentTeam.trim()}
                                    onClick={() => setWizardStep(3)}
                                    style={{ opacity: wizardData.opponentTeam.trim() ? 1 : 0.4 }}
                                >
                                    Próximo →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Assign opponent names */}
                    {wizardStep === 3 && (
                        <div className="card">
                            <div style={{ textAlign: 'center', marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: 'var(--gold-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Passo 3 de 3</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Definir Confrontos individuais</h3>
                                <div style={{
                                    width: 40, height: 4, borderRadius: 2, margin: '10px auto 0',
                                    background: 'var(--gold-400)'
                                }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {wizardData.selectedPlayers.map((pid, idx) => {
                                    const p = playersMap[pid];
                                    return (
                                        <div key={pid} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '10px 14px', borderRadius: 12, background: 'var(--bg-elevated)'
                                        }}>
                                            <div style={{
                                                width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-card)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                                                color: 'var(--gold-400)', flexShrink: 0
                                            }}>{idx + 1}</div>
                                            <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                                                {p?.name || pid}
                                            </div>
                                            <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>vs</div>
                                            <input
                                                className="form-input"
                                                value={wizardData.opponents[idx]}
                                                onChange={e => {
                                                    const newOpp = [...wizardData.opponents];
                                                    newOpp[idx] = e.target.value;
                                                    setWizardData({ ...wizardData, opponents: newOpp });
                                                }}
                                                placeholder="Nome adversário"
                                                style={{ flex: 1, fontSize: 13, padding: '6px 10px', height: 32 }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                                <button className="btn btn-secondary" onClick={() => setWizardStep(2)}>← Voltar</button>
                                <button
                                    className="btn btn-gold"
                                    disabled={loading}
                                    onClick={async () => {
                                        setLoading(true);
                                        const newSlots = wizardData.selectedPlayers.map((pid, i) => ({
                                            playerId: pid,
                                            opponentName: wizardData.opponents[i] || `Jogador ${i + 1}`,
                                            result: null
                                        }));

                                        const newConfront = { opponentTeam: wizardData.opponentTeam.trim(), slots: newSlots };
                                        const newTeamConfronts = [...workingConfronts, newConfront];

                                        await updateSelective(activeSelectiveId, { teamConfronts: newTeamConfronts });
                                        setWizardStep(0);
                                        setRefresh(r => r + 1);
                                    }}
                                >
                                    ⚔️ Gerar Confrontos
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectives.length === 0 && !loading && (
                <div className="empty-state">
                    <div className="empty-state-icon">🏆</div>
                    <div className="empty-state-title">Nenhuma etapa oficial iniciada</div>
                    <div className="empty-state-desc">Vá para o painel de criação para configurar</div>
                </div>
            )}

            {/* ── Modal Dupla Confirmação para Apagar ── */}
            {deleteConfirmStep > 0 && (
                <div className="modal-overlay" onClick={() => !loading && setDeleteConfirmStep(0)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red-400)' }}>
                                <AlertTriangle size={20} /> Apagar Etapa
                            </h3>
                            <button className="modal-close" onClick={() => !loading && setDeleteConfirmStep(0)} disabled={loading}>
                                <XCircle size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {deleteConfirmStep === 1 && (
                                <div>
                                    <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--text-secondary)' }}>
                                        Tem certeza que deseja apagar a etapa <strong style={{ color: 'var(--text-primary)' }}>"{activeSelective?.name}"</strong>?
                                    </p>
                                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--red-400)' }}>
                                        ⚠️ Esta ação reverterá todos os resultados individuais de ranking obtidos nos confrontos desta etapa.
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
                                        A etapa será apagada e as exclusões de ranking se tornarão permanentes.
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
            )}
        </div>
    );
}
