import React, { useEffect, useId, useRef, useState } from 'react';
import { openWidget } from './widget-request.js';
import './widgets-menu.css';

const icons = {
  widgets: <><rect x="2" y="2" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="2" width="4.5" height="4.5" rx="1"/><rect x="2" y="9.5" width="4.5" height="4.5" rx="1"/><rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1"/></>,
  timer: <><circle cx="8" cy="9" r="5"/><path d="M6 1h4M8 4V1m0 8V6m4-2 1-1"/></>,
  checklist: <><path d="m2 4 1 1 2-2m-3 7 1 1 2-2M8 4h6M8 10h6"/></>,
  planner: <><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1v4m6-4v4M2 7h12m-9 3h2"/></>,
};
function WidgetIcon({ name }) {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

export default function WidgetsMenu({ onPlanner, onError }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const menu = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button')?.focus();
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [open]);

  async function launch(kind) {
    setOpen(false);
    trigger.current?.focus();
    try { await (kind === 'planner' ? onPlanner() : openWidget({ kind })); }
    catch (error) { onError(error.message); }
  }

  function navigate(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menu.current.querySelectorAll('button')];
    const current = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  return <div className="widgets-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={'icon-button' + (open ? ' selected' : '')} aria-label="Widgets" title="Widgets: Timer, Checklist, Planner" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
    }}><WidgetIcon name="widgets"/></button>
    {open && <div ref={menu} id={id} role="menu" aria-label="Widgets" className="widgets-menu-popover" onKeyDown={navigate}>
      <span className="widgets-menu-heading" aria-hidden="true">Widgets</span>
      {['timer', 'checklist', 'planner'].map(kind => <button key={kind} type="button" role="menuitem" onClick={() => void launch(kind)}><WidgetIcon name={kind}/><span>{kind[0].toUpperCase() + kind.slice(1)}</span></button>)}
    </div>}
  </div>;
}
