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
    Share2,
    Download
} from 'lucide-react';

const navGroups = [
    {
        label: null,
        items: [
            { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
        ]
    },
    {
        label: 'Torneios',
        items: [
            { path: '/nova-seletiva', icon: PlusCircle, label: 'Nova Seletiva' },
            { path: '/confrontos', icon: Swords, label: 'Seletivas' },
            { path: '/nova-etapa', icon: PlusCircle, label: 'Nova Etapa' },
            { path: '/etapas', icon: Trophy, label: 'Etapas' },
        ]
    },
    {
        label: 'Comunidade',
        items: [
            { path: '/ranking', icon: Trophy, label: 'Ranking' },
            { path: '/jogadores', icon: Users, label: 'Jogadores' },
            { path: '/historico', icon: History, label: 'Histórico' },
            { path: '/hall-da-fama', icon: Crown, label: 'Hall da Fama' },
            { path: '/admin', icon: Shield, label: 'Admin' },
        ]
    }
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
                <button className="hamburger-btn" onClick={() => setOpen(true)} aria-label="Abrir menu">
                    <Menu size={22} />
                </button>
                <div className="mobile-header-logo">
                    <img src="/logo.png" alt="A.C.L.S" className="mobile-logo-img" />
                </div>
                <div style={{ width: 44 }} />
            </div>

            {/* Overlay */}
            <div
                className={`sidebar-overlay ${open ? 'open' : ''}`}
                onClick={() => setOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`sidebar ${open ? 'open' : ''}`}>

                {/* Header */}
                <div className="sidebar-header">
                    <div className="sidebar-logo-container">
                        <img src="/logo.png" alt="A.C.L.S" className="sidebar-logo-img" />
                    </div>
                    <div className="sidebar-brand">
                        <h1>A.C.L.S</h1>
                        <span>Campo Largo</span>
                    </div>
                    <button
                        className="hamburger-btn sidebar-close-btn"
                        onClick={() => setOpen(false)}
                        aria-label="Fechar menu"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="sidebar-nav">
                    {navGroups.map((group, gi) => (
                        <div key={gi} className="sidebar-group">
                            {group.label && (
                                <span className="sidebar-group-label">{group.label}</span>
                            )}
                            {group.items.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    end={item.path === '/'}
                                    className={({ isActive }) =>
                                        `sidebar-link ${isActive ? 'active' : ''}`
                                    }
                                    onClick={() => setOpen(false)}
                                >
                                    <span className="sidebar-link-icon">
                                        <item.icon size={18} />
                                    </span>
                                    <span className="sidebar-link-label">{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}

                    {/* Utility buttons */}
                    <div className="sidebar-utilities">
                        {installable && (
                            <button className="sidebar-util-btn sidebar-util-green" onClick={handleInstallClick}>
                                <Download size={16} />
                                <span>Instalar App</span>
                            </button>
                        )}
                        <button
                            className="sidebar-util-btn"
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
                        >
                            <Share2 size={16} />
                            <span>Compartilhar App</span>
                        </button>
                    </div>
                </nav>

                {/* Footer */}
                <div className="sidebar-footer">
                    <div className="sidebar-footer-dot" />
                    <p className="sidebar-footer-text">A.C.L.S v1.0 · © 2026</p>
                </div>
            </aside>
        </>
    );
}
