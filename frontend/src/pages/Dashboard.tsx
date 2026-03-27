import { useAuth } from '../lib/auth';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold text-bibelo-text mb-2">
        Ola, {user?.nome?.split(' ')[0]}!
      </h1>
      <p className="text-bibelo-muted">
        Bem-vindo ao BibeloCRM. O dashboard com KPIs e graficos esta a caminho.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {['Total Clientes', 'Receita Total', 'Ticket Medio', 'Novos este Mes'].map((label) => (
          <div
            key={label}
            className="bg-bibelo-card border border-bibelo-border rounded-xl p-5"
          >
            <p className="text-sm text-bibelo-muted">{label}</p>
            <p className="text-2xl font-bold text-bibelo-text mt-1">--</p>
          </div>
        ))}
      </div>
    </div>
  );
}
