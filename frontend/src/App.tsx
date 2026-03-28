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
import ContasPagar from './pages/ContasPagar';
import ProdutoPerfil from './pages/ProdutoPerfil';
import Pipeline from './pages/Pipeline';
import Relatorios from './pages/Relatorios';
import { ToastProvider } from './components/Toast';

const GOOGLE_CLIENT_ID = '130005911318-drbfhqtc0trct0rr1918rtgjiiflbhoh.apps.googleusercontent.com';

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
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
              <Route path="/contas-pagar" element={<ContasPagar />} />
              <Route path="/lucratividade" element={<Lucratividade />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/segmentos" element={<Segmentos />} />
              <Route path="/campanhas" element={<Campanhas />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/despesas-fixas" element={<DespesasFixas />} />
              <Route path="/simulador" element={<SimuladorCustos />} />
              <Route path="/nf-entrada" element={<NfEntrada />} />
              <Route path="/sync" element={<Sync />} />
            </Route>
          </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
