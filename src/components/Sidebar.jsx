import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    PlusCircle,
    Swords,
    Trophy,
    History,
    Crown,
    Menu,
    X,
    Shield,
    Share2
} from 'lucide-react';

const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/nova-seletiva', icon: PlusCircle, label: 'Nova Seletiva' },
    { path: '/confrontos', icon: Swords, label: 'Seletivas' },
    { path: '/nova-etapa', icon: PlusCircle, label: 'Nova Etapa' },
    { path: '/etapas', icon: Trophy, label: 'Etapas' },
    { path: '/ranking', icon: Trophy, label: 'Ranking' },
    { path: '/jogadores', icon: Users, label: 'Jogadores' },
    { path: '/historico', icon: History, label: 'Histórico' },
    { path: '/hall-da-fama', icon: Crown, label: 'Hall da Fama' },
    { path: '/admin', icon: Shield, label: 'Admin' },
];

export default function Sidebar() {
    const [open, setOpen] = useState(false);
    const [installable, setInstallable] = useState(false);

    useEffect(() => {
        if (window.deferredPrompt) setInstallable(true);
        const handlePwaReady = () => setInstallable(true);
        window.addEventListener('pwa-ready', handlePwaReady);
        return () => window.removeEventListener('pwa-ready', handlePwaReady);
    }, []);

    const handleInstallClick = async () => {
        if (!window.deferredPrompt) return;
        window.deferredPrompt.prompt();
        const { outcome } = await window.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setInstallable(false);
        }
    };

    return (
        <>
            {/* Mobile Header */}
            <div className="mobile-header">
                <button className="hamburger-btn" onClick={() => setOpen(true)}>
                    <Menu size={24} />
                </button>
                <div className="mobile-header-logo">
                    <img src="/logo.png" alt="A.C.L.S" className="mobile-logo-img" />
                </div>
                <div style={{ width: 40 }} />
            </div>

            {/* Overlay */}
            <div
                className={`sidebar-overlay ${open ? 'open' : ''}`}
                onClick={() => setOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`sidebar ${open ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo-container">
                        <img src="/logo.png" alt="A.C.L.S" className="sidebar-logo-img" />
                    </div>
                    <div className="sidebar-brand">
                        <h1>A.C.L.S</h1>
                        <span>Campo Largo</span>
                    </div>
                    <button
                        className="hamburger-btn"
                        onClick={() => setOpen(false)}
                        style={{ marginLeft: 'auto', display: open ? 'block' : 'none' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/'}
                            className={({ isActive }) =>
                                `sidebar-link ${isActive ? 'active' : ''}`
                            }
                            onClick={() => setOpen(false)}
                        >
                            <item.icon size={20} />
                            {item.label}
                        </NavLink>
                    ))}

                    <div style={{ margin: '16px 0', borderTop: '1px solid var(--border-subtle)' }} />

                    {installable && (
                        <button
                            className="sidebar-link"
                            style={{ width: '100%', border: 'none', background: 'rgba(52, 211, 153, 0.12)', cursor: 'pointer', color: 'var(--green-400)', fontWeight: 600, marginBottom: 8, transition: 'all 0.2s ease' }}
                            onClick={handleInstallClick}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(52, 211, 153, 0.2)'; e.currentTarget.style.transform = 'translateX(4px)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(52, 211, 153, 0.12)'; e.currentTarget.style.transform = 'translateX(0)' }}
                        >
                            <Shield size={20} style={{ marginRight: 2 }} />
                            Instalar App
                        </button>
                    )}

                    <button
                        className="sidebar-link"
                        style={{ width: '100%', border: 'none', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 500, transition: 'all 0.2s ease' }}
                        onClick={() => {
                            if (navigator.share) {
                                navigator.share({
                                    title: 'A.C.L.S App',
                                    text: 'Acompanhe o ranking e as seletivas de sinuca!',
                                    url: window.location.origin
                                }).catch(console.error);
                            } else {
                                navigator.clipboard.writeText(window.location.origin);
                                alert('Link copiado para a área de transferência!');
                            }
                            setOpen(false);
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateX(4px)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.transform = 'translateX(0)' }}
                    >
                        <Share2 size={20} style={{ marginRight: 2, color: 'var(--text-secondary)' }} />
                        Compartilhar App
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <p className="sidebar-footer-text">
                        A.C.L.S v1.0<br />
                        © 2026 Todos os direitos reservados
                    </p>
                </div>
            </aside>
        </>
    );
}
