import React, { useEffect, Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 32, color: '#f1f5f9', fontFamily: 'monospace', background: '#0a0e17', minHeight: '100vh' }}>
                    <h2 style={{ color: '#f87171', marginBottom: 12 }}>⚠️ Erro no App</h2>
                    <pre style={{ background: '#1a2332', padding: 16, borderRadius: 8, overflowX: 'auto', fontSize: 13, color: '#fca5a5' }}>
                        {this.state.error?.message}
                        {'\n\n'}
                        {this.state.error?.stack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminProvider } from './contexts/AdminContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Players from './pages/Players.jsx';
import CreateSelective from './pages/CreateSelective.jsx';
import Matches from './pages/Matches.jsx';
import EditEtapa from './pages/Etapas.jsx';
import CreateEtapa from './pages/CreateEtapa.jsx';
import Rankings from './pages/Rankings.jsx';
import History from './pages/History.jsx';
import HallOfFame from './pages/HallOfFame.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
    useEffect(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            const timer = setTimeout(() => {
                splash.classList.add('fade-out');
                splash.addEventListener('transitionend', () => splash.remove(), { once: true });
            }, 1400);
            return () => clearTimeout(timer);
        }
    }, []);
    return (
        <ErrorBoundary>
            <AdminProvider>
                <BrowserRouter>
                    <div className="app-layout">
                        <Sidebar />
                        <main className="main-content">
                            <Routes>
                                <Route path="/" element={<Dashboard />} />
                                <Route path="/jogadores" element={<Players />} />
                                <Route path="/nova-seletiva" element={<CreateSelective />} />
                                <Route path="/confrontos" element={<Matches />} />
                                <Route path="/etapas" element={<EditEtapa />} />
                                <Route path="/nova-etapa" element={<CreateEtapa />} />
                                <Route path="/ranking" element={<Rankings />} />
                                <Route path="/historico" element={<History />} />
                                <Route path="/hall-da-fama" element={<HallOfFame />} />
                                <Route path="/admin" element={<Admin />} />
                            </Routes>
                        </main>
                    </div>
                </BrowserRouter>
            </AdminProvider>
        </ErrorBoundary>
    );
}
