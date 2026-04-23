import { useEffect, useId, useRef, useState } from 'react';
import { searchPlaces } from '../services/geocode.js';

/**
 * @param {{ onSelect: (place: { lat: number, lng: number, label: string }) => void }} props
 */
export function LocationSearchBox({ onSelect }) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    const t = query.trim();
    if (t.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return undefined;
    }

    const ac = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setSearchError('');
      try {
        const list = await searchPlaces(t, ac.signal);
        setResults(list);
        setOpen(true);
      } catch (e) {
        if (e.name === 'AbortError') return;
        setSearchError(e.message ?? 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [query]);

  useEffect(() => {
    function handlePointerDown(ev) {
      if (!wrapRef.current?.contains(ev.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  function pick(place) {
    onSelect(place);
    setQuery(place.label);
    setOpen(false);
    setResults([]);
  }

  return (
    <div ref={wrapRef} className="location-search">
      <label className="label" htmlFor="location-search-input">
        Search location
      </label>
      <div className="location-search-field">
        <input
          id="location-search-input"
          type="search"
          className="input"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="City, street, landmark…"
          value={query}
          onChange={(ev) => setQuery(ev.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
        />
        {loading ? (
          <span className="location-search-spinner muted" aria-hidden>
            …
          </span>
        ) : null}
      </div>
      {searchError ? (
        <p className="error" style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem' }}>
          {searchError}
        </p>
      ) : null}
      {open && results.length > 0 ? (
        <ul id={listId} className="location-search-results" role="listbox">
          {results.map((place) => (
            <li key={place.id} role="none">
              <button
                type="button"
                className="location-search-item"
                role="option"
                onClick={() => pick(place)}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim().length >= 2 && !loading && results.length === 0 && !searchError ? (
        <p className="muted" style={{ margin: '0.35rem 0 0', fontSize: '0.8125rem' }}>
          No places found. Try different words or set the pin on the map.
        </p>
      ) : null}
    </div>
  );
}
