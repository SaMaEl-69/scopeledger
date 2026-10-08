import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Keyboard, Search } from 'lucide-react';
import { Modal } from './ui';
import './command-menu.css';

export type CommandAction = {
  id: string;
  label: string;
  group?: string;
  detail?: string;
  keywords?: string[];
  icon?: ReactNode;
  /** Use "Mod" for Command on Mac and Control elsewhere. */
  shortcut?: string[];
  disabled?: boolean;
  onSelect: () => void;
};

export type ShortcutDefinition = {
  label: string;
  keys: string[];
  detail?: string;
};

export type WorkspaceShortcut = {
  key: string;
  modifier?: boolean;
  alt?: boolean;
  shift?: boolean;
  allowWhileTyping?: boolean;
  onSelect: () => void;
};

const isApplePlatform = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

export function ShortcutKeys({ keys }: { keys: string[] }) {
  const apple = isApplePlatform();
  return (
    <span
      className="shortcut-keys"
      role="img"
      aria-label={keys
        .map((key) => (key === 'Mod' ? (apple ? 'Command' : 'Control') : key))
        .join(' + ')}
    >
      {keys.map((key, index) => (
        <kbd key={`${key}-${index}`} aria-hidden="true">
          {key === 'Mod' ? (apple ? '⌘' : 'Ctrl') : key === 'Shift' ? '⇧' : key}
        </kbd>
      ))}
    </span>
  );
}

export function isEditingTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
    )
  );
}

/** Register navigation and draft-opening shortcuts; modal tasks keep their own keyboard controls. */
export function useWorkspaceShortcuts(shortcuts: WorkspaceShortcut[], enabled = true) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const dialogOpen = !!document.querySelector('dialog[open]');
      const editing = isEditingTarget(event.target);
      // This application chord must never become a native form submission when
      // action shortcuts are paused by editing, dialogs, or mobile navigation.
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key === 'Enter' &&
        (dialogOpen || editing || !enabled)
      ) {
        event.preventDefault();
        return;
      }
      if (!enabled || event.defaultPrevented || event.repeat || event.isComposing || dialogOpen)
        return;
      const shortcut = shortcuts.find((item) => {
        const wantsModifier = item.modifier ?? true;
        const hasModifier = event.metaKey || event.ctrlKey;
        // Option changes the typed character on Mac (Option+P can be “π”).
        const physicalKey = /^[a-z]$/i.test(item.key)
          ? `Key${item.key.toUpperCase()}`
          : /^\d$/.test(item.key)
            ? `Digit${item.key}`
            : item.key;
        const matchesKey =
          event.key.toLowerCase() === item.key.toLowerCase() ||
          (item.alt && event.code === physicalKey);
        return (
          matchesKey &&
          hasModifier === wantsModifier &&
          event.altKey === (item.alt ?? false) &&
          (item.shift === undefined && item.key === '?'
            ? true
            : event.shiftKey === (item.shift ?? false)) &&
          (item.allowWhileTyping || !editing)
        );
      });
      if (!shortcut) return;
      event.preventDefault();
      shortcut.onSelect();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [shortcuts, enabled]);
}

export function CommandMenu({
  actions,
  onClose,
}: {
  actions: CommandAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | undefined>();
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = useId();
  const matches = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length)
      return actions
        .filter(
          (action) =>
            !['Clients', 'Change requests', 'Documents', 'Reminders'].includes(action.group ?? ''),
        )
        .slice(0, 30);
    return actions.filter((action) => {
      const text = [action.label, action.group, action.detail, ...(action.keywords ?? [])]
        .join(' ')
        .toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [actions, query]);
  const filtered = matches.slice(0, 80);
  const selectable = filtered.filter((action) => !action.disabled);
  const active = selectable.find((action) => action.id === activeId) ?? selectable[0];
  const groups = [...new Set(filtered.map((action) => action.group ?? 'Quick actions'))];
  const optionId = (id: string) => `${listId}-${encodeURIComponent(id)}`;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  useEffect(() => {
    if (active) document.getElementById(optionId(active.id))?.scrollIntoView({ block: 'nearest' });
  }, [active?.id]);

  const choose = (action: CommandAction) => {
    if (action.disabled) return;
    onClose();
    // Let the native dialog close and return focus before opening a draft form.
    window.setTimeout(action.onSelect, 0);
  };
  const move = (direction: number) => {
    if (!selectable.length) return;
    const current = active ? selectable.findIndex((action) => action.id === active.id) : -1;
    const next = (current + direction + selectable.length) % selectable.length;
    setActiveId(selectable[next].id);
  };

  return (
    <Modal title="Find anything" onClose={onClose}>
      <div className="command-menu">
        {matches.length > filtered.length && (
          <p className="field-hint" role="status">
            Showing the first 80 of {matches.length} matches. Add more detail to narrow your search.
          </p>
        )}
        <div className="command-menu-search">
          <Search size={20} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveId(undefined);
            }}
            placeholder="Search projects, requests, documents, clients…"
            aria-label="Search workspace records and actions"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={active ? optionId(active.id) : undefined}
            aria-describedby={hintId}
            autoComplete="off"
            autoFocus
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(event.key === 'ArrowDown' ? 1 : -1);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                if (active) choose(active);
              } else if (
                event.key === 'Home' &&
                !event.shiftKey &&
                !event.metaKey &&
                !event.ctrlKey
              ) {
                // Keep normal cursor movement when the search has text.
                if (!query && selectable[0]) {
                  event.preventDefault();
                  setActiveId(selectable[0].id);
                }
              } else if (event.key === 'End' && !query && selectable.length) {
                event.preventDefault();
                setActiveId(selectable.at(-1)?.id);
              }
            }}
          />
        </div>
        <div
          id={listId}
          className="command-menu-results"
          role="listbox"
          aria-label="Actions and pages"
        >
          {groups.map((group) => (
            <div key={group} className="command-menu-group" role="group" aria-label={group}>
              <div className="command-menu-group-label" aria-hidden="true">
                {group}
              </div>
              {filtered
                .filter((action) => (action.group ?? 'Quick actions') === group)
                .map((action) => (
                  <button
                    key={action.id}
                    id={optionId(action.id)}
                    type="button"
                    role="option"
                    aria-selected={active?.id === action.id}
                    aria-disabled={action.disabled || undefined}
                    className={`command-menu-option${active?.id === action.id ? ' is-active' : ''}`}
                    tabIndex={-1}
                    disabled={action.disabled}
                    onPointerMove={() => {
                      if (!action.disabled) setActiveId(action.id);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(action)}
                  >
                    <span className="command-menu-option-icon" aria-hidden="true">
                      {action.icon ?? <ArrowUpRight size={18} />}
                    </span>
                    <span className="command-menu-option-copy">
                      <strong>{action.label}</strong>
                      {action.detail && <span>{action.detail}</span>}
                    </span>
                    {action.shortcut && <ShortcutKeys keys={action.shortcut} />}
                  </button>
                ))}
            </div>
          ))}
        </div>
        {!filtered.length && (
          <div className="command-menu-empty" role="status">
            <strong>No matches for “{query.trim()}”</strong>
            <p>Try a project name, “new request”, or “documents”.</p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery('');
                searchRef.current?.focus();
              }}
            >
              Clear search
            </button>
          </div>
        )}
        <p id={hintId} className="command-menu-hint">
          <span>
            <ShortcutKeys keys={['↑', '↓']} /> choose
          </span>
          <span>
            <ShortcutKeys keys={['Enter']} /> open
          </span>
          <span>
            <ShortcutKeys keys={['Esc']} /> close
          </span>
        </p>
      </div>
    </Modal>
  );
}

export function KeyboardShortcuts({
  shortcuts,
  onClose,
}: {
  shortcuts: ShortcutDefinition[];
  onClose: () => void;
}) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="keyboard-shortcuts">
        <p className="keyboard-shortcuts-intro">
          <Keyboard size={18} aria-hidden="true" /> Keep the work moving with a few useful keys.
        </p>
        <dl className="keyboard-shortcuts-list">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.label}>
              <dt>
                <strong>{shortcut.label}</strong>
                {shortcut.detail && <span>{shortcut.detail}</span>}
              </dt>
              <dd>
                <ShortcutKeys keys={shortcut.keys} />
              </dd>
            </div>
          ))}
          <div>
            <dt>
              <strong>Close a dialog</strong>
              <span>Unfinished entries are checked before closing.</span>
            </dt>
            <dd>
              <ShortcutKeys keys={['Esc']} />
            </dd>
          </div>
        </dl>
        <p className="keyboard-shortcuts-note">
          Find anything works while typing. Other action and step shortcuts work outside fields.
          Shortcuts pause while a dialog is open. Use Tab to move between controls and Enter to use
          the focused button.
        </p>
      </div>
    </Modal>
  );
}
