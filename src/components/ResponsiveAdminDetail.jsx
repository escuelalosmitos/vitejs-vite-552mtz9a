import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Use the available admin content width, including the space taken by its menu.
export default function ResponsiveAdminDetail({ open, onClose, title, desktopClassName, section, breakpoint = 900, children }) {
  const hostRef = useRef(null);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    const container = hostRef.current?.closest('.admin-main');
    if (!container) return undefined;
    const measure = () => {
      const style = window.getComputedStyle(container);
      const width = container.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      setCompact(width <= breakpoint);
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(container);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [breakpoint]);

  useLayoutEffect(() => {
    if (!compact || !open) return undefined;
    const previouslyFocused = document.activeElement;
    const scrollX = window.scrollX, scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousGutter = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'stable';
    const previous = Object.fromEntries(['position', 'top', 'left', 'width', 'overflow'].map(key => [key, body.style[key]]));
    Object.assign(body.style, { position: 'fixed', top: `${-scrollY}px`, left: `${-scrollX}px`, width: '100%', overflow: 'hidden' });
    closeRef.current?.focus({ preventScroll: true });
    const onKeyDown = event => {
      const dialog = dialogRef.current;
      // Other admin actions may open an existing modal above this one.
      if (!dialog?.contains(event.target)) return;
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault(); onCloseRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter(item => item.getClientRects().length && !item.closest('[hidden]'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      Object.assign(body.style, previous);
      root.style.scrollbarGutter = previousGutter;
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [compact, open]);

  return <>
    <div ref={hostRef} hidden={compact} role="region" aria-label={title} className={desktopClassName}>{!compact && children}</div>
    {compact && open && createPortal(
      <div className="admin-main admin-responsive-backdrop" data-admin-section={section}>
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="admin-responsive-dialog">
          <header className="admin-responsive-dialog-header">
            <h2 id={titleId}>{title}</h2>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar detalle y volver al listado">Cerrar ×</button>
          </header>
          <div className={`admin-responsive-dialog-content ${desktopClassName || ''}`} onClick={event => {
            if (event.target.closest('[data-admin-detail-dismiss]')) onCloseRef.current?.();
          }}>{children}</div>
        </section>
      </div>, document.body
    )}
  </>;
}
