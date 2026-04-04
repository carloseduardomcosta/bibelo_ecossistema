import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './lib/auth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import ClientePerfil from './pages/ClientePerfil';
import Sync from './pages/Sync';
import Campanhas from './pages/Campanhas';
import Segmentos from './pages/Segmentos';
import Produtos from './pages/Produtos';
import Estoque from './pages/Estoque';
import Lucratividade from './pages/Lucratividade';
import Financeiro from './pages/Financeiro';
import DespesasFixas from './pages/DespesasFixas';
import SimuladorCustos from './pages/SimuladorCustos';
import NfEntrada from './pages/NfEntrada';
import Vendas from './pages/Vendas';
import Pedidos from './pages/Pedidos';
import ContasPagar from './pages/ContasPagar';
import ProdutoPerfil from './pages/ProdutoPerfil';
import Pipeline from './pages/Pipeline';
import Relatorios from './pages/Relatorios';
import MarketingPage from './pages/Marketing';
import Briefing from './pages/Briefing';
import NovaCampanha from './pages/NovaCampanha';
import EditorImagens from './pages/EditorImagens';
import ConsumoEmail from './pages/ConsumoEmail';
import Inteligencia from './pages/Inteligencia';
import { ToastProvider } from './components/Toast';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '130005911318-drbfhqtc0trct0rr1918rtgjiiflbhoh.apps.googleusercontent.com';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bibelo-bg flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-bibelo-text mb-2">Ops! Algo deu errado</h1>
            <p className="text-bibelo-muted mb-4">Tente recarregar a pagina</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-bibelo-primary text-white rounded-lg">
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
          <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/clientes/:id" element={<ClientePerfil />} />
              <Route path="/produtos" element={<Produtos />} />
              <Route path="/produtos/:id" element={<ProdutoPerfil />} />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/vendas" element={<Vendas />} />
              <Route path="/pedidos" element={<Pedidos />} />
              <Route path="/contas-pagar" element={<ContasPagar />} />
              <Route path="/lucratividade" element={<Lucratividade />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/segmentos" element={<Segmentos />} />
              <Route path="/campanhas" element={<Campanhas />} />
              <Route path="/campanhas/nova" element={<NovaCampanha />} />
              <Route path="/marketing" element={<MarketingPage />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/despesas-fixas" element={<DespesasFixas />} />
              <Route path="/simulador" element={<SimuladorCustos />} />
              <Route path="/nf-entrada" element={<NfEntrada />} />
              <Route path="/briefing" element={<Briefing />} />
              <Route path="/editor-imagens" element={<EditorImagens />} />
              <Route path="/consumo-email" element={<ConsumoEmail />} />
              <Route path="/inteligencia" element={<Inteligencia />} />
              <Route path="/sync" element={<Sync />} />
            </Route>
          </Routes>
          </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
