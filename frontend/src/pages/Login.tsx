import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { user, loading, loginWithGoogle } = useAuth();
  const [erro, setErro] = useState('');

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setErro('Erro ao autenticar com Google.');
      return;
    }
    try {
      await loginWithGoogle(response.credential);
    } catch {
      setErro('Falha no login. Tente novamente.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bibelo-bg px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎀</div>
          <h1 className="text-2xl font-bold text-bibelo-text">BibeloCRM</h1>
          <p className="text-bibelo-muted text-sm mt-1">Ecossistema Bibelo</p>
        </div>

        {/* Google Login */}
        <div className="bg-bibelo-card border border-bibelo-border rounded-xl p-8 flex flex-col items-center gap-5">
          <p className="text-sm text-bibelo-muted">Entre com sua conta Google</p>

          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setErro('Erro ao conectar com Google.')}
            theme="filled_black"
            size="large"
            shape="rectangular"
            width="280"
            text="signin_with"
          />

          {erro && (
            <div className="w-full text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 text-center">
              {erro}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
