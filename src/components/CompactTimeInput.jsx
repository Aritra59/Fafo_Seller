import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ITEM_H = 44;
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINS = Array.from({ length: 60 }, (_, i) => i);

function parseTimeValue(raw) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h24: null, min: 0 };
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return { h24: null, min: 0 };
  }
  return { h24: h, min };
}

function h24ToParts(h24, min) {
  const isAM = h24 < 12;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return { h12, isAM, min };
}

function partsToH24(h12, min, isAM) {
  let h24;
  if (isAM) {
    h24 = h12 === 12 ? 0 : h12;
  } else {
    h24 = h12 === 12 ? 12 : h12 + 12;
  }
  return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function formatTrigger(h24, min) {
  if (h24 === null) return null;
  const { h12, isAM } = h24ToParts(h24, min);
  const ap = isAM ? 'AM' : 'PM';
  return `${String(h12).padStart(2, '0')} : ${String(min).padStart(2, '0')} ${ap}`;
}

function scrollToIndex(el, index) {
  if (!el) return;
  const top = Math.max(0, index) * ITEM_H;
  el.scrollTo({ top, behavior: 'auto' });
}

function readIndex(el, maxIdx) {
  if (!el) return 0;
  const raw = Math.round(el.scrollTop / ITEM_H);
  return Math.max(0, Math.min(maxIdx, raw));
}

function snapColumn(el, maxIdx, smooth) {
  if (!el) return 0;
  const i = readIndex(el, maxIdx);
  el.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
  return i;
}

/**
 * Mobile roller: hours + minutes + AM/PM. Stored value remains HH:mm (24h).
 */
export function CompactTimeInput({
  value,
  onChange,
  id: idProp,
  disabled = false,
  className = '',
  hourLabel = 'Hour',
  minuteLabel = 'Minute',
}) {
  const reactId = useId();
  const dialogId = idProp ? `roller-${idProp}` : `roller-${reactId.replace(/:/g, '')}`;
  const triggerId = idProp || dialogId;

  const parsed = useMemo(() => parseTimeValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ h12: 9, isAM: true, min: 0 });

  const hourListRef = useRef(null);
  const minListRef = useRef(null);
  const snapTRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const openPicker = () => {
    if (parsed.h24 !== null) {
      setDraft(h24ToParts(parsed.h24, parsed.min));
    } else {
      setDraft({ h12: 9, isAM: true, min: 0 });
    }
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const d = draftRef.current;
    const hi = HOURS_12.indexOf(d.h12);
    const hIdx = hi >= 0 ? hi : 0;
    scrollToIndex(hourListRef.current, hIdx);
    scrollToIndex(minListRef.current, d.min);
  }, [open]);

  const flushSnap = useCallback(() => {
    const he = hourListRef.current;
    const me = minListRef.current;
    if (!he || !me) return;
    const hi = snapColumn(he, HOURS_12.length - 1, true);
    const mi = snapColumn(me, 59, true);
    const h12 = HOURS_12[hi] ?? 12;
    setDraft((d) => ({ ...d, h12, min: mi }));
  }, []);

  const scheduleSnap = useCallback(() => {
    if (snapTRef.current) window.clearTimeout(snapTRef.current);
    snapTRef.current = window.setTimeout(() => {
      snapTRef.current = null;
      flushSnap();
    }, 90);
  }, [flushSnap]);

  useEffect(() => () => {
    if (snapTRef.current) window.clearTimeout(snapTRef.current);
  }, []);

  const handleSet = () => {
    const he = hourListRef.current;
    const me = minListRef.current;
    const hi = he ? snapColumn(he, HOURS_12.length - 1, false) : 0;
    const mi = me ? snapColumn(me, 59, false) : 0;
    const h12 = HOURS_12[hi] ?? 12;
    onChange(partsToH24(h12, mi, draft.isAM));
    setOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setOpen(false);
  };

  const preview = `${String(draft.h12).padStart(2, '0')} : ${String(draft.min).padStart(2, '0')} ${draft.isAM ? 'AM' : 'PM'}`;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerText = formatTrigger(parsed.h24, parsed.min);

  const sheet = open
    ? createPortal(
        <div className="roller-time__overlay" role="presentation">
          <button
            type="button"
            className="roller-time__backdrop"
            aria-label="Close time picker"
            onClick={() => setOpen(false)}
          />
          <div
            className="roller-time__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            id={dialogId}
          >
            <div className="roller-time__sheet-head">
              <p id={`${dialogId}-title`} className="roller-time__sheet-title">
                Set time
              </p>
              <button type="button" className="roller-time__linkbtn" onClick={handleClear}>
                Clear
              </button>
            </div>

            <div className="roller-time__preview" aria-live="polite">
              <span className="roller-time__preview-inner">{preview}</span>
            </div>

            <div className="roller-time__rollers">
              <div className="roller-time__column">
                <span className="roller-time__col-label">Hours</span>
                <div className="roller-time__viewport">
                  <div className="roller-time__highlight" aria-hidden="true" />
                  <ul
                    ref={hourListRef}
                    className="roller-time__list"
                    aria-label={hourLabel}
                    onScroll={scheduleSnap}
                  >
                    {HOURS_12.map((h) => (
                      <li key={h} className="roller-time__item">
                        {String(h).padStart(2, '0')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <span className="roller-time__colon" aria-hidden="true">
                :
              </span>
              <div className="roller-time__column">
                <span className="roller-time__col-label">Minutes</span>
                <div className="roller-time__viewport">
                  <div className="roller-time__highlight" aria-hidden="true" />
                  <ul
                    ref={minListRef}
                    className="roller-time__list"
                    aria-label={minuteLabel}
                    onScroll={scheduleSnap}
                  >
                    {MINS.map((m) => (
                      <li key={m} className="roller-time__item">
                        {String(m).padStart(2, '0')}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="roller-time__ampm" role="group" aria-label="AM or PM">
              <button
                type="button"
                className={`roller-time__ampm-btn${draft.isAM ? ' roller-time__ampm-btn--on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, isAM: true }))}
              >
                AM
              </button>
              <button
                type="button"
                className={`roller-time__ampm-btn${!draft.isAM ? ' roller-time__ampm-btn--on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, isAM: false }))}
              >
                PM
              </button>
            </div>

            <button type="button" className="roller-time__set" onClick={handleSet}>
              Set
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`compact-time${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        id={triggerId}
        className={`roller-time__trigger${triggerText ? '' : ' roller-time__trigger--placeholder'}`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => !disabled && openPicker()}
      >
        {triggerText ?? '— : — —'}
      </button>
      {sheet}
    </div>
  );
}
