import React, { useState, useEffect } from 'react';
import { createSelective, getSelectives, getPlayers } from '../data/db.js';
import { useNavigate } from 'react-router-dom';
import {
    Zap, Check, Swords, Shield, Trophy, Calendar, MapPin, FileText,
    Sparkles, ArrowRight, Loader, Users, Activity, ChevronRight, Crown
} from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext.jsx';

function getInitials(name) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function CreateEtapa() {
    const { isAdmin } = useAdmin();
    const navigate = useNavigate();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [scheduledDate, setScheduledDate] = useState('');
    const [pointsPerWin, setPointsPerWin] = useState(3);
    const [pointsPerLoss, setPointsPerLoss] = useState(0);

    const [created, setCreated] = useState(false);
    const [creating, setCreating] = useState(false);
    const [pastEtapas, setPastEtapas] = useState([]);
    const [playerCount, setPlayerCount] = useState(0);

    useEffect(() => {
        async function init() {
            const [selectives, players] = await Promise.all([getSelectives(), getPlayers()]);
            const etapas = selectives.filter(s => s.eventType === 'etapa');
            setPastEtapas(etapas);
            setPlayerCount(players.length);
            const count = etapas.length + 1;
            setName(`Etapa #${count}`);
        }
        init();
    }, []);

    const stats = {
        total: pastEtapas.length,
        ativas: pastEtapas.filter(e => e.status === 'active').length,
        finalizadas: pastEtapas.filter(e => e.status === 'completed').length,
        campeas: pastEtapas.filter(e => e.teamStatus === 'champion').length,
    };

    async function handleGenerate() {
        if (!name.trim()) {
            alert('Dê um nome à Etapa!');
            return;
        }
        setCreating(true);
        await createSelective({
            name: name.trim(),
            mode: 'team-vs-team',
            eventType: 'etapa',
            playerIds: [],
            config: {
                pointsPerWin: parseInt(pointsPerWin) || 3,
                pointsPerLoss: parseInt(pointsPerLoss) || 0,
                description: description.trim(),
                location: location.trim(),
                scheduledDate: scheduledDate || null,
            },
            teamConfronts: [],
            teamStatus: 'active'
        });
        setCreating(false);
        setCreated(true);
        setTimeout(() => navigate('/etapas'), 1400);
    }

    if (created) {
        return (
            <div style={{ animation: 'fadeIn 0.4s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
                <style>{`
                    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
                    @keyframes scaleIn { 0% { transform: scale(0.5); opacity: 0 } 60% { transform: scale(1.1) } 100% { transform: scale(1); opacity: 1 } }
                    @keyframes successGlow { 0%,100% { box-shadow: 0 0 60px rgba(52,211,153,0.3) } 50% { box-shadow: 0 0 100px rgba(52,211,153,0.5) } }
                    @keyframes star-rise { 0% { transform: translateY(20px) rotate(0); opacity: 0 } 100% { transform: translateY(-20px) rotate(360deg); opacity: 1 } }
                `}</style>
                <div style={{
                    background: 'linear-gradient(135deg, rgba(52,211,153,0.12), rgba(15,20,32,0.98))',
                    border: '2px solid rgba(52,211,153,0.4)',
                    borderRadius: 24, padding: 48, textAlign: 'center',
                    maxWidth: 460, animation: 'successGlow 2s ease-in-out infinite',
                    position: 'relative', overflow: 'hidden'
                }}>
                    <div style={{ position: 'absolute', top: 20, left: '20%', fontSize: 20, animation: 'star-rise 1.5s ease forwards' }}>✨</div>
                    <div style={{ position: 'absolute', top: 30, right: '20%', fontSize: 20, animation: 'star-rise 1.5s ease 0.2s forwards' }}>⭐</div>
                    <div style={{ position: 'absolute', top: 40, left: '60%', fontSize: 16, animation: 'star-rise 1.5s ease 0.4s forwards' }}>🌟</div>

                    <div style={{ animation: 'scaleIn 0.6s ease', display: 'inline-flex', width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(135deg, #34d399, #10b981)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 32px rgba(52,211,153,0.4)' }}>
                        <Trophy size={48} color="#fff" />
                    </div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: '#34d399', margin: 0, fontWeight: 800 }}>
                        Etapa Criada!
                    </h2>
                    <p style={{ color: '#94a3b8', marginTop: 10, fontSize: 14 }}>
                        Redirecionando para os confrontos…
                    </p>
                    <div style={{ marginTop: 18, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg, #34d399, #10b981)', borderRadius: 99, animation: 'fadeIn 1.4s linear forwards', width: '100%', transformOrigin: 'left' }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ animation: 'fadeInUp 0.4s ease' }}>
            <style>{`
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
                @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
                .etapa-stat-card { transition: all 0.25s; }
                .etapa-stat-card:hover { transform: translateY(-2px); }
                .past-etapa-row { transition: all 0.18s ease; }
                .past-etapa-row:hover { background: rgba(251,191,36,0.05) !important; transform: translateX(2px); border-color: rgba(251,191,36,0.25) !important; }
            `}</style>

            {/* ── Page Header ── */}
            <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{ width: 6, height: 32, borderRadius: 3, background: 'linear-gradient(180deg, #fbbf24, #f59e0b)' }} />
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: '#f1f5f9', margin: 0, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Swords size={24} color="#fbbf24" /> Nova Etapa Oficial
                        </h1>
                    </div>
                    <p style={{ color: '#475569', fontSize: 14, marginLeft: 16 }}>Configure um evento de confrontos contra equipes externas</p>
                </div>
            </div>

            {/* ── Stats of past etapas ── */}
            {stats.total > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {[
                        { icon: Trophy, label: 'Total', value: stats.total, color: '#fbbf24' },
                        { icon: Activity, label: 'Em Andamento', value: stats.ativas, color: '#60a5fa' },
                        { icon: Check, label: 'Finalizadas', value: stats.finalizadas, color: '#34d399' },
                        { icon: Crown, label: 'Campeãs', value: stats.campeas, color: '#a78bfa' },
                    ].map(s => (
                        <div key={s.label} className="etapa-stat-card" style={{
                            background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))',
                            border: `1px solid ${s.color}22`,
                            borderRadius: 16, padding: '16px 18px', position: 'relative', overflow: 'hidden',
                        }}>
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`, opacity: 0.5 }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 38, height: 38, borderRadius: 11, background: `${s.color}15`, border: `1px solid ${s.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <s.icon size={18} color={s.color} />
                                </div>
                                <div>
                                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{s.value}</div>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 3, fontWeight: 600 }}>{s.label}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Form Card ── */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(26,35,50,0.95), rgba(15,20,32,0.98))',
                border: '1px solid rgba(251,191,36,0.18)',
                borderRadius: 22, overflow: 'hidden', marginBottom: 20, position: 'relative',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #fbbf24, #f59e0b, transparent)' }} />

                <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Shield size={18} color="#fbbf24" />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: '#f1f5f9' }}>Configuração da Etapa</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.6 }}>Obrigatório</span>
                </div>

                <div style={{ padding: '0 24px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {/* Name (full width) */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                            <Trophy size={12} /> Nome da Etapa *
                        </label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Ex: Etapa Janeiro 2026"
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                border: '1px solid rgba(148,163,184,0.15)',
                                background: 'rgba(15,20,32,0.6)', color: '#f1f5f9',
                                fontSize: 15, fontWeight: 600, fontFamily: 'var(--font-display)', outline: 'none',
                                transition: 'all 0.2s'
                            }}
                            onFocus={e => { e.target.style.borderColor = 'rgba(251,191,36,0.4)'; e.target.style.background = 'rgba(15,20,32,0.9)'; }}
                            onBlur={e => { e.target.style.borderColor = 'rgba(148,163,184,0.15)'; e.target.style.background = 'rgba(15,20,32,0.6)'; }}
                        />
                    </div>

                    {/* Points per win */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                            ✅ Pontos por Vitória
                        </label>
                        <input
                            type="number" min="0" max="10"
                            value={pointsPerWin}
                            onChange={e => setPointsPerWin(e.target.value)}
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                border: '1px solid rgba(148,163,184,0.15)',
                                background: 'rgba(15,20,32,0.6)', color: '#34d399',
                                fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', outline: 'none', textAlign: 'center'
                            }}
                        />
                    </div>

                    {/* Points per loss */}
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                            ❌ Pontos por Derrota
                        </label>
                        <input
                            type="number" min="0" max="10"
                            value={pointsPerLoss}
                            onChange={e => setPointsPerLoss(e.target.value)}
                            style={{
                                width: '100%', padding: '12px 14px', borderRadius: 12,
                                border: '1px solid rgba(148,163,184,0.15)',
                                background: 'rgba(15,20,32,0.6)', color: '#f87171',
                                fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', outline: 'none', textAlign: 'center'
                            }}
                        />
                    </div>
                </div>

                {/* Optional fields */}
                <div style={{ padding: '14px 24px 22px', borderTop: '1px solid rgba(148,163,184,0.06)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                        Detalhes opcionais
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>
                                <Calendar size={11} /> Data Prevista
                            </label>
                            <input
                                type="date"
                                value={scheduledDate}
                                onChange={e => setScheduledDate(e.target.value)}
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)', background: 'rgba(15,20,32,0.5)', color: '#94a3b8', fontSize: 13, outline: 'none', colorScheme: 'dark' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>
                                <MapPin size={11} /> Local
                            </label>
                            <input
                                value={location}
                                onChange={e => setLocation(e.target.value)}
                                placeholder="Ex: Sede ACLS Campo Largo"
                                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)', background: 'rgba(15,20,32,0.5)', color: '#94a3b8', fontSize: 13, outline: 'none' }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 5 }}>
                            <FileText size={11} /> Descrição / Observações
                        </label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Notas, regras especiais, premiação…"
                            rows={2}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.12)', background: 'rgba(15,20,32,0.5)', color: '#94a3b8', fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                        />
                    </div>
                </div>
            </div>

            {/* ── How it works ── */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(96,165,250,0.05), rgba(15,20,32,0.98))',
                border: '1px solid rgba(96,165,250,0.15)',
                borderRadius: 22, overflow: 'hidden', marginBottom: 20, position: 'relative',
            }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)' }} />
                <div style={{ padding: '18px 22px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={16} color="#60a5fa" />
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: '#f1f5f9' }}>Como funciona uma Etapa</span>
                </div>
                <div style={{ padding: '4px 22px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    {[
                        { icon: '⚔️', title: 'Confrontos 5x5', desc: 'Sua equipe enfrenta adversárias em duelos individuais simultâneos.' },
                        { icon: '🏆', title: 'Encerra em 3', desc: 'Cada confronto termina quando uma equipe vence 3 individuais.' },
                        { icon: '📊', title: 'Stats no Ranking', desc: 'Vitórias e derrotas individuais entram no ranking global dos jogadores.' },
                        { icon: '👑', title: 'Status Manual', desc: 'Você marca quando a equipe vira Campeã, Vice ou é Eliminada.' },
                    ].map(step => (
                        <div key={step.title} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(148,163,184,0.06)' }}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                                {step.icon}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{step.title}</div>
                                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{step.desc}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Action buttons ── */}
            {isAdmin ? (
                <button
                    onClick={handleGenerate}
                    disabled={creating || !name.trim()}
                    style={{
                        width: '100%', padding: '16px 20px', borderRadius: 14, border: 'none',
                        background: creating ? 'rgba(251,191,36,0.5)' : 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                        color: '#111827', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
                        cursor: creating || !name.trim() ? 'not-allowed' : 'pointer',
                        opacity: !name.trim() ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        boxShadow: '0 8px 24px rgba(251,191,36,0.3)',
                        transition: 'all 0.2s', letterSpacing: 0.5,
                    }}
                    onMouseEnter={e => { if (!creating && name.trim()) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(251,191,36,0.4)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 24px rgba(251,191,36,0.3)'; }}
                >
                    {creating ? <><Loader size={18} className="animate-spin" /> Criando…</> : <><Zap size={20} /> INICIAR ETAPA</>}
                </button>
            ) : (
                <div style={{ textAlign: 'center', padding: 14, color: '#94a3b8', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,184,0.1)', borderRadius: 12, fontSize: 13 }}>
                    🔒 Apenas administradores podem iniciar novas etapas.
                </div>
            )}

            <button
                onClick={() => navigate(-1)}
                disabled={creating}
                style={{
                    width: '100%', padding: '12px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.15)',
                    background: 'rgba(255,255,255,0.03)', color: '#94a3b8',
                    fontWeight: 600, fontSize: 13, marginTop: 10, cursor: 'pointer', transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
                Cancelar
            </button>

            {/* ── Recent etapas list ── */}
            {pastEtapas.length > 0 && (
                <div style={{ marginTop: 32 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
                        <Activity size={14} color="#475569" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Etapas anteriores</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(148,163,184,0.06)' }} />
                        <span style={{ fontSize: 10, color: '#475569' }}>{pastEtapas.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {pastEtapas.slice(-5).reverse().map(e => {
                            const statusColor = e.teamStatus === 'champion' ? '#fbbf24' : e.teamStatus === 'runner-up' ? '#94a3b8' : e.teamStatus === 'third' ? '#cd7f32' : e.teamStatus === 'eliminated' ? '#f87171' : '#60a5fa';
                            const statusIcon = e.teamStatus === 'champion' ? '🏆' : e.teamStatus === 'runner-up' ? '🥈' : e.teamStatus === 'third' ? '🥉' : e.teamStatus === 'eliminated' ? '🚨' : '⚔️';
                            const confrontosCount = (e.teamConfronts || []).length;
                            return (
                                <div key={e.id}
                                    onClick={() => navigate('/etapas')}
                                    className="past-etapa-row"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        padding: '10px 14px', borderRadius: 12,
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(148,163,184,0.06)',
                                        cursor: 'pointer'
                                    }}>
                                    <div style={{ fontSize: 18 }}>{statusIcon}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                                        <div style={{ fontSize: 10, color: '#64748b' }}>{confrontosCount} confronto{confrontosCount !== 1 ? 's' : ''} · {e.status === 'completed' ? 'Finalizada' : 'Em andamento'}</div>
                                    </div>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: statusColor, background: `${statusColor}15`, padding: '3px 8px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {e.teamStatus === 'champion' ? 'Campeã' : e.teamStatus === 'runner-up' ? 'Vice' : e.teamStatus === 'third' ? '3º' : e.teamStatus === 'eliminated' ? 'Eliminada' : 'Ativa'}
                                    </span>
                                    <ChevronRight size={14} color="#475569" />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
