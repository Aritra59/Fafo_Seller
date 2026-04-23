import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { useSeller } from '../hooks/useSeller';
import { getOrderForSeller } from '../services/firestore';

export function OrderDetailPage() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const { sellerId, loading: sellerLoading, error: sellerError } = useSeller();
  const [order, setOrder] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sellerLoading) return;
    const oid = decodeURIComponent(String(orderId ?? ''));
    if (!sellerId || !oid) {
      setOrder(null);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    getOrderForSeller(oid, sellerId)
      .then((row) => {
        if (cancelled) return;
        setOrder(row);
        if (!row) setErr(new Error('Order not found.'));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e);
        setOrder(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId, sellerLoading, orderId]);

  function close() {
    if (window.history.length > 1) nav(-1);
    else nav('/orders');
  }

  if (sellerError) {
    return (
      <div className="customers-page card stack">
        <p className="error" style={{ margin: 0 }}>
          {sellerError.message ?? 'Could not load shop.'}
        </p>
        <Link to="/" className="btn btn-ghost">
          Home
        </Link>
      </div>
    );
  }

  if (sellerLoading || loading) {
    return (
      <div className="customers-page card">
        <p className="muted" style={{ margin: 0 }}>
          Loading order…
        </p>
      </div>
    );
  }

  if (err && !order) {
    return (
      <div className="customers-page card stack">
        <p className="error" style={{ margin: 0 }}>
          {err.message ?? 'Could not load order.'}
        </p>
        <Link to="/orders" className="btn btn-ghost">
          Back to orders
        </Link>
      </div>
    );
  }

  return <OrderDetailsModal order={order} onClose={close} />;
}
