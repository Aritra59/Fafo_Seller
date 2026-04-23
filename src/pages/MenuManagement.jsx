import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MenuGroupsPanel } from '../components/menu/MenuGroupsPanel';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import { subscribeProductsBySellerId } from '../services/firestore';

export function MenuManagement() {
  const { seller, sellerId, loading, error } = useSeller();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!sellerId) {
      setProducts([]);
      return undefined;
    }
    return subscribeProductsBySellerId(
      sellerId,
      (rows) => setProducts(rows),
      () => setProducts([]),
    );
  }, [sellerId]);

  if (loading) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Loading…
        </p>
      </div>
    );
  }
  if (error || !seller) {
    return (
      <div className="card">
        <p className="error" style={{ margin: 0 }}>
          {error?.message ?? 'No shop'}
        </p>
        <Link to="/login">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Menu groups</h1>
        <Link to="/menu?tab=menugroups" className="btn btn-ghost">
          Back to menu
        </Link>
      </header>
      <MenuGroupsPanel sellerId={sellerId} products={products} readOnly={isDemoExplorer()} />
    </div>
  );
}
