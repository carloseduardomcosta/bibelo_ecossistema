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

const GOOGLE_CLIENT_ID = '130005911318-drbfhqtc0trct0rr1918rtgjiiflbhoh.apps.googleusercontent.com';

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
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
              <Route path="/produtos/:id" element={<Placeholder titulo="Detalhe Produto" />} />
              <Route path="/estoque" element={<Estoque />} />
              <Route path="/vendas" element={<Vendas />} />
              <Route path="/lucratividade" element={<Lucratividade />} />
              <Route path="/segmentos" element={<Segmentos />} />
              <Route path="/campanhas" element={<Campanhas />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/despesas-fixas" element={<DespesasFixas />} />
              <Route path="/simulador" element={<SimuladorCustos />} />
              <Route path="/nf-entrada" element={<NfEntrada />} />
              <Route path="/sync" element={<Sync />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}

function Placeholder({ titulo }: { titulo: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text">{titulo}</h1>
      <p className="text-bibelo-muted mt-1">Em desenvolvimento.</p>
    </div>
  );
}
