import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MenusPanel } from '../components/menu/MenusPanel';
import { isDemoExplorer } from '../constants/demoMode';
import { useSeller } from '../hooks/useSeller';
import { subscribeCombosBySellerId, subscribeProductsBySellerId } from '../services/firestore';

export function MenuManagement() {
  const { seller, sellerId, loading, error } = useSeller();
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);

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

  useEffect(() => {
    if (!sellerId) {
      setCombos([]);
      return undefined;
    }
    return subscribeCombosBySellerId(
      sellerId,
      (rows) => setCombos(rows),
      () => setCombos([]),
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
      <header style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Link to="/menu?tab=menus" className="btn btn-ghost">
          Back to menu
        </Link>
      </header>
      <MenusPanel
        sellerId={sellerId}
        products={products}
        combos={combos}
        shopCode={seller.shopCode ?? seller.code ?? ''}
        readOnly={isDemoExplorer()}
      />
    </div>
  );
}
