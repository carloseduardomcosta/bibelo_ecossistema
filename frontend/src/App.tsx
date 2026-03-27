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
              <Route path="/campanhas" element={<Placeholder titulo="Campanhas" />} />
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
