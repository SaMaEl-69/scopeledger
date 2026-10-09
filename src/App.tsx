import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  lazy,
  Suspense,
  Fragment,
  type KeyboardEvent,
} from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  History,
  FileCheck2,
  Archive,
  Trash2,
  RotateCcw,
  Upload,
  Info,
  Menu,
  ExternalLink,
  AlertTriangle,
  BookOpen,
  CircleDot,
  Layers3,
  CalendarDays,
  Files,
  Copy,
  Home,
  Moon,
  Sun,
  Monitor,
  Keyboard,
} from 'lucide-react';

import type {
  Baseline,
  Change,
  ChangeTerms,
  Currency,
  Workspace,
  Project,
  Scenario,
} from './domain/types';
import { CURRENCIES, id, now } from './domain/types';
import { compareRecordedDates, recordedDateToDate } from './domain/dates';
import { workspaceCapacity } from './storage/capacity';
import { DeviceStorageStatus } from './storage/DeviceStorageStatus';
import { WORKSPACE_LIMIT_MIB, ENCRYPTED_BACKUP_LIMIT_MIB } from './storage/limits';
import { confirmDefaults, defaultsReviewed } from './domain/setup';
import { readWorkspaceRoute, workspaceRouteUrl } from './navigation';
import {
  calculate,
  formatMoney,
  formatPercent,
  Money,
  parseAmount,
  feeBasisPatch,
  feeTaxPatch,
  validFeeTaxRate,
} from './domain/finance';
import { feeAmounts } from '../shared/fee-math.mjs';
import { deliveryDays, projectDeliveryDate } from './domain/delivery';
import {
  createProject,
  createChange,
  updateChange,
  updateBaseline,
  updateProjectTiming,
  saveDecision,
  recordApproval,
  reconcileChange,
  archiveRecord,
  deleteRecord,
  recoverRecord,
} from './domain/operations';
import { SCENARIOS } from './content/scenarios';
import { canCreateProject, isWithinDemoAllowance } from './domain/access';
import { duplicateProject, localDate, type NavigateTarget } from './domain/commercial';
import { revisionDifferences } from './domain/comparisons';
import { useLicense, licenseRequest } from './licensing/useLicense';
import { ActivationModal } from './licensing/ActivationModal';
import { SupportAction } from './components/SupportAction';
import { createAppearanceController } from '../shared/appearance.mjs';
import { ViewErrorBoundary, ViewRecovery, SaveRecovery } from './components/ViewErrorBoundary';
const ComparisonModal = lazy(() =>
  import('./components/ComparisonModal').then((m) => ({ default: m.ComparisonModal })),
);
const DashboardView = lazy(() =>
  import('./operational/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const CalendarView = lazy(() =>
  import('./operational/CalendarView').then((m) => ({ default: m.CalendarView })),
);
const DocumentsView = lazy(() =>
  import('./documents/DocumentsView').then((m) => ({ default: m.DocumentsView })),
);
const SettingsExtras = lazy(() =>
  import('./toolkit/SettingsExtras').then((m) => ({ default: m.SettingsExtras })),
);
const PlaybookView = lazy(() =>
  import('./toolkit/PlaybookView').then((m) => ({ default: m.PlaybookView })),
);
const ClientResponseComposer = lazy(() =>
  import('./toolkit/ClientResponseComposer').then((m) => ({ default: m.ClientResponseComposer })),
);
import { prepareRestore, MAX_WORKSPACE_BYTES } from './storage/repository';
import { isEncryptedBackup, MAX_ENCRYPTED_BACKUP_BYTES } from './storage/encrypted-backup';
import { BackupSecurityModal } from './components/BackupSecurityModal';
import { useWorkspace } from './storage/useWorkspace';
import { Modal, NumberField, Field, Empty, useDialogFocusOrigin } from './components/ui';
import {
  CommandMenu,
  KeyboardShortcuts,
  ShortcutKeys,
  useWorkspaceShortcuts,
  type CommandAction,
  type ShortcutDefinition,
} from './components/CommandMenu';
import { ProjectSequence, PROJECT_STEPS } from './components/ProjectSequence';
import './workspace-ease.css';
const VIEW_LABELS = {
  workspace: 'Change requests',
  dashboard: 'Overview',
  projects: 'Projects',
  clients: 'Clients',
  settings: 'Settings & backup',
  support: 'Help & support',
  calendar: 'Calendar',
  documents: 'Documents',
  playbook: 'Templates',
};
const CLASSIFICATIONS = ['Addition', 'Included', 'Defect', 'Ambiguous'] as const;
const ROUTES = ['Quote', 'Absorb', 'Exchange', 'Defer'] as const;
const CLASS_HELP = {
  Addition: 'New work beyond the approved scope. Confirm the agreement permits an additional fee.',
  Included: 'Already covered by the agreement. Review the obligation before proposing any fee.',
  Defect:
    'Check the warranty and acceptance criteria. Fixing your own defect may be an existing obligation.',
  Ambiguous:
    'Pause the commercial commitment. Clarify the agreement and obtain written scope confirmation.',
};
const ROUTE_HELP = {
  Quote: 'Propose an additional fee for the agreed change.',
  Absorb: 'Keep the client fee at zero and include the delivery cost.',
  Exchange: 'Remove explicitly agreed future work to offset this request.',
  Defer: 'Keep the request for later. It has no committed fee or cost effects.',
};
function completeBaseline(baseline?: Baseline) {
  if (!baseline?.approvedScope.trim()) return false;
  const errors: Record<string, string> = {};
  const fee = parseAmount(baseline.fee, 'fee', errors, 'Approved fee');
  const target = parseAmount(baseline.target, 'target', errors, 'Target margin');
  parseAmount(baseline.actual, 'actual', errors, 'Actual cost');
  parseAmount(baseline.remaining, 'remaining', errors, 'Remaining cost');
  return !Object.keys(errors).length && !!fee?.greaterThan(0) && !!target?.lessThan(100);
}
function download(body: string, name: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const dateLabel = (value: string, timezone?: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : timezone,
  }).format(recordedDateToDate(value));
const today = () => new Date().toLocaleDateString('en-CA');
const targetLabel = (value: string) => {
  const errors: Record<string, string> = {};
  const n = parseAmount(value, 'target', errors, 'Target margin');
  return n && n.lessThan(100) ? formatPercent(n.toString()) : '—';
};
function BrandGlyph() {
  return (
    <span className="brand-symbol" aria-hidden="true">
      <img
        className="brand-image-light"
        src="/brand/scopeledger-mark.svg?v=5"
        width="36"
        height="36"
        alt=""
      />
      <img
        className="brand-image-dark"
        src="/brand/scopeledger-mark-dark.svg?v=5"
        width="36"
        height="36"
        alt=""
      />
    </span>
  );
}
function BrandLogo() {
  return (
    <span className="brand-lockup" aria-hidden="true">
      <img
        className="brand-image-light"
        src="/brand/scopeledger-logo-light.svg?v=6"
        width="249"
        height="40"
        alt=""
      />
      <img
        className="brand-image-dark"
        src="/brand/scopeledger-logo-dark.svg?v=6"
        width="249"
        height="40"
        alt=""
      />
    </span>
  );
}
export default function App() {
  useDialogFocusOrigin();
  const store = useWorkspace();
  const license = useLicense();
  const w = store.workspace;
  const backupCompletion = useRef<((result: boolean) => void) | null>(null);
  const latestWorkspace = useRef(w);
  latestWorkspace.current = w;
  const [backupRequest, setBackupRequest] = useState<{
    raw: string;
    unlocking: boolean;
    source?: Workspace;
    recordDate?: boolean;
    returnTo?: 'home' | 'restore';
  } | null>(null);
  const [modal, setModal] = useState<
    | null
    | 'scenario'
    | 'baseline'
    | 'project'
    | 'approval'
    | 'reconcile'
    | 'restore'
    | 'backup'
    | 'license'
    | 'revision'
    | 'guide'
    | 'comparison'
    | 'composer'
    | 'duplicate'
    | 'home'
    | 'commands'
    | 'shortcuts'
  >(null);
  const [appearanceController] = useState(() => createAppearanceController());
  const [appearance, setAppearance] = useState(() => appearanceController.getState());
  const [activationPlan, setActivationPlan] = useState<'individual' | 'agency'>('individual');
  const activationIntentConsumed = useRef(false);
  const [homeLeaving, setHomeLeaving] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [homeExportedWorkspace, setHomeExportedWorkspace] = useState<Workspace | null>(null);
  useEffect(() => {
    const unsubscribe = appearanceController.subscribe(setAppearance);
    const stop = appearanceController.start();
    return () => {
      unsubscribe();
      stop();
    };
  }, [appearanceController]);
  useEffect(() => {
    if (store.saveState === 'saved') setHomeError('');
  }, [store.saveState]);
  useEffect(() => {
    if (!w || activationIntentConsumed.current) return;
    activationIntentConsumed.current = true;
    const url = new URL(window.location.href);
    let consumed = false;
    if (url.searchParams.get('activate') === '1') {
      const plan = url.searchParams.get('plan');
      setActivationPlan(plan === 'agency' ? 'agency' : 'individual');
      setModal('license');
      url.searchParams.delete('activate');
      url.searchParams.delete('plan');
      consumed = true;
    }
    if (!consumed) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [w]);
  const [mobileNav, setMobileNav] = useState(false);
  const [compactNav, setCompactNav] = useState(
    () => window.matchMedia('(max-width: 760px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => setCompactNav(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (compactNav && mobileNav)
      document
        .querySelector<HTMLButtonElement>('.sidebar .nav-item.active, .sidebar .brand')
        ?.focus();
  }, [compactNav, mobileNav]);
  useEffect(() => {
    // A drawer must release the page when a device grows into the desktop layout.
    if (!compactNav) setMobileNav(false);
    if (!compactNav || !mobileNav) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileNav(false);
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus(),
      );
    };
    // Safari need not focus a clicked appearance button; Escape still closes the drawer.
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [compactNav, mobileNav]);
  const [decisionReady, setDecisionReady] = useState(false);
  const [toast, setToast] = useState('');
  const [actionError, setActionError] = useState('');
  const [tab, setTab] = useState<'evaluate' | 'history'>('evaluate');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [showArchived, setShowArchived] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [restoreData, setRestoreData] = useState<Workspace | null>(null);
  const [selectedRevision, setSelectedRevision] = useState<string | null>(null);
  const [pendingScenario, setPendingScenario] = useState<Scenario | null>(null);
  const [duplicateId, setDuplicateId] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedCalendarEventId, setSelectedCalendarEventId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [calendarCreateIntent, setCalendarCreateIntent] = useState(0);
  const [documentKindIntent, setDocumentKindIntent] = useState<
    'brief' | 'invoice' | 'credit' | null
  >(null);
  const [flowStep, setFlowStep] = useState(1);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [briefFlow, setBriefFlow] = useState(false);
  const [documentFlowKind, setDocumentFlowKind] = useState<'brief' | 'invoice' | 'credit'>('brief');
  const lastFeeTax = useRef<{ changeId: string; rate: string } | null>(null);
  const [pendingField, setPendingField] = useState('');
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const routeWorkspace = useRef(w);
  routeWorkspace.current = w;
  const routeInitialized = useRef(false);
  const pendingRoute = useRef<NavigateTarget | null>(null);
  useEffect(() => {
    if (!w) return;
    const adoptRoute = (fromHistory = false) => {
      const current = routeWorkspace.current;
      if (!current) return;
      const route = readWorkspaceRoute(current, new URL(window.location.href));
      const target = route?.target ?? { ...current.context };
      const projectId = target.projectId ?? current.context.projectId;
      const changeId =
        target.changeId ??
        current.changes.find(
          (record) => record.projectId === projectId && !record.deletedAt && !record.archivedAt,
        )?.id ??
        '';
      pendingRoute.current = { ...target, projectId, changeId };
      if (
        current.context.view !== target.view ||
        current.context.projectId !== projectId ||
        current.context.changeId !== changeId
      )
        store.mutate({
          ...current,
          context: { ...current.context, view: target.view, projectId, changeId },
        });
      setSelectedDocumentId(target.documentId ?? '');
      setSelectedCalendarEventId(target.eventId ?? '');
      setSelectedClientId(target.clientId ?? '');
      setMobileNav(false);
      if (fromHistory) {
        backupCompletion.current?.(false);
        backupCompletion.current = null;
        setBackupRequest(null);
        setModal(null);
      }
      setBriefFlow(false);
      setPendingField('');
      setFlowStep(
        route?.target.view === 'workspace'
          ? completeBaseline(current.projects.find((project) => project.id === projectId)?.baseline)
            ? 3
            : 2
          : 1,
      );
      if (route?.message) setActionError(route.message);
    };
    if (!routeInitialized.current) {
      routeInitialized.current = true;
      adoptRoute();
    }
    const onPopState = () => adoptRoute(true);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [w?.id]);
  useEffect(() => {
    if (!w || !routeInitialized.current) return;
    const target = {
      ...w.context,
      documentId: selectedDocumentId,
      eventId: selectedCalendarEventId,
      clientId: selectedClientId,
    };
    const next = workspaceRouteUrl(new URL(window.location.href), target);
    if (pendingRoute.current) {
      const expected = workspaceRouteUrl(new URL(window.location.href), pendingRoute.current);
      if (next !== expected) return;
      pendingRoute.current = null;
      window.history.replaceState(null, '', next);
    } else if (
      `${window.location.pathname}${window.location.search}${window.location.hash}` !== next
    ) {
      window.history.pushState(null, '', next);
    }
  }, [
    w?.context.view,
    w?.context.projectId,
    w?.context.changeId,
    selectedDocumentId,
    selectedCalendarEventId,
    selectedClientId,
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  };
  const closeModal = useCallback(() => {
    backupCompletion.current?.(false);
    backupCompletion.current = null;
    setBackupRequest(null);
    setModal(null);
    setActionError('');
    setPendingScenario(null);
    setReplaceConfirmed(false);
  }, []);
  const run = (fn: () => void, message?: string) => {
    try {
      store.clearMutationFailure();
      fn();
      store.assertMutationApplied();
      setActionError('');
      if (message)
        void store
          .flush()
          .then(() => notify(message))
          .catch((e) =>
            setActionError(
              e instanceof Error
                ? e.message
                : 'The update could not be saved. Export a backup before closing.',
            ),
          );
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Please review the details and try again.');
    }
  };
  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next =
      e.key === 'Home'
        ? 'evaluate'
        : e.key === 'End'
          ? 'history'
          : tab === 'evaluate'
            ? 'history'
            : 'evaluate';
    setTab(next);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]');
    buttons[next === 'evaluate' ? 0 : 1]?.focus();
  };
  const setView = (view: Workspace['context']['view']) => {
    setPendingField('');
    setBriefFlow(false);
    if (view === 'workspace' && flowStep > 5) setFlowStep(5);
    if (view !== 'documents') {
      setDocumentKindIntent(null);
      setBriefFlow(false);
    }
    if (view !== 'calendar') setCalendarCreateIntent(0);
    if (w) store.mutate((current) => ({ ...current, context: { ...current.context, view } }));
    setMobileNav(false);
    setActionError('');
    if (compactNav)
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.page-heading h1')?.focus());
  };
  const select = (projectId: string, changeId?: string) => {
    if (!w) return;
    setPendingField('');
    setBriefFlow(false);
    setFlowStep(
      projectId !== w.context.projectId ||
        !completeBaseline(w.projects.find((record) => record.id === projectId)?.baseline)
        ? 2
        : 3,
    );
    const current = w.changes.find(
      (c) => c.projectId === projectId && !c.deletedAt && !c.archivedAt,
    );
    store.mutate({
      ...w,
      context: {
        ...w.context,
        projectId,
        changeId: changeId ?? current?.id ?? '',
        view: 'workspace',
      },
    });
    setSelectedDocumentId('');
    setSelectedCalendarEventId('');
    setTab('evaluate');
    setActionError('');
  };
  const navigate = (target: NavigateTarget) => {
    if (!w) return;
    if (target.view !== 'documents') {
      setDocumentKindIntent(null);
      setBriefFlow(false);
    }
    if (target.view === 'workspace' && target.field) {
      const field = target.field;
      setFlowStep(
        field === 'project-additional-days'
          ? 2
          : ['hours', 'rate', 'outside', 'removed', 'cost-section'].includes(field)
            ? 4
            : [
                  'proposed-fee',
                  'credit',
                  'price-section',
                  'commercial-results',
                  'additional-days',
                  'fee-tax-rate',
                ].includes(field)
              ? 5
              : 3,
      );
    }
    if (target.view !== 'calendar') setCalendarCreateIntent(0);
    store.mutate((current) => {
      const nextProjectId = target.projectId ?? current.context.projectId;
      const nextChangeId =
        target.changeId ??
        current.changes.find(
          (c) => c.id === current.context.changeId && c.projectId === nextProjectId && !c.deletedAt,
        )?.id ??
        current.changes.find((c) => c.projectId === nextProjectId && !c.deletedAt && !c.archivedAt)
          ?.id ??
        '';
      return {
        ...current,
        context: {
          ...current.context,
          view: target.view,
          projectId: nextProjectId,
          changeId: nextChangeId,
        },
      };
    });
    setSelectedDocumentId(target.documentId ?? '');
    setSelectedCalendarEventId(target.eventId ?? '');
    if (target.clientId) setSelectedClientId(target.clientId);
    setPendingField(target.field ?? '');
    setModal(null);
    setMobileNav(false);
    setTab('evaluate');
    if (compactNav && !target.field)
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.page-heading h1')?.focus());
  };
  useLayoutEffect(() => {
    if (!pendingField) return;
    const focusField = () => {
      const element = document.getElementById(pendingField);
      if (!element) return;
      let container = element.parentElement;
      while (container) {
        if (container instanceof HTMLDetailsElement) container.open = true;
        container = container.parentElement;
      }
      if (!element.getClientRects().length) return;
      observer.disconnect();
      clearTimeout(timer);
      element.focus({ preventScroll: true });
      if (document.activeElement === element)
        element.scrollIntoView({
          behavior: 'instant',
          block: 'center',
        });
      else
        setActionError(
          'The requested field cannot be edited in this state. Review its source record.',
        );
      setPendingField('');
    };
    const observer = new MutationObserver(focusField);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      observer.disconnect();
      setActionError(
        'The requested field is not available. Wait for the view to finish loading, then try the readiness link again.',
      );
      setPendingField('');
    }, 15_000);
    focusField();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [pendingField, w?.context.view]);
  const authorizeExtraProject = async () => {
    if (w && canCreateProject(w)) return false;
    await licenseRequest('/api/projects/authorize', {});
    return true;
  };
  const restoreAuthorized = async (data: Workspace) => {
    if (!isWithinDemoAllowance(data)) await licenseRequest('/api/projects/authorize', {});
    await store.restore(data);
    setSelectedDocumentId('');
    setSelectedCalendarEventId('');
    setSelectedClientId('');
  };
  const project =
    w?.projects.find((p) => p.id === w.context.projectId && !p.deletedAt) ??
    w?.projects.find((p) => !p.deletedAt);
  const change =
    w?.changes.find(
      (c) => c.id === w.context.changeId && c.projectId === project?.id && !c.deletedAt,
    ) ?? w?.changes.find((c) => c.projectId === project?.id && !c.deletedAt && !c.archivedAt);
  const client = w?.clients.find((c) => c.id === project?.clientId);
  const changeList = w?.changes.filter((c) => c.projectId === project?.id) ?? [];
  const currency = project?.currency ?? 'USD';
  const symbol =
    new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((x) => x.type === 'currency')?.value ?? currency;
  const money = (v: string | null) => (v === null ? '—' : formatMoney(v, currency));
  const included = w?.reconciliations.find((r) => r.changeId === change?.id);
  const readOnly = !!(change?.includedAt || change?.archivedAt || project?.archivedAt);
  const calc = project && change ? calculate(included?.before ?? project.baseline, change) : null;
  const suggestedFee =
    calc?.changeFloor === null || calc?.changeFloor === undefined
      ? null
      : change?.feeMode === 'including-tax' && !calc.errors.taxRate
        ? feeAmounts(calc.changeFloor, change.taxRate ?? '0').total
        : calc.changeFloor;
  useEffect(() => {
    const update = () => {
      const rect = document.getElementById('commercial-results')?.getBoundingClientRect();
      setDecisionReady(!!rect && rect.top < 80 && rect.bottom > 120);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, [w?.context.view, change?.id, tab]);
  const patch = (p: Partial<ChangeTerms>) => {
    if (change) run(() => store.mutate((x) => updateChange(x, change.id, p)));
  };
  useEffect(() => {
    if (change && validFeeTaxRate(change.taxRate ?? '0'))
      lastFeeTax.current = { changeId: change.id, rate: change.taxRate ?? '0' };
  }, [change?.id, change?.taxRate]);
  const changeTaxRate = (taxRate: string) => {
    if (!change) return;
    const previous = lastFeeTax.current;
    patch(
      feeTaxPatch(
        previous?.changeId === change.id ? { ...change, taxRate: previous.rate } : change,
        taxRate,
      ),
    );
  };
  const baselineComplete = completeBaseline(project?.baseline);
  const costNeedsReview =
    change?.route !== 'Defer' &&
    !!calc &&
    ['hours', 'rate', 'outside', 'removed', 'removedScope'].some((key) => !!calc.errors[key]);
  const missingFlowStep = !baselineComplete
    ? 2
    : !change?.title.trim() || !change.request.trim() || !change.deliverables.trim()
      ? 3
      : costNeedsReview
        ? 4
        : change.route !== 'Defer' && (!calc?.valid || !change.contractConfirmed)
          ? 5
          : 6;
  const newChange = () => {
    if (project)
      run(() => {
        store.mutate((x) => createChange(x, project.id));
        setTab('evaluate');
        setFlowStep(baselineComplete ? 3 : 2);
        setPendingField(baselineComplete ? 'request-title' : '');
        setMobileNav(false);
        setSelectedDocumentId('');
        setSelectedCalendarEventId('');
        setDocumentKindIntent(null);
        setDocumentFlowKind('brief');
        setCalendarCreateIntent(0);
      }, 'New request created');
  };
  const openNewProject = () => {
    if (!w) return;
    setActionError('');
    setMobileNav(false);
    setModal(canCreateProject(w, license.status.active) ? 'project' : 'license');
  };
  const openDocuments = (kind?: 'brief' | 'invoice' | 'credit', step?: number) => {
    if (!w) return;
    navigate({ view: 'documents', projectId: project?.id, changeId: change?.id });
    setDocumentKindIntent(kind ?? null);
    setBriefFlow(!!step);
    if (kind) setDocumentFlowKind(kind);
    if (step) setFlowStep(step);
  };
  const openNewReminder = () => {
    if (!w) return;
    navigate({ view: 'calendar', projectId: project?.id, changeId: change?.id });
    setCalendarCreateIntent((value) => value + 1);
  };
  const jumpToStep = (step: number) => {
    if (!w) return;
    if (step >= 6) {
      if (missingFlowStep < 6 && !readOnly) {
        navigate({ view: 'workspace', projectId: project?.id, changeId: change?.id });
        setFlowStep(missingFlowStep);
        setActionError(
          [
            '',
            '',
            'Complete the project baseline first.',
            'Describe the change and its deliverables first.',
            'Complete the delivery estimate first.',
            'Choose a valid fee and confirm the agreement first.',
          ][missingFlowStep],
        );
        return;
      }
      openDocuments(documentFlowKind, step === 7 && !(briefFlow && flowStep >= 6) ? 6 : step);
      return;
    }
    setFlowStep(step);
    navigate({
      view: 'workspace',
      projectId: project?.id,
      changeId: change?.id,
      field:
        step === 1
          ? 'current-project'
          : step === 2
            ? 'project-baseline'
            : step === 3
              ? 'request-section'
              : step === 4
                ? 'cost-section'
                : step === 5
                  ? 'price-section'
                  : undefined,
    });
    // Readiness navigation also selects the matching panel; preserve the requested step.
    setFlowStep(step);
  };
  const shortcutHelp: ShortcutDefinition[] = [
    { label: 'Find an action, page, or project', keys: ['Mod', 'K'] },
    { label: 'New project', keys: ['Alt', 'Shift', 'P'] },
    { label: 'New request', keys: ['Mod', 'Shift', 'Enter'] },
    { label: 'Open documents', keys: ['Alt', 'Shift', 'D'] },
    { label: 'Add reminder', keys: ['Alt', 'Shift', 'R'] },
    ...PROJECT_STEPS.map(({ title }, index) => ({
      label: title,
      keys: ['Alt', String(index + 1)],
    })),
    {
      label: 'Show keyboard shortcuts',
      keys: ['?'],
      detail: 'When you are not typing in a field.',
    },
  ];
  useWorkspaceShortcuts(
    [
      { key: 'k', allowWhileTyping: true, onSelect: () => setModal('commands') },
      { key: 'p', modifier: false, alt: true, shift: true, onSelect: openNewProject },
      {
        key: 'Enter',
        shift: true,
        onSelect: () => {
          if (project && !project.archivedAt) newChange();
        },
      },
      { key: 'd', modifier: false, alt: true, shift: true, onSelect: () => openDocuments() },
      { key: 'r', modifier: false, alt: true, shift: true, onSelect: openNewReminder },
      ...[1, 2, 3, 4, 5, 6, 7].map((step) => ({
        key: String(step),
        modifier: false,
        alt: true,
        onSelect: () => jumpToStep(step),
      })),
      { key: '?', modifier: false, onSelect: () => setModal('shortcuts') },
    ],
    !!w && !store.recovery && !modal && !mobileNav,
  );
  const exportWorkspace = (recordBackupDate: boolean): Promise<boolean> => {
    if (!w) return Promise.resolve(false);
    let completed!: (value: boolean) => void;
    const result = new Promise<boolean>((resolve) => {
      completed = resolve;
    });
    backupCompletion.current?.(false);
    backupCompletion.current = completed;
    try {
      setBackupRequest({
        raw: store.serialize(),
        unlocking: false,
        source: w,
        recordDate: recordBackupDate,
        ...(modal === 'home' || modal === 'restore' ? { returnTo: modal } : {}),
      });
      setModal('backup');
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Backup could not be prepared.');
      completed(false);
      backupCompletion.current = null;
    }
    return result;
  };
  const backup = () => {
    void exportWorkspace(true);
  };
  const leaveForHome = async (recoveryNavigation = false) => {
    if (homeLeaving) return;
    setHomeLeaving(true);
    try {
      // A conflict or failed write requires a backup of this exact workspace.
      // Successful writes always drain before the browser leaves this origin.
      if (store.saveState === 'failed' || (homeError && recoveryNavigation)) {
        if (!w || homeExportedWorkspace !== w) return;
      } else {
        await store.flush();
      }
      window.location.assign('/home/');
    } catch (reason) {
      setHomeError(reason instanceof Error ? reason.message : 'Current edits could not be saved.');
      setModal('home');
    } finally {
      setHomeLeaving(false);
    }
  };
  const requestHome = () => {
    setHomeExportedWorkspace(null);
    setHomeError('');
    if (store.saveState === 'failed') {
      setModal('home');
      return;
    }
    void leaveForHome();
  };
  const unavailable = (name: string, dialog = false) => {
    const recovery = (
      <ViewRecovery
        name={name}
        workspace={w}
        onBackup={() => exportWorkspace(false)}
        onWorkspace={() => {
          closeModal();
          setView('workspace');
        }}
        onSettings={
          w?.context.view === 'settings'
            ? undefined
            : () => {
                closeModal();
                setView('settings');
              }
        }
      />
    );
    return dialog ? (
      <Modal title={`Unable to open ${name}`} onClose={closeModal}>
        {recovery}
      </Modal>
    ) : (
      recovery
    );
  };
  const readBackup = async (file: File) => {
    try {
      if (file.size > MAX_ENCRYPTED_BACKUP_BYTES)
        throw Error(
          `Choose a JSON backup up to ${WORKSPACE_LIMIT_MIB} MiB or an encrypted backup up to ${ENCRYPTED_BACKUP_LIMIT_MIB} MiB.`,
        );
      const raw = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (isEncryptedBackup(raw)) {
        setBackupRequest({ raw, unlocking: true });
        setModal('backup');
        setActionError('');
        return;
      }
      const data = prepareRestore(raw, !license.status.active);
      setRestoreData(data);
      setModal('restore');
      setActionError('');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'This backup could not be read.');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  const backupDialog = modal === 'backup' && backupRequest && (
    <BackupSecurityModal
      raw={backupRequest.raw}
      unlocking={backupRequest.unlocking}
      onClose={() => {
        const returning = backupRequest.returnTo;
        setBackupRequest(null);
        closeModal();
        if (returning) setModal(returning);
      }}
      onComplete={(raw, encrypted) => {
        if (backupRequest.unlocking) {
          const data = prepareRestore(raw, !license.status.active);
          setRestoreData(data);
          setBackupRequest(null);
          setModal('restore');
          setActionError('');
        } else {
          download(raw, `scopeledger-backup-${today()}.${encrypted ? 'slbackup' : 'json'}`);
          const current = latestWorkspace.current;
          if (backupRequest.recordDate && current && current === backupRequest.source)
            store.mutate({ ...current, context: { ...current.context, lastBackupAt: now() } });
          if (backupRequest.returnTo === 'home' && backupRequest.source)
            setHomeExportedWorkspace(backupRequest.source);
          const returning = backupRequest.returnTo;
          backupCompletion.current?.(true);
          backupCompletion.current = null;
          setBackupRequest(null);
          closeModal();
          if (returning) setModal(returning);
          notify(
            encrypted
              ? 'Encrypted backup downloaded. Keep your passphrase separately.'
              : 'JSON backup downloaded. This file is unencrypted; keep it private.',
          );
        }
      }}
    />
  );
  const navItems: [Workspace['context']['view'], typeof LayoutDashboard, string][] = [
    ['dashboard', LayoutDashboard, 'Overview'],
    ['projects', FolderKanban, 'Projects'],
    ['workspace', Layers3, 'Change requests'],
    ['documents', Files, 'Documents'],
    ['calendar', CalendarDays, 'Calendar'],
    ['clients', Users, 'Clients'],
    ['playbook', BookOpen, 'Templates'],
  ];
  if (store.recovery)
    return (
      <main className="recovery-screen">
        <div className="brand" role="img" aria-label="ScopeLedger">
          <BrandLogo />
        </div>
        <div className="card">
          <AlertTriangle size={30} />
          <h1>Recover your workspace</h1>
          <p>{store.recovery.reason}</p>
          <p>The unreadable record is preserved. Download it before replacing the workspace.</p>
          <div className="button-row">
            <button
              className="button secondary"
              onClick={() => {
                setBackupRequest({ raw: store.recovery!.raw, unlocking: false });
                setModal('backup');
              }}
            >
              <Download size={16} /> Download recovery data
            </button>
            {store.previous && (
              <button
                className="button primary"
                onClick={() => {
                  setRestoreData(store.previous);
                  setModal('restore');
                }}
              >
                Restore previous saved version
              </button>
            )}
            <button className="button secondary" onClick={() => inputRef.current?.click()}>
              Choose backup
            </button>
          </div>
          {actionError && <p className="field-error">{actionError}</p>}
          <input
            ref={inputRef}
            type="file"
            accept=".json,.slbackup,application/json"
            data-testid="backup-file"
            hidden
            onChange={(e) => e.target.files?.[0] && void readBackup(e.target.files[0])}
          />
          {modal === 'restore' && restoreData && (
            <RestoreModal
              data={restoreData}
              onClose={closeModal}
              onBackup={() => {
                setBackupRequest({
                  raw: store.recovery!.raw,
                  unlocking: false,
                  returnTo: 'restore',
                });
                setModal('backup');
              }}
              onRestore={async () => {
                await store.restore(restoreData);
                closeModal();
              }}
            />
          )}
        </div>
        {backupDialog}
      </main>
    );
  if (!w)
    return (
      <main className="loading-screen">
        <span className="brand-mark">
          <BrandGlyph />
        </span>
        <p>Opening your local workspace…</p>
      </main>
    );
  const view = w.context.view;
  const visibleProjects = w.projects
    .filter(
      (p) =>
        (showTrash ? !!p.deletedAt : !p.deletedAt) &&
        (showArchived || !p.archivedAt) &&
        `${p.name} ${w.clients.find((c) => c.id === p.clientId)?.name ?? ''}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : compareRecordedDates(b.updatedAt, a.updatedAt),
    );
  const headerAction =
    view === 'settings' ? (
      <button className="button primary" onClick={backup}>
        <Download size={16} /> Export backup
      </button>
    ) : null;
  const activeProjects = w.projects.filter((item) => !item.deletedAt && !item.archivedAt);
  const capacity = workspaceCapacity(w);
  const commandActions: CommandAction[] = [
    {
      id: 'new-project',
      label: 'New project',
      group: 'Start something',
      detail: 'Set up a project and client.',
      icon: <FolderKanban size={18} />,
      shortcut: ['Alt', 'Shift', 'P'],
      onSelect: openNewProject,
    },
    {
      id: 'new-request',
      label: 'New request',
      group: 'Start something',
      detail:
        project && !project.archivedAt
          ? `Add a request to ${project.name}.`
          : 'Choose an active project first.',
      icon: <Plus size={18} />,
      shortcut: ['Mod', 'Shift', 'Enter'],
      disabled: !project || !!project.archivedAt,
      onSelect: newChange,
    },
    {
      id: 'brief',
      label: 'Prepare a client brief',
      group: 'Start something',
      keywords: ['document', 'PDF', 'quote'],
      disabled: !project || !change,
      icon: <Files size={18} />,
      onSelect: () => openDocuments('brief'),
    },
    {
      id: 'invoice',
      label: 'Prepare an invoice',
      group: 'Start something',
      detail: 'Record approval before issuing.',
      keywords: ['billing', 'document'],
      disabled: !project || !change,
      icon: <FileCheck2 size={18} />,
      onSelect: () => openDocuments('invoice'),
    },
    {
      id: 'reminder',
      label: 'Add reminder',
      group: 'Start something',
      keywords: ['calendar', 'follow-up', 'task'],
      shortcut: ['Alt', 'Shift', 'R'],
      icon: <CalendarDays size={18} />,
      onSelect: openNewReminder,
    },
    ...navItems.map(([key, Icon, label]) => ({
      id: `page-${key}`,
      label,
      group: 'Pages',
      shortcut: key === 'documents' ? ['Alt', 'Shift', 'D'] : undefined,
      icon: <Icon size={18} />,
      onSelect: () => setView(key),
    })),
    {
      id: 'settings',
      label: 'Settings & backup',
      group: 'Pages',
      keywords: ['branding', 'agency', 'tax', 'payment'],
      icon: <Settings2 size={18} />,
      onSelect: () => setView('settings'),
    },
    {
      id: 'backup',
      label: 'Export workspace backup',
      group: 'Tools',
      keywords: ['download', 'recovery', 'save'],
      icon: <Download size={18} />,
      onSelect: backup,
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      group: 'Tools',
      icon: <Keyboard size={18} />,
      onSelect: () => setModal('shortcuts'),
    },
    {
      id: 'help',
      label: 'Help & support',
      group: 'Tools',
      icon: <CircleHelp size={18} />,
      onSelect: () => setView('support'),
    },
    ...activeProjects
      .sort((a, b) => compareRecordedDates(b.updatedAt, a.updatedAt))
      .map((item) => ({
        id: `project-${item.id}`,
        label: item.name || 'Untitled project',
        detail: w.clients.find((record) => record.id === item.clientId)?.name || 'No client',
        group: 'Projects',
        icon: <FolderKanban size={18} />,
        onSelect: () => select(item.id),
      })),
    ...w.clients.map((item) => ({
      id: `client-${item.id}`,
      label: item.name || 'Unnamed client',
      group: 'Clients',
      detail: item.email,
      keywords: [item.contact, item.notes],
      icon: <Users size={18} />,
      onSelect: () => navigate({ view: 'clients', clientId: item.id }),
    })),
    ...w.changes
      .filter(
        (item) =>
          !item.deletedAt &&
          w.projects.some((project) => project.id === item.projectId && !project.deletedAt),
      )
      .map((item) => ({
        id: `change-${item.id}`,
        label: item.title || 'Untitled request',
        group: 'Change requests',
        detail: `${w.projects.find((project) => project.id === item.projectId)?.name} · ${item.status}`,
        keywords: [item.request, item.deliverables, item.route],
        icon: <Layers3 size={18} />,
        onSelect: () =>
          navigate({ view: 'workspace', projectId: item.projectId, changeId: item.id }),
      })),
    ...w.documents
      .filter(
        (item) =>
          item.snapshot &&
          w.projects.some((project) => project.id === item.projectId && !project.deletedAt),
      )
      .map((item) => ({
        id: `document-${item.id}`,
        label: item.snapshot!.reference,
        group: 'Documents',
        detail: `${item.snapshot!.projectName} · ${item.snapshot!.changeTitle} · ${item.kind}`,
        icon: <Files size={18} />,
        onSelect: () =>
          navigate({
            view: 'documents',
            projectId: item.projectId,
            changeId: item.changeId,
            documentId: item.id,
          }),
      })),
    ...w.calendarEvents
      .filter((item) => !item.deletedAt)
      .map((item) => ({
        id: `event-${item.id}`,
        label: item.title,
        group: 'Reminders',
        detail: item.startsAt,
        icon: <CalendarDays size={18} />,
        onSelect: () =>
          navigate({ view: 'calendar', eventId: item.id, projectId: item.projectId || undefined }),
      })),
  ];
  const baselineNeedsReview = !baselineComplete;
  const nextStep = PROJECT_STEPS[Math.min(flowStep, 7) - 1].title;
  const nextAction =
    flowStep === 1
      ? 'Continue to baseline'
      : flowStep === 2
        ? baselineComplete
          ? 'Continue to change'
          : 'Complete baseline'
        : flowStep === 3
          ? 'Continue to costs'
          : flowStep === 4
            ? 'Continue to fee'
            : documentFlowKind === 'invoice'
              ? 'Review the invoice'
              : documentFlowKind === 'credit'
                ? 'Review the credit note'
                : 'Review the brief';
  const openNextStep = () => {
    if (flowStep === 1) {
      jumpToStep(2);
      return;
    }
    if (flowStep === 2) {
      if (!baselineComplete) {
        setModal('baseline');
        return;
      }
      if (!change) {
        newChange();
        return;
      }
      jumpToStep(3);
      return;
    }
    if (
      flowStep === 3 &&
      (!change?.title.trim() || !change.request.trim() || !change.deliverables.trim())
    ) {
      setActionError('Add the change title, description and deliverables before reviewing costs.');
      return;
    }
    if (flowStep === 4 && costNeedsReview) {
      setActionError('Complete the delivery estimate before choosing a fee.');
      return;
    }
    jumpToStep(flowStep + 1);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to workspace
      </a>
      <aside
        id="workspace-navigation"
        className={`sidebar ${mobileNav ? 'open' : ''}`}
        aria-label="Workspace navigation"
        inert={compactNav && !mobileNav}
        aria-hidden={compactNav && !mobileNav ? true : undefined}
        onKeyDown={(event) => {
          if (!compactNav || !mobileNav) return;
          if (event.key === 'Tab') {
            const buttons = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), a[href]',
              ),
            ].filter((button) => button.getClientRects().length);
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault();
              buttons.at(-1)?.focus();
            } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
              event.preventDefault();
              buttons[0]?.focus();
            }
          }
        }}
      >
        <button
          className="brand"
          aria-label="ScopeLedger overview"
          onClick={() => setView('dashboard')}
        >
          <BrandLogo />
        </button>
        <button
          type="button"
          className="agency-switch"
          aria-label="Open workspace settings"
          onClick={() => setView('settings')}
        >
          <div className="agency-avatar">
            {w.agency.logoDataUrl ? (
              <img src={w.agency.logoDataUrl} alt="Agency logo" />
            ) : (
              w.agency.name.slice(0, 1)
            )}
          </div>
          <div>
            <strong>{w.agency.name}</strong>
            <span>Local workspace</span>
          </div>
          <span className="local-dot" title="Stored on this device" />
        </button>
        <div className="nav-label">YOUR WORK</div>
        <nav>
          <a
            className="nav-item home-link"
            href="/home/"
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              requestHome();
            }}
          >
            <Home size={18} /> Website <ArrowUpRight size={14} className="home-link-arrow" />
          </a>
          {navItems.map(([key, Icon, label]) => (
            <Fragment key={key}>
              {key === 'clients' && <div className="nav-label nav-tools-label">PEOPLE & TOOLS</div>}
              <button
                className={`nav-item ${view === key ? 'active' : ''}`}
                onClick={() => setView(key)}
                aria-current={view === key ? 'page' : undefined}
              >
                <Icon size={18} />
                {label}
                {key === 'projects' && (
                  <span className="nav-count">
                    {w.projects.filter((p) => !p.deletedAt && !p.archivedAt).length}
                  </span>
                )}
              </button>
            </Fragment>
          ))}
        </nav>
        <div className="nav-label recent-label">RECENT PROJECTS</div>
        <div className="recent-projects">
          {w.projects
            .filter((p) => !p.deletedAt && !p.archivedAt)
            .sort((a, b) => compareRecordedDates(b.updatedAt, a.updatedAt))
            .slice(0, 5)
            .map((p) => (
              <button
                className={p.id === project?.id && view === 'workspace' ? 'selected' : ''}
                key={p.id}
                onClick={() => select(p.id)}
              >
                <span className="project-dot" />
                {p.name}
                <ChevronRight size={14} />
              </button>
            ))}
        </div>
        <div className="sidebar-bottom">
          <div className="workspace-theme-control" role="group" aria-label="Appearance">
            <span>Appearance</span>
            <div className="theme-options">
              <button
                type="button"
                aria-pressed={appearance.preference === 'system'}
                onClick={() => appearanceController.setPreference('system')}
              >
                <Monitor size={15} aria-hidden="true" /> <span>System</span>
              </button>
              <button
                type="button"
                aria-pressed={appearance.preference === 'light'}
                onClick={() => appearanceController.setPreference('light')}
              >
                <Sun size={15} aria-hidden="true" /> <span>Light</span>
              </button>
              <button
                type="button"
                aria-pressed={appearance.preference === 'dark'}
                onClick={() => appearanceController.setPreference('dark')}
              >
                <Moon size={15} aria-hidden="true" /> <span>Dark</span>
              </button>
            </div>
            <p className="appearance-hint">
              {appearance.preference === 'system'
                ? `Follows your device · ${appearance.theme === 'dark' ? 'Dark' : 'Light'}`
                : 'Choose System to match your device.'}
            </p>
          </div>
          <div className="demo-card">
            <div>
              <span className="demo-tag">
                {license.status.active
                  ? `${license.status.plan?.toUpperCase()} ACTIVATED`
                  : 'DEMO WORKSPACE'}
              </span>
              <LockKeyhole size={15} />
            </div>
            <p>
              {license.status.active
                ? 'Additional projects and PDF downloads. Independent local workspace.'
                : 'One sample. One project. Try the complete decision workflow.'}
            </p>
            <button onClick={() => setModal('license')}>
              View activation options <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
          >
            <Settings2 size={18} /> Settings & backup
          </button>
          <button
            className={`nav-item ${view === 'support' ? 'active' : ''}`}
            onClick={() => setView('support')}
          >
            <LifeBuoy size={18} /> Help & support
          </button>
          <button
            className="nav-item"
            onClick={() => {
              setMobileNav(false);
              setModal('shortcuts');
            }}
          >
            <Keyboard size={18} /> Keyboard shortcuts
          </button>
          <div className="device-note">
            <ShieldCheck size={13} /> Private to this browser
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell" inert={compactNav && mobileNav}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Open navigation"
              aria-controls="workspace-navigation"
              aria-expanded={mobileNav}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{VIEW_LABELS[view]}</strong>
          </div>
          <div className="topbar-tools">
            <button
              className="quick-find"
              onClick={() => setModal('commands')}
              aria-label="Find anything"
              aria-keyshortcuts="Meta+K Control+K"
            >
              <Search size={17} />
              <span>Find anything</span>
              <ShortcutKeys keys={['Mod', 'K']} />
            </button>
            <span className={`save-indicator ${store.saveState}`} role="status">
              {store.saveState === 'saved' ? (
                <CheckCheck size={15} />
              ) : store.saveState === 'failed' ? (
                <AlertTriangle size={15} />
              ) : (
                <CircleDot size={15} />
              )}{' '}
              {store.saveState === 'saved'
                ? 'Saved on this device'
                : store.saveState === 'saving'
                  ? 'Saving…'
                  : 'Not saved'}
            </span>
            <button
              className="icon-button help-button"
              onClick={() => setModal('guide')}
              aria-label="Open workflow guide"
            >
              <CircleHelp size={19} />
            </button>
            <button
              type="button"
              className="user-avatar"
              aria-label="Open agency settings"
              onClick={() => setView('settings')}
            >
              {w.agency.logoDataUrl ? (
                <img src={w.agency.logoDataUrl} alt="" />
              ) : (
                w.agency.name.slice(0, 1)
              )}
            </button>
          </div>
        </header>
        <main id="main-content" className="page-content">
          {capacity.fraction >= 0.8 && view !== 'settings' && (
            <div className="alert capacity-alert" role="status">
              <Info size={18} />
              <span>
                Workspace storage is {Math.floor(capacity.fraction * 100)}% full. Back up your work
                and review image sizes before adding more.
              </span>
              <button className="text-button" onClick={() => setView('settings')}>
                Review storage
              </button>
            </div>
          )}
          {store.migrationNotice && (
            <div className="alert success" role="status">
              <CheckCheck size={17} />
              <span>{store.migrationNotice}</span>
            </div>
          )}
          {store.error && (
            <div className="alert error" role="alert">
              <AlertTriangle size={18} />
              <SaveRecovery
                error={store.error}
                workspace={w}
                onBackup={() => exportWorkspace(false)}
                onRetry={() => void store.flush().catch(() => {})}
              />
            </div>
          )}
          <div
            className={`page-heading ${view === 'workspace' && !showAllSteps ? 'flow-page-heading' : ''}`}
          >
            <div>
              <div className="eyebrow">
                {view === 'documents' && briefFlow
                  ? `STEP ${flowStep} OF 7`
                  : view === 'workspace'
                    ? 'PROJECT WORKFLOW'
                    : 'YOUR WORKSPACE'}
              </div>
              <h1 tabIndex={-1}>
                {view === 'documents' && briefFlow
                  ? flowStep === 6 && documentFlowKind !== 'brief'
                    ? documentFlowKind === 'invoice'
                      ? 'Review the invoice'
                      : 'Review the credit note'
                    : PROJECT_STEPS[flowStep - 1].title
                  : VIEW_LABELS[view]}
              </h1>
              <p>
                {view === 'documents' && briefFlow
                  ? documentFlowKind !== 'brief'
                    ? 'Review the approved fee, tax, billing details and payment terms.'
                    : PROJECT_STEPS[flowStep - 1].detail
                  : view === 'workspace'
                    ? 'From an approved project to a clear client brief.'
                    : view === 'dashboard'
                      ? 'Your next actions, upcoming work, and unpaid invoices.'
                      : view === 'projects'
                        ? 'Choose a project to continue, or start a new one.'
                        : view === 'clients'
                          ? 'Client context, connected to your local projects.'
                          : view === 'settings'
                            ? 'Workspace defaults, safe backups, and device access.'
                            : view === 'calendar'
                              ? 'Deadlines and follow-ups connected to your project records.'
                              : view === 'documents'
                                ? 'Prepare client documents, preserve issued values, and track manual payments.'
                                : view === 'playbook'
                                  ? 'Reusable scenarios, assumptions, and client wording for the next request.'
                                  : 'Practical guidance for protecting project margins.'}
              </p>
            </div>
            {headerAction}
          </div>
          {!((view === 'documents' && briefFlow) || (view === 'workspace' && !showAllSteps)) && (
            <div className="workspace-launch" role="region" aria-label="Everyday actions">
              <div className="workspace-launch-actions">
                <button
                  className="button secondary"
                  onClick={openNewProject}
                  aria-keyshortcuts="Alt+Shift+P"
                >
                  <FolderKanban size={16} /> New project
                </button>
                <button
                  className="button secondary"
                  onClick={newChange}
                  aria-keyshortcuts="Meta+Shift+Enter Control+Shift+Enter"
                  disabled={!project || !!project.archivedAt}
                  title={
                    !project || project.archivedAt ? 'Choose an active project first' : undefined
                  }
                >
                  <Plus size={16} /> New request
                </button>
                <button className="button secondary" onClick={() => openDocuments()}>
                  <Files size={16} /> Create document
                </button>
                <button
                  className="button secondary"
                  onClick={openNewReminder}
                  aria-keyshortcuts="Alt+Shift+R"
                >
                  <CalendarDays size={16} /> Add reminder
                </button>
              </div>
              <button className="text-button shortcut-help" onClick={() => setModal('shortcuts')}>
                <Keyboard size={16} /> Shortcuts
              </button>
            </div>
          )}
          {actionError && (view !== 'workspace' || showAllSteps) && (
            <div className="alert error" role="alert">
              <AlertTriangle size={17} />
              <span>{actionError}</span>
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setActionError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === 'workspace' && project && (
            <div
              className={`project-flow ${showAllSteps ? 'all-steps' : 'focused'} flow-stage-${flowStep}`}
            >
              <div className="flow-display-controls">
                <span>
                  {project.name}
                  {readOnly && <span className="badge">Read only</span>}
                </span>
                <button
                  className="text-button"
                  aria-pressed={showAllSteps}
                  onClick={() => setShowAllSteps((value) => !value)}
                >
                  {showAllSteps ? 'Focus on one step' : 'Show all steps'}
                </button>
              </div>
              <div className="request-route">
                <ProjectSequence
                  step={flowStep}
                  onSelect={jumpToStep}
                  documentKind={documentFlowKind}
                />
                <div className="request-next">
                  <div>
                    <span className="eyebrow">STEP {flowStep} OF 7</span>
                    <strong
                      role={!showAllSteps ? 'heading' : undefined}
                      aria-level={!showAllSteps ? 2 : undefined}
                    >
                      {nextStep}
                    </strong>
                    <span>{PROJECT_STEPS[flowStep - 1].detail}</span>
                  </div>
                  {showAllSteps && (
                    <button className="button primary" onClick={openNextStep}>
                      {nextAction}
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              </div>
              {!showAllSteps && flowStep === 1 && (
                <div className="project-choice-actions">
                  <button className="text-button" onClick={openNewProject}>
                    <Plus size={15} /> New project
                  </button>
                </div>
              )}
              <div className="project-picker-row">
                <Field label="Current project">
                  <select
                    id="current-project"
                    aria-label="Current project"
                    value={project.id}
                    onChange={(event) => select(event.target.value)}
                  >
                    {project.archivedAt && (
                      <option value={project.id}>{project.name} · Archived</option>
                    )}
                    {activeProjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.sample ? ' · Sample' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                {change && showAllSteps && (
                  <Field label="Current request">
                    <select
                      aria-label="Switch current change"
                      value={change.id}
                      onChange={(e) => select(project.id, e.target.value)}
                    >
                      {changeList
                        .filter((c) => (!c.deletedAt && !c.archivedAt) || c.id === change.id)
                        .map((c, i) => (
                          <option key={c.id} value={c.id}>
                            {i + 1}. {c.title || 'Untitled request'}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
              </div>
              <div className="project-context">
                <div className="project-avatar">
                  <FolderKanban size={22} />
                </div>
                <div>
                  <div className="context-title">
                    {project.name}
                    {project.sample && <span className="badge sample">Sample project</span>}
                    {project.archivedAt && <span className="badge">Archived</span>}
                  </div>
                  <div className="context-details">
                    {client?.name || 'No client'}
                    <span>·</span>
                    {currency} <span>·</span>{' '}
                    {change
                      ? `Change ${changeList.filter((c) => !c.deletedAt).findIndex((c) => c.id === change.id) + 1} / Revision ${change.revision}`
                      : 'No changes yet'}
                  </div>
                </div>
                <button className="text-button" onClick={() => setModal('baseline')}>
                  {showAllSteps ? 'Review baseline' : 'Edit baseline'} <ArrowUpRight size={15} />
                </button>
              </div>
              <details className="project-planning-disclosure">
                <summary>
                  Project planning{' '}
                  <span>
                    {project.state === 'on-hold'
                      ? 'On hold'
                      : project.state === 'completed'
                        ? 'Completed'
                        : 'Active'}
                    {projectDeliveryDate(project)
                      ? ` · Due ${dateLabel(projectDeliveryDate(project)!, w.agency.timezone)}`
                      : ''}
                  </span>
                  <ChevronDown size={15} />
                </summary>
                <div className="project-planning two-fields">
                  <Field label="Project state">
                    <select
                      aria-label="Project state"
                      disabled={!!project.archivedAt}
                      value={project.state ?? 'active'}
                      onChange={(e) =>
                        store.mutate((x) => ({
                          ...x,
                          projects: x.projects.map((p) =>
                            p.id === project.id
                              ? {
                                  ...p,
                                  state: e.target.value as Project['state'],
                                  updatedAt: now(),
                                }
                              : p,
                          ),
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="on-hold">On hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </Field>
                  <Field
                    label="Project deadline"
                    hint="Original calendar deadline. Additional project days below extend this date."
                  >
                    <input
                      type="date"
                      aria-label="Project deadline"
                      disabled={!!project.archivedAt}
                      value={project.deadline ?? ''}
                      onChange={(e) =>
                        store.mutate((x) =>
                          updateProjectTiming(x, project.id, { deadline: e.target.value || null }),
                        )
                      }
                    />
                  </Field>
                  <NumberField
                    id="project-additional-days"
                    label="Additional project days"
                    suffix="days"
                    step="1"
                    disabled={!!project.archivedAt}
                    value={project.additionalDays ?? '0'}
                    onChange={(additionalDays) =>
                      store.mutate((x) => updateProjectTiming(x, project.id, { additionalDays }))
                    }
                    error={
                      deliveryDays(project.additionalDays, 36500) === null
                        ? 'Enter whole calendar days from 0 to 36,500.'
                        : undefined
                    }
                    hint={
                      projectDeliveryDate(project)
                        ? `Adjusted delivery: ${dateLabel(projectDeliveryDate(project)!, w.agency.timezone)}. Approved changes add their days here when included in the baseline.`
                        : 'Calendar days. Set a deadline to see the adjusted delivery date.'
                    }
                  />
                </div>
              </details>
              <details
                className="project-numbers-disclosure"
                id="project-baseline"
                tabIndex={-1}
                open={baselineNeedsReview || flowStep === 2}
              >
                <summary>
                  Project numbers <span>Approved fee {money(project.baseline.fee || null)}</span>
                  <ChevronDown size={15} />
                </summary>
                <p className="baseline-scope-summary">
                  {project.baseline.approvedScope ||
                    'Add the approved scope to complete this baseline.'}
                </p>
                <div className="baseline-strip">
                  <div>
                    <span>Approved project fee</span>
                    <strong>{money(project.baseline.fee || null)}</strong>
                  </div>
                  <div>
                    <span>Delivery cost to date</span>
                    <strong>{money(project.baseline.actual || null)}</strong>
                  </div>
                  <div>
                    <span>Remaining forecast</span>
                    <strong>{money(project.baseline.remaining || null)}</strong>
                  </div>
                  <div>
                    <span>Target contribution margin</span>
                    <strong>{targetLabel(project.baseline.target)}</strong>
                  </div>
                </div>
              </details>
              <div className="workspace-tabs">
                <div role="tablist" aria-label="Project workspace" onKeyDown={tabKeys}>
                  <button
                    role="tab"
                    id="evaluate-tab"
                    aria-controls="evaluate-panel"
                    tabIndex={tab === 'evaluate' ? 0 : -1}
                    aria-selected={tab === 'evaluate'}
                    className={tab === 'evaluate' ? 'active' : ''}
                    onClick={() => setTab('evaluate')}
                  >
                    <Layers3 size={16} /> Evaluate change
                  </button>
                  <button
                    role="tab"
                    id="history-tab"
                    aria-controls="history-panel"
                    tabIndex={tab === 'history' ? 0 : -1}
                    aria-selected={tab === 'history'}
                    className={tab === 'history' ? 'active' : ''}
                    onClick={() => setTab('history')}
                  >
                    <History size={16} /> Decision history <span>{changeList.length}</span>
                  </button>
                </div>
              </div>
              {tab === 'evaluate' && change && calc ? (
                <div
                  className="workflow-grid"
                  id="evaluate-panel"
                  role="tabpanel"
                  aria-labelledby="evaluate-tab"
                >
                  <div className="editor-column">
                    {change.includedAt && (
                      <div className="alert success">
                        <CheckCheck size={18} />
                        <div>
                          <strong>Included in the baseline</strong>
                          <p>
                            Reconciled on {dateLabel(change.includedAt, w.agency.timezone)}. This
                            decision is preserved. Start a new change to evaluate further work.
                          </p>
                        </div>
                      </div>
                    )}
                    <section className="card request-card" id="request-section" tabIndex={-1}>
                      <div className="section-heading">
                        <div className="section-name">
                          <span className="step-number">1</span>
                          <div>
                            <h2>Define the request</h2>
                            <p>What changed from the approved scope?</p>
                          </div>
                        </div>
                        <span className={`badge status-${change.status.toLowerCase()}`}>
                          {change.status}
                        </span>
                      </div>
                      {!showAllSteps && (
                        <div className="change-picker">
                          <Field label="Current request">
                            <select
                              aria-label="Switch current change"
                              value={change.id}
                              onChange={(event) => select(project.id, event.target.value)}
                            >
                              {changeList
                                .filter(
                                  (record) =>
                                    (!record.deletedAt && !record.archivedAt) ||
                                    record.id === change.id,
                                )
                                .map((record, index) => (
                                  <option key={record.id} value={record.id}>
                                    {index + 1}. {record.title || 'Untitled request'}
                                  </option>
                                ))}
                            </select>
                          </Field>
                          <button
                            className="text-button"
                            onClick={newChange}
                            disabled={!!project.archivedAt}
                          >
                            <Plus size={15} /> New request
                          </button>
                        </div>
                      )}
                      <fieldset disabled={readOnly}>
                        <Field label="Request title">
                          <input
                            maxLength={100000}
                            id="request-title"
                            aria-label="Request title"
                            value={change.title}
                            onChange={(e) => patch({ title: e.target.value })}
                            placeholder="e.g. Add a CMS-powered journal"
                          />
                        </Field>
                        <button
                          type="button"
                          className="scenario-trigger"
                          disabled={readOnly}
                          onClick={() => setModal('scenario')}
                        >
                          <Sparkles size={17} />
                          <span>Use an example request</span>
                          <ChevronDown size={16} />
                        </button>
                        <Field
                          label={showAllSteps ? 'Scope of the request' : 'Describe the change'}
                        >
                          <textarea
                            maxLength={100000}
                            aria-label={
                              showAllSteps ? 'Scope of the request' : 'Describe the change'
                            }
                            rows={3}
                            value={change.request}
                            onChange={(e) => patch({ request: e.target.value })}
                            placeholder="Describe the requested work and what will be delivered."
                          />
                        </Field>
                        <Field label="Deliverables" hint="What will the client receive?">
                          <textarea
                            id="request-deliverables"
                            maxLength={100000}
                            aria-label="Deliverables"
                            rows={2}
                            value={change.deliverables}
                            onChange={(e) =>
                              patch({ deliverables: e.target.value, contractConfirmed: false })
                            }
                          />
                        </Field>
                        {showAllSteps ? (
                          <div className="field">
                            <label>How does it relate to the agreement?</label>
                            <div className="segmented classification">
                              {CLASSIFICATIONS.map((c) => (
                                <button
                                  type="button"
                                  aria-pressed={change.classification === c}
                                  className={change.classification === c ? 'active' : ''}
                                  key={c}
                                  onClick={() =>
                                    patch({ classification: c, contractConfirmed: false })
                                  }
                                >
                                  {c}
                                </button>
                              ))}
                            </div>
                            <p
                              className={`classification-guidance ${change.classification !== 'Addition' ? 'caution' : ''}`}
                            >
                              <Info size={14} />
                              {CLASS_HELP[change.classification]}
                            </p>
                          </div>
                        ) : (
                          <Field label="Type of change">
                            <select
                              aria-label="Type of change"
                              value={change.classification}
                              onChange={(event) =>
                                patch({
                                  classification: event.target
                                    .value as ChangeTerms['classification'],
                                  contractConfirmed: false,
                                })
                              }
                            >
                              <option value="Addition">Additional work</option>
                              <option value="Included">Already in the agreed scope</option>
                              <option value="Defect">A correction</option>
                              <option value="Ambiguous">Needs clarification</option>
                            </select>
                            {change.classification !== 'Addition' && (
                              <p className="field-hint">{CLASS_HELP[change.classification]}</p>
                            )}
                          </Field>
                        )}
                        <details className="scope-details">
                          <summary>
                            Exclusions, dependencies & contract checks <ChevronDown size={15} />
                          </summary>
                          <div className="detail-fields">
                            {(['exclusions', 'dependencies', 'contractChecks'] as const).map(
                              (key) => (
                                <Field
                                  key={key}
                                  label={
                                    {
                                      deliverables: 'Deliverables',
                                      exclusions: 'Exclusions',
                                      dependencies: 'Client dependencies',
                                      contractChecks: 'Contract checks',
                                    }[key]
                                  }
                                >
                                  <textarea
                                    maxLength={100000}
                                    aria-label={
                                      {
                                        deliverables: 'Deliverables',
                                        exclusions: 'Exclusions',
                                        dependencies: 'Client dependencies',
                                        contractChecks: 'Contract checks',
                                      }[key]
                                    }
                                    rows={2}
                                    value={change[key]}
                                    onChange={(e) =>
                                      patch({ [key]: e.target.value, contractConfirmed: false })
                                    }
                                  />
                                </Field>
                              ),
                            )}
                          </div>
                        </details>
                      </fieldset>
                    </section>
                    <section className="card" id="cost-section" tabIndex={-1}>
                      <div className="section-heading">
                        <div className="section-name">
                          <span className="step-number">2</span>
                          <div>
                            <h2>Estimate delivery cost</h2>
                            <p>Private estimates. Never included in the client brief.</p>
                          </div>
                        </div>
                        <span className="private-label">
                          <LockKeyhole size={12} /> {showAllSteps ? 'INTERNAL' : 'PRIVATE COSTS'}
                        </span>
                      </div>
                      <fieldset disabled={readOnly}>
                        <div className="cost-fields">
                          <NumberField
                            id="hours"
                            label={showAllSteps ? 'Additional hours' : 'Hours needed'}
                            suffix="hrs"
                            value={change.hours}
                            onChange={(s) => patch({ hours: s })}
                            error={calc.errors.hours}
                          />
                          <NumberField
                            id="rate"
                            label={showAllSteps ? 'Loaded hourly cost' : 'Hourly cost'}
                            prefix={symbol}
                            value={change.rate}
                            onChange={(s) => patch({ rate: s })}
                            error={calc.errors.rate}
                          />
                          <NumberField
                            id="outside"
                            label={showAllSteps ? 'Outside costs' : 'Extra expenses'}
                            prefix={symbol}
                            value={change.outside}
                            onChange={(s) => patch({ outside: s })}
                            error={calc.errors.outside}
                          />
                        </div>
                        <div className="slider-row">
                          <input
                            maxLength={100000}
                            aria-label="Adjust additional hours"
                            type="range"
                            min="0"
                            max={Math.max(40, Number(change.hours) || 40)}
                            step="0.25"
                            value={Number.isFinite(Number(change.hours)) ? Number(change.hours) : 0}
                            onChange={(e) => patch({ hours: e.target.value })}
                          />
                          <span>0–{Math.max(40, Number(change.hours) || 40)} hours</span>
                        </div>
                        <p className="field-hint">
                          {showAllSteps
                            ? 'Loaded cost includes delivery pay and attributable employment costs. It is not your client billing rate.'
                            : 'Your hourly cost includes the pay and expenses needed to deliver the work.'}
                        </p>
                        <details
                          className="scope-details"
                          open={change.route === 'Exchange' || Number(change.removed) > 0}
                        >
                          <summary>
                            Remove future scope to offset cost <ChevronDown size={15} />
                          </summary>
                          <div className="detail-fields">
                            <NumberField
                              id="removed"
                              label="Eligible future cost removed"
                              prefix={symbol}
                              value={change.removed}
                              onChange={(s) => patch({ removed: s })}
                              error={calc.errors.removed}
                              hint="Only cost within the remaining forecast. Incurred cost cannot be removed."
                            />
                            <Field label="Work removed from the agreement">
                              <textarea
                                maxLength={100000}
                                aria-label="Work removed from the agreement"
                                rows={2}
                                value={change.removedScope}
                                onChange={(e) => patch({ removedScope: e.target.value })}
                              />
                            </Field>
                          </div>
                        </details>
                      </fieldset>
                      <div className="net-cost">
                        <span>Net additional delivery cost</span>
                        <strong>{money(calc.netCost)}</strong>
                      </div>
                      {!showAllSteps && !readOnly && change.route !== 'Defer' && (
                        <button
                          className="text-button defer-estimate"
                          onClick={() => {
                            patch({ route: 'Defer' });
                            jumpToStep(5);
                          }}
                        >
                          Keep this request for later <ArrowRight size={15} />
                        </button>
                      )}
                    </section>
                    <section className="card" id="price-section" tabIndex={-1}>
                      <div className="section-heading">
                        <div className="section-name">
                          <span className="step-number">3</span>
                          <div>
                            <h2>Choose a commercial response</h2>
                            <p>A price is a decision. The agreement still comes first.</p>
                          </div>
                        </div>
                      </div>
                      <fieldset disabled={readOnly}>
                        {showAllSteps ? (
                          <>
                            <div className="route-grid">
                              {ROUTES.map((r) => (
                                <button
                                  key={r}
                                  className={`route-option ${change.route === r ? 'active' : ''}`}
                                  onClick={() => patch({ route: r })}
                                  aria-pressed={change.route === r}
                                >
                                  <span>{r}</span>
                                  {change.route === r ? (
                                    <Check size={15} />
                                  ) : (
                                    <span className="route-radio" />
                                  )}
                                </button>
                              ))}
                            </div>
                            <p className="field-hint route-description">
                              {ROUTE_HELP[change.route]}
                            </p>
                          </>
                        ) : (
                          <Field label="How will you handle this change?">
                            <select
                              aria-label="How will you handle this change?"
                              value={change.route}
                              onChange={(event) =>
                                patch({ route: event.target.value as ChangeTerms['route'] })
                              }
                            >
                              <option value="Quote">Charge for the additional work</option>
                              <option value="Absorb">No additional charge</option>
                              <option value="Exchange">Replace some existing work</option>
                              <option value="Defer">Keep this request for later</option>
                            </select>
                            {change.route === 'Exchange' && (
                              <p className="field-hint">
                                Name the work being removed and its future cost in the Costs step.
                              </p>
                            )}
                            {change.route === 'Defer' && (
                              <p className="field-hint">
                                The brief will state that no work, date or fee has been committed.
                              </p>
                            )}
                          </Field>
                        )}
                        {(showAllSteps || change.route !== 'Defer') && (
                          <div className="fee-basis-fields">
                            <Field label="Fee basis">
                              <select
                                aria-label="Fee basis"
                                value={change.feeMode ?? 'excluding-tax'}
                                disabled={change.route === 'Absorb' || change.route === 'Defer'}
                                onChange={(event) =>
                                  patch(
                                    feeBasisPatch(
                                      change,
                                      event.target.value as NonNullable<ChangeTerms['feeMode']>,
                                    ),
                                  )
                                }
                              >
                                <option value="excluding-tax">Excluding tax</option>
                                <option value="including-tax">Including tax</option>
                                <option value="custom">Custom fee</option>
                              </select>
                            </Field>
                            <NumberField
                              id="fee-tax-rate"
                              label="Tax percentage"
                              value={change.taxRate ?? '0'}
                              suffix="%"
                              onChange={changeTaxRate}
                              error={calc.errors.taxRate}
                              hint={
                                change.feeMode === 'including-tax'
                                  ? 'Changing tax updates the client total and keeps the before-tax fee.'
                                  : 'Tax is added to the before-tax fee using this percentage.'
                              }
                              disabled={change.route === 'Absorb' || change.route === 'Defer'}
                            />
                          </div>
                        )}
                        {(showAllSteps || change.route !== 'Defer') && (
                          <div className="fee-row">
                            <NumberField
                              id="proposed-fee"
                              label="Proposed additional fee"
                              prefix={symbol}
                              value={change.route === 'Absorb' ? '0' : change.fee}
                              onChange={(s) => patch({ fee: s })}
                              disabled={
                                change.route === 'Absorb' || change.route === 'Defer' || readOnly
                              }
                              error={calc.errors.fee}
                              hint={
                                change.feeMode === 'including-tax'
                                  ? 'Client total, including the tax percentage above.'
                                  : change.feeMode === 'custom'
                                    ? 'Your own fee before tax. Tax is added using the percentage above.'
                                    : 'Fee before tax. Tax is added using the percentage above.'
                              }
                            />
                            {suggestedFee !== null &&
                              change.feeMode !== 'custom' &&
                              change.route !== 'Absorb' &&
                              change.route !== 'Defer' && (
                                <button
                                  className="button secondary floor-button"
                                  disabled={new Money(suggestedFee).greaterThan('1e24')}
                                  title={
                                    new Money(suggestedFee).greaterThan('1e24')
                                      ? 'This recommendation exceeds the supported editable amount of 10²⁴. Review the target and estimates.'
                                      : undefined
                                  }
                                  onClick={() => patch({ fee: suggestedFee })}
                                >
                                  Use suggested fee
                                </button>
                              )}
                          </div>
                        )}
                        {change.route !== 'Defer' &&
                          change.route !== 'Absorb' &&
                          calc.effectiveFee !== null &&
                          !calc.errors.taxRate && (
                            <dl className="fee-breakdown">
                              {(() => {
                                const amounts = feeAmounts(
                                  change.feeMode === 'including-tax'
                                    ? new Money(change.fee).minus(change.credit).toString()
                                    : calc.effectiveFee!,
                                  change.taxRate ?? '0',
                                  change.feeMode,
                                );
                                return (
                                  <>
                                    <div>
                                      <dt>Net fee</dt>
                                      <dd>{money(amounts.subtotal)}</dd>
                                    </div>
                                    <div>
                                      <dt>Tax</dt>
                                      <dd>{money(amounts.tax)}</dd>
                                    </div>
                                    <div>
                                      <dt>Client total</dt>
                                      <dd>{money(amounts.total)}</dd>
                                    </div>
                                  </>
                                );
                              })()}
                            </dl>
                          )}
                        <NumberField
                          id="additional-days"
                          label="Additional delivery days"
                          suffix="days"
                          step="1"
                          value={change.additionalDays ?? '0'}
                          onChange={(additionalDays) => patch({ additionalDays })}
                          disabled={change.route === 'Defer'}
                          error={calc.errors.additionalDays}
                          hint={
                            change.route === 'Defer'
                              ? 'Deferred requests do not commit to a delivery date.'
                              : 'Calendar days for this change. They extend the project deadline when the approved change is included in its baseline.'
                          }
                        />
                        {!showAllSteps && (
                          <dl className="fee-facts">
                            <div>
                              <dt>Estimated delivery cost</dt>
                              <dd>{money(calc.netCost)}</dd>
                            </div>
                            <div>
                              <dt>
                                {change.route === 'Defer'
                                  ? 'Current project margin'
                                  : 'Margin with this fee'}
                              </dt>
                              <dd>
                                {formatPercent(
                                  change.route === 'Defer' ? calc.currentMargin : calc.agreedMargin,
                                )}
                              </dd>
                            </div>
                          </dl>
                        )}
                        {(showAllSteps || change.route !== 'Defer') && (
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={change.contractConfirmed}
                              onChange={(e) => patch({ contractConfirmed: e.target.checked })}
                            />
                            <span>
                              I reviewed the agreement and confirmed this response is appropriate.
                            </span>
                          </label>
                        )}
                        <details className="scope-details" open={Number(change.credit) > 0}>
                          <summary>
                            {showAllSteps ? 'Explicit credit adjustment' : 'Add a client credit'}{' '}
                            <ChevronDown size={15} />
                          </summary>
                          <div className="detail-fields">
                            <NumberField
                              id="credit"
                              label="Credit to the client"
                              prefix={symbol}
                              value={change.credit}
                              onChange={(s) => patch({ credit: s })}
                              error={calc.errors.credit}
                              hint={
                                change.feeMode === 'including-tax'
                                  ? 'Subtracts from the tax-inclusive total. Agree the credit explicitly.'
                                  : 'Subtracts from the before-tax fee. Agree the credit explicitly.'
                              }
                            />
                            <Field label="Reason for credit">
                              <textarea
                                maxLength={100000}
                                aria-label="Reason for credit"
                                value={change.creditReason}
                                onChange={(e) => patch({ creditReason: e.target.value })}
                                rows={2}
                              />
                            </Field>
                          </div>
                        </details>
                        <details className="scope-details timing-details" open={showAllSteps}>
                          <summary>
                            Timing and conditions <ChevronDown size={15} />
                          </summary>
                          <div className="detail-fields">
                            <Field label="Delivery assumptions">
                              <textarea
                                maxLength={100000}
                                aria-label="Delivery assumptions"
                                rows={3}
                                value={change.assumptions}
                                onChange={(e) => patch({ assumptions: e.target.value })}
                                placeholder="What must be true about content, approvals, timing, and dependencies?"
                              />
                            </Field>
                            <details className="scope-details">
                              <summary>Append a reusable assumption</summary>
                              <div className="detail-fields">
                                {w.assumptionPresets
                                  .filter((a) => !a.deletedAt)
                                  .map((a) => (
                                    <button
                                      type="button"
                                      className="text-button"
                                      key={a.id}
                                      onClick={() =>
                                        patch({
                                          assumptions: [change.assumptions.trim(), a.text]
                                            .filter(Boolean)
                                            .join('\n'),
                                          contractConfirmed: false,
                                        })
                                      }
                                    >
                                      {a.title}
                                    </button>
                                  ))}
                                {!w.assumptionPresets.some((a) => !a.deletedAt) && (
                                  <p className="field-hint">Save reusable wording in Templates.</p>
                                )}
                                <button
                                  type="button"
                                  className="text-button"
                                  onClick={() => setView('playbook')}
                                >
                                  Open templates
                                </button>
                              </div>
                            </details>
                          </div>
                        </details>
                      </fieldset>
                    </section>
                  </div>
                  <aside
                    className="decision-column"
                    id="commercial-results"
                    tabIndex={-1}
                    aria-label="Commercial results"
                  >
                    <section className="decision-card">
                      <details className="financial-breakdown" open={showAllSteps}>
                        <summary>
                          View financial breakdown <ChevronDown size={15} />
                        </summary>
                        <div className="decision-header">
                          <span className="eyebrow">DECISION AT A GLANCE</span>
                          <span className="live-tag">
                            <span /> LIVE
                          </span>
                        </div>
                        <h2>
                          {change.route === 'Defer'
                            ? 'Keep this request on hold'
                            : change.route === 'Absorb'
                              ? 'Understand what you absorb'
                              : change.route === 'Exchange'
                                ? 'Make the trade-off explicit'
                                : 'Price the change with clarity'}
                        </h2>
                        <div className="agreed-margin">
                          <span>
                            {change.includedAt
                              ? 'Margin at this decision'
                              : change.route === 'Defer'
                                ? 'Current contribution margin'
                                : 'Margin with your proposed fee'}
                          </span>
                          <strong data-testid="agreed-margin">
                            {formatPercent(
                              change.route === 'Defer' ? calc.currentMargin : calc.agreedMargin,
                            )}
                          </strong>
                          <span className="margin-target">
                            Target {targetLabel((included?.before ?? project.baseline).target)}{' '}
                            <span>·</span>{' '}
                            {calc.agreedMargin !== null &&
                            !calc.errors.target &&
                            Number(calc.agreedMargin) >=
                              Number((included?.before ?? project.baseline).target)
                              ? 'At or above target'
                              : change.route === 'Defer'
                                ? 'No commitment yet'
                                : 'Review the margin impact'}
                          </span>
                        </div>
                        <div className="margin-comparison">
                          {[
                            ['Current project', calc.currentMargin, 'current'],
                            ['If you absorb', calc.absorbedMargin, 'absorb'],
                            ['With this decision', calc.agreedMargin, 'agreed'],
                          ].map(([label, value, key]) => (
                            <div className={`margin-row ${key}`} key={key}>
                              <div>
                                <span>{label}</span>
                                <strong>{formatPercent(value)}</strong>
                              </div>
                              <div className="margin-track">
                                <span
                                  style={{
                                    width: `${Math.min(100, Math.max(0, Number(value ?? 0)))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="decision-divider" />
                        <div className="price-option">
                          <div>
                            <strong>Protect the additional work</strong>
                            <p>Target-margin floor for this change.</p>
                          </div>
                          <strong data-testid="change-floor">{money(calc.changeFloor)}</strong>
                        </div>
                        <div className="price-option">
                          <div>
                            <strong>Restore the whole project</strong>
                            <p>Fee to bring the project back to target.</p>
                          </div>
                          <strong data-testid="restoration-fee">
                            {money(calc.restorationFee)}
                          </strong>
                        </div>
                        <p className="result-explanation">
                          <Info size={14} /> These protect different things. If the project is
                          already below target, its restoration fee can be higher.
                        </p>
                        {calc.creditRequired && (
                          <p className="notice warning">
                            Review the scope savings or client credit explicitly. A zero floor does
                            not settle the commercial decision.
                          </p>
                        )}
                        {!calc.valid && (
                          <p className="notice warning">
                            Complete the inputs to see a dependable result. Missing values stay
                            unknown.
                            {Object.entries(calc.errors)
                              .filter(([key]) =>
                                [
                                  'baselineFee',
                                  'actual',
                                  'remaining',
                                  'target',
                                  'removedScope',
                                  'creditReason',
                                ].includes(key),
                              )
                              .map(([key, text]) => (
                                <span className="result-error" key={key}>
                                  {text}
                                </span>
                              ))}
                          </p>
                        )}
                        {change.route === 'Defer' && (
                          <p className="notice">
                            Deferral preserves the request without committing revenue or delivery
                            cost.
                          </p>
                        )}
                        <div className="effective-fee">
                          <span>
                            {Number(calc.effectiveFee) < 0
                              ? 'Client credit · before tax'
                              : 'Additional fee · before tax'}
                          </span>
                          <strong>{money(calc.effectiveFee)}</strong>
                        </div>
                      </details>
                      {change.archivedAt || project.archivedAt ? (
                        <button
                          className="button primary save-decision"
                          onClick={() =>
                            run(
                              () =>
                                store.mutate((x) =>
                                  recoverRecord(
                                    recoverRecord(x, 'project', project.id),
                                    'change',
                                    change.id,
                                  ),
                                ),
                              'Record recovered',
                            )
                          }
                        >
                          <RotateCcw size={16} /> Recover to continue editing
                        </button>
                      ) : !change.includedAt ? (
                        <>
                          {change.status === 'Approved' ? (
                            <button
                              className="button primary save-decision"
                              onClick={() => setModal('reconcile')}
                            >
                              <CheckCheck size={16} /> Include approved change in baseline
                            </button>
                          ) : change.status === 'Quoted' ? (
                            <button
                              className="button primary save-decision"
                              onClick={() => setModal('approval')}
                            >
                              <ShieldCheck size={16} /> Record approval <ArrowRight size={16} />
                            </button>
                          ) : (
                            <button
                              className="button primary save-decision"
                              onClick={() =>
                                run(
                                  () => {
                                    store.mutate((x) =>
                                      saveDecision(
                                        x,
                                        change.id,
                                        change.route === 'Defer' ? 'Draft' : 'Quoted',
                                      ),
                                    );
                                  },
                                  change.route === 'Defer'
                                    ? 'Deferred request saved'
                                    : 'Decision saved for approval',
                                )
                              }
                            >
                              <FileCheck2 size={17} />
                              {change.route === 'Defer'
                                ? 'Save deferred request'
                                : change.route === 'Absorb'
                                  ? 'Save absorption decision'
                                  : 'Save decision'}
                              <ArrowRight size={16} />
                            </button>
                          )}
                          <button
                            className="text-button save-draft"
                            onClick={() =>
                              run(
                                () => store.mutate((x) => saveDecision(x, change.id, 'Draft')),
                                'Draft saved',
                              )
                            }
                          >
                            {change.status === 'Approved' || change.status === 'Quoted'
                              ? 'Reopen as draft'
                              : 'Save as draft'}
                          </button>
                        </>
                      ) : (
                        <button className="button primary save-decision" onClick={newChange}>
                          <Plus size={17} /> Evaluate a new change
                        </button>
                      )}
                      <div className="card-save-state">
                        <CheckCheck size={13} />
                        {store.saveState === 'saved'
                          ? 'Your latest edits are saved locally'
                          : store.saveState === 'saving'
                            ? 'Saving your latest edits…'
                            : 'Export a backup to protect your edits'}
                      </div>
                    </section>
                    <div className="request-quick-tools">
                      <button
                        className="text-button"
                        aria-label="Preview client brief"
                        onClick={() => openDocuments('brief')}
                      >
                        <Files size={15} /> Client brief
                      </button>
                      <button
                        className="text-button"
                        aria-label="Compose client response"
                        onClick={() => setModal('composer')}
                      >
                        <Copy size={15} /> Client response
                      </button>
                      <button
                        className="text-button"
                        aria-label="Compare responses"
                        onClick={() => setModal('comparison')}
                      >
                        <Layers3 size={15} /> Compare responses
                      </button>
                    </div>
                    <div className="financial-note">
                      <ShieldCheck size={17} />
                      <p>
                        <strong>A contribution margin, not net profit.</strong> These figures
                        exclude tax and may not include all agency overheads. A calculated fee does
                        not create a contractual right to charge.
                      </p>
                    </div>
                    <button className="history-link" onClick={() => setTab('history')}>
                      <History size={16} /> View decisions & revision history{' '}
                      <ArrowRight size={15} />
                    </button>
                  </aside>
                </div>
              ) : tab === 'evaluate' ? (
                <Empty title="Start the next scope decision">
                  <button className="text-button" onClick={newChange}>
                    Create a new change <Plus size={15} />
                  </button>
                </Empty>
              ) : (
                <HistoryPanel
                  w={w}
                  project={project}
                  onSelect={(c) => select(project.id, c.id)}
                  onRevision={(rev) => {
                    setSelectedRevision(rev);
                    setModal('revision');
                  }}
                  onAction={(kind, c) =>
                    run(() =>
                      store.mutate((x) =>
                        kind === 'archive'
                          ? archiveRecord(x, 'change', c.id)
                          : kind === 'delete'
                            ? deleteRecord(x, 'change', c.id)
                            : recoverRecord(x, 'change', c.id),
                      ),
                    )
                  }
                  onReject={(c) =>
                    run(
                      () => store.mutate((x) => saveDecision(x, c.id, 'Rejected')),
                      'Decision rejected',
                    )
                  }
                />
              )}
              {!showAllSteps && (
                <div className="flow-action-dock">
                  {actionError && <p role="alert">{actionError}</p>}
                  <div>
                    <button
                      className="button secondary"
                      disabled={flowStep === 1}
                      onClick={() => jumpToStep(flowStep - 1)}
                    >
                      <ArrowLeft size={15} /> Back
                    </button>
                    <span>Step {flowStep} of 7</span>
                    <button className="button primary" onClick={openNextStep}>
                      {nextAction}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {view === 'workspace' && !project && (
            <Empty title="Create your first project">
              Open Projects to establish an approved baseline.
            </Empty>
          )}
          {view === 'dashboard' && (
            <ViewErrorBoundary fallback={unavailable('Overview')}>
              <Suspense fallback={<ViewLoading />}>
                <DashboardView
                  w={w}
                  onChange={store.mutate}
                  onNavigate={navigate}
                  storageError={store.error ?? undefined}
                  notify={notify}
                  onNewProject={openNewProject}
                />
              </Suspense>
            </ViewErrorBoundary>
          )}
          {view === 'calendar' && (
            <ViewErrorBoundary fallback={unavailable('Calendar')}>
              <Suspense fallback={<ViewLoading />}>
                <CalendarView
                  w={w}
                  onChange={store.mutate}
                  onNavigate={navigate}
                  notify={notify}
                  selectedEventId={selectedCalendarEventId}
                  createIntent={calendarCreateIntent}
                  onCreateHandled={() => setCalendarCreateIntent(0)}
                />
              </Suspense>
            </ViewErrorBoundary>
          )}
          {view === 'documents' && (
            <ViewErrorBoundary fallback={unavailable('Documents')}>
              <Suspense fallback={<ViewLoading />}>
                <DocumentsView
                  w={w}
                  onChange={store.mutate}
                  onNavigate={navigate}
                  onActivate={() => setModal('license')}
                  active={license.status.active}
                  mode={license.status.mode}
                  selectedProjectId={w.context.projectId}
                  selectedChangeId={w.context.changeId}
                  selectedDocumentId={selectedDocumentId}
                  requestedKind={documentKindIntent}
                  onKindHandled={() => setDocumentKindIntent(null)}
                  onKindChange={setDocumentFlowKind}
                  flowStep={briefFlow ? flowStep : undefined}
                  onFlowStep={jumpToStep}
                  onLeaveFlow={() => setBriefFlow(false)}
                />
              </Suspense>
            </ViewErrorBoundary>
          )}
          {view === 'playbook' && (
            <ViewErrorBoundary fallback={unavailable('Templates')}>
              <Suspense fallback={<ViewLoading />}>
                <PlaybookView w={w} onChange={store.mutate} onOpenChange={select} />
              </Suspense>
            </ViewErrorBoundary>
          )}
          {view === 'projects' && (
            <>
              <div className="list-toolbar">
                <div className="search-input">
                  <Search size={17} />
                  <input
                    maxLength={100000}
                    aria-label="Search projects"
                    placeholder="Search projects or clients…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Sort projects"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="recent">Recently updated</option>
                  <option value="name">Project name</option>
                </select>
                <label className="check-label compact">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Archived
                </label>
                <label className="check-label compact">
                  <input
                    type="checkbox"
                    checked={showTrash}
                    onChange={(e) => setShowTrash(e.target.checked)}
                  />
                  Trash
                </label>
              </div>
              <div className="project-grid">
                {visibleProjects.map((p) => (
                  <div className="card project-card" key={p.id}>
                    <div className="project-card-top">
                      <span className="project-avatar">
                        <FolderKanban size={23} />
                      </span>
                      <span className="badge">
                        {p.deletedAt
                          ? 'In trash'
                          : p.archivedAt
                            ? 'Archived'
                            : p.sample
                              ? 'Sample'
                              : p.state === 'on-hold'
                                ? 'On hold'
                                : p.state === 'completed'
                                  ? 'Completed'
                                  : 'Active'}
                      </span>
                    </div>
                    <h2>{p.name}</h2>
                    <p>{w.clients.find((c) => c.id === p.clientId)?.name || 'No client'}</p>
                    <div className="project-card-metrics">
                      <div>
                        <span>Approved revenue</span>
                        <strong>{formatMoney(p.baseline.fee || null, p.currency)}</strong>
                      </div>
                      <div>
                        <span>Changes</span>
                        <strong>
                          {w.changes.filter((c) => c.projectId === p.id && !c.deletedAt).length}
                        </strong>
                      </div>
                    </div>
                    <div className="project-card-actions">
                      {!p.deletedAt && (
                        <button className="text-button" onClick={() => select(p.id)}>
                          {p.archivedAt ? 'View project' : 'Continue request'}{' '}
                          <ArrowRight size={15} />
                        </button>
                      )}
                      <div className="button-row">
                        {p.deletedAt || p.archivedAt ? (
                          <button
                            className="icon-button"
                            aria-label={`Recover ${p.name}`}
                            onClick={() =>
                              run(
                                () => store.mutate((x) => recoverRecord(x, 'project', p.id)),
                                'Project recovered',
                              )
                            }
                          >
                            <RotateCcw size={16} /> Recover
                          </button>
                        ) : (
                          <button
                            className="icon-button"
                            aria-label={`Archive ${p.name}`}
                            onClick={() =>
                              run(
                                () => store.mutate((x) => archiveRecord(x, 'project', p.id)),
                                'Project archived',
                              )
                            }
                          >
                            <Archive size={16} /> Archive
                          </button>
                        )}
                        {!p.deletedAt && (
                          <button
                            className="icon-button"
                            aria-label={`Duplicate ${p.name}`}
                            onClick={() => {
                              if (!canCreateProject(w, license.status.active)) {
                                setModal('license');
                                return;
                              }
                              setDuplicateId(p.id);
                              setModal('duplicate');
                            }}
                          >
                            <Copy size={16} /> Duplicate
                          </button>
                        )}
                        {!p.deletedAt && (
                          <button
                            className="icon-button danger"
                            aria-label={`Move ${p.name} to trash`}
                            onClick={() =>
                              run(
                                () => store.mutate((x) => deleteRecord(x, 'project', p.id)),
                                'Project moved to recoverable trash',
                              )
                            }
                          >
                            <Trash2 size={16} /> Trash
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {!visibleProjects.length && (
                <section className="card list-empty" role="status">
                  <Empty
                    title={
                      query.trim()
                        ? 'No matching projects'
                        : showTrash
                          ? 'No projects in trash'
                          : 'No projects in this view'
                    }
                  >
                    Try a different search or review the archive and trash filters. Preserved
                    projects remain on this device.
                  </Empty>
                  {(query || showArchived || showTrash) && (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setQuery('');
                        setShowArchived(false);
                        setShowTrash(false);
                      }}
                    >
                      Clear search &amp; filters
                    </button>
                  )}
                </section>
              )}
              <p className="storage-footnote">
                {license.status.active
                  ? 'Activated projects use the disclosed local storage bounds. '
                  : 'The demo supports one sample and one custom project. '}{' '}
                Archived and trashed projects retain their records and still use the custom-project
                allowance.
              </p>
            </>
          )}
          {view === 'clients' && (
            <Clients
              w={w}
              selectedClientId={selectedClientId}
              onChange={(data) => store.mutate(data)}
              onOpen={select}
            />
          )}
          {view === 'settings' && (
            <div className="settings-grid">
              <section className="card">
                <h2>Agency defaults</h2>
                <p className="section-description">
                  Defaults apply to new work. Currency selection changes the unit; it does not
                  convert amounts.
                </p>
                <Field label="Agency name">
                  <input
                    maxLength={100000}
                    id="agency-name"
                    aria-label="Agency name"
                    value={w.agency.name}
                    onChange={(e) =>
                      store.mutate({ ...w, agency: { ...w.agency, name: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Default currency">
                  <select
                    aria-label="Default currency"
                    value={w.agency.defaultCurrency}
                    onChange={(e) =>
                      store.mutate({
                        ...w,
                        agency: { ...w.agency, defaultCurrency: e.target.value as Currency },
                      })
                    }
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <NumberField
                  id="default-rate"
                  label="Loaded hourly cost"
                  value={w.agency.defaultRate}
                  onChange={(s) => store.mutate({ ...w, agency: { ...w.agency, defaultRate: s } })}
                />
                <NumberField
                  id="default-target"
                  label="Target contribution margin"
                  suffix="%"
                  value={w.agency.defaultTarget}
                  onChange={(s) =>
                    store.mutate({ ...w, agency: { ...w.agency, defaultTarget: s } })
                  }
                />
                <p className="field-hint">
                  Invalid defaults are retained as drafts. Complete valid inputs before saving a
                  commercial decision.
                </p>
                <p className="field-hint">
                  Aster Studio and the initial cost and margin are sample defaults. Confirm your own
                  details before issuing a document for real work. Loaded cost includes your
                  delivery costs; it is not the fee you charge clients.
                </p>
                <button
                  className="button secondary"
                  disabled={defaultsReviewed(w.agency)}
                  onClick={() =>
                    run(() => store.mutate(confirmDefaults(w)), 'Studio defaults confirmed.')
                  }
                >
                  <Check size={16} />
                  {defaultsReviewed(w.agency) ? 'Defaults confirmed' : 'Confirm these defaults'}
                </button>
              </section>
              <div>
                <section className="card backup-card">
                  <div className="section-heading">
                    <h2>Backup & recovery</h2>
                    <ShieldCheck size={21} />
                  </div>
                  <p>
                    Projects live in this browser. Clearing browser data removes local work. A
                    backup includes all related records and revisions.
                  </p>
                  <div className="workspace-capacity">
                    <div>
                      <span>Workspace storage</span>
                      <strong>
                        {(capacity.bytes / 1048576).toFixed(2)} / {WORKSPACE_LIMIT_MIB} MiB
                      </strong>
                    </div>
                    <meter
                      min={0}
                      max={capacity.limit}
                      value={capacity.bytes}
                      low={capacity.limit * 0.8}
                      high={capacity.limit * 0.95}
                      optimum={0}
                      aria-label="Workspace storage used"
                    />
                    <p className="field-hint">
                      Includes saved documents, revisions and drafts. Images are fitted
                      automatically; backups store repeated images once. The {WORKSPACE_LIMIT_MIB}{' '}
                      MiB safety limit keeps saving and restoring manageable. Records are never
                      silently removed.
                    </p>
                  </div>
                  <DeviceStorageStatus />
                  <div className="backup-status">
                    <span>Last backup</span>
                    <strong>
                      {w.context.lastBackupAt
                        ? dateLabel(w.context.lastBackupAt, w.agency.timezone)
                        : 'No backup yet'}
                    </strong>
                  </div>
                  <div className="button-row">
                    <button className="button primary" onClick={backup}>
                      <Download size={16} /> Export backup
                    </button>
                    <button className="button secondary" onClick={() => inputRef.current?.click()}>
                      <Upload size={16} /> Restore backup
                    </button>
                  </div>
                  <p className="field-hint">
                    Restore replaces this workspace after a preview and confirmation. It preserves
                    identities and does not create copies. Workspace limit: {WORKSPACE_LIMIT_MIB}{' '}
                    MiB; encrypted backup files can be up to {ENCRYPTED_BACKUP_LIMIT_MIB} MiB.
                  </p>
                </section>
                <section className="card license-settings">
                  <h2>Activation & device access</h2>
                  <span className="badge">
                    {license.status.active
                      ? `${license.status.plan} activated`
                      : license.status.mode === 'local-test'
                        ? 'Local development test mode'
                        : 'Demo'}{' '}
                  </span>
                  <p>
                    Individual: $49 lifetime, one activated browser/device. Agency: $99 lifetime,
                    five activations. Both plans receive the complete paid feature set.
                  </p>
                  <button className="button secondary" onClick={() => setModal('license')}>
                    Manage activation <ArrowUpRight size={15} />
                  </button>
                </section>
              </div>
            </div>
          )}
          {view === 'settings' && (
            <>
              <ViewErrorBoundary fallback={unavailable('Agency settings')}>
                <Suspense fallback={<ViewLoading />}>
                  <SettingsExtras w={w} onChange={store.mutate} />
                </Suspense>
              </ViewErrorBoundary>
              <SupportAction context="Settings and backups" />
            </>
          )}
          {view === 'support' && (
            <div className="support-grid">
              <section className="card">
                <h2>Make your next decision with confidence</h2>
                <p className="section-description">
                  Use the sample project to work through the complete sequence.
                </p>
                <ol className="support-steps">
                  <li>
                    <strong>Establish the approved baseline.</strong> Revenue excludes tax. Split
                    delivery cost into actual cost incurred and forecast remaining cost.
                  </li>
                  <li>
                    <strong>Describe and classify the request.</strong> Included work, warranty
                    defects, and ambiguous scope require contract review.
                  </li>
                  <li>
                    <strong>Estimate cost and compare responses.</strong> Use loaded cost, outside
                    costs, and explicit future scope savings. Quote, absorb, exchange, or defer.
                  </li>
                  <li>
                    <strong>Choose a fee and save.</strong> The change floor protects additional
                    work. The restoration fee targets the entire project.
                  </li>
                  <li>
                    <strong>Record approval and reconcile.</strong> Log evidence, split the new cost
                    between incurred and remaining, and include it in the baseline once.
                  </li>
                </ol>
                <button className="button secondary" onClick={() => setModal('guide')}>
                  <BookOpen size={16} /> Reopen quick guide
                </button>
              </section>
              <div>
                <section className="card">
                  <h2>Contact support</h2>
                  <p>
                    Include the browser, what happened, and the steps to reproduce it. Only share
                    project data you intend to disclose.
                  </p>
                  <SupportAction context="Issue report" />
                </section>
                <section className="card">
                  <h2>Privacy & local storage</h2>
                  <p>
                    Project data is stored in IndexedDB on this browser. There is no account,
                    analytics integration, or cloud synchronization. Backups are unencrypted JSON
                    files under your control.
                  </p>
                  <p>
                    When configured, activation sends the license key over HTTPS to the server and
                    Gumroad. The server retains encrypted key material, device allocation and
                    sessions. PDF downloads send only the client-facing document schema to the
                    renderer. No private costs or internal comparisons are transferred. Seller
                    identity, production retention and final policy choices require owner review
                    before paid launch.
                  </p>
                  <p>
                    Approval records are entered manually. They are not electronic signatures or a
                    tamper-proof audit log.
                  </p>
                </section>
              </div>
            </div>
          )}
          {view === 'workspace' && tab === 'evaluate' && change && !readOnly && showAllSteps && (
            <div className="mobile-decision-action">
              <div>
                <span>
                  {change.route === 'Defer'
                    ? 'Current margin · request deferred'
                    : 'Margin with this decision'}
                </span>
                <strong>
                  {formatPercent(
                    change.route === 'Defer' ? calc?.currentMargin : calc?.agreedMargin,
                  )}
                </strong>
              </div>
              <button
                className="button primary"
                aria-label={
                  decisionReady
                    ? 'Continue the commercial decision from mobile action'
                    : 'Review decision'
                }
                onClick={() => {
                  if (!decisionReady) {
                    document.getElementById('commercial-results')?.scrollIntoView({
                      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'instant'
                        : 'smooth',
                      block: 'start',
                    });
                    return;
                  }
                  if (change.status === 'Approved') setModal('reconcile');
                  else if (change.status === 'Quoted') setModal('approval');
                  else
                    run(
                      () =>
                        store.mutate((x) =>
                          saveDecision(x, change.id, change.route === 'Defer' ? 'Draft' : 'Quoted'),
                        ),
                      change.route === 'Defer'
                        ? 'Deferred request saved'
                        : 'Decision saved for approval',
                    );
                }}
              >
                {decisionReady
                  ? change.status === 'Approved'
                    ? 'Reconcile approval'
                    : change.status === 'Quoted'
                      ? 'Record approval'
                      : change.route === 'Defer'
                        ? 'Save deferred request'
                        : 'Save decision'
                  : 'Review decision'}{' '}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          <footer className="page-footer">
            <span>
              ScopeLedger <span>·</span> A considered change. A healthier project.
            </span>
            <span>
              Local workspace <span>·</span> Application
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.slbackup,application/json"
        data-testid="backup-file"
        hidden
        onChange={(e) => e.target.files?.[0] && void readBackup(e.target.files[0])}
      />
      {backupDialog}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}
      {modal === 'scenario' && change && (
        <Modal title="Common agency scenarios" wide onClose={closeModal}>
          <p className="modal-intro">
            A useful starting point, not a preset price. Your baseline and cost estimates stay
            unchanged.
          </p>
          {pendingScenario ? (
            <>
              <div className="scenario-preview">
                <span className="badge">
                  {pendingScenario.classification} · {pendingScenario.route}
                </span>
                <h3>{pendingScenario.title}</h3>
                <p>{pendingScenario.request}</p>
                <div className="notice">
                  <strong>PM check</strong>
                  <p>{pendingScenario.confirm}</p>
                </div>
                {(
                  [
                    'deliverables',
                    'exclusions',
                    'dependencies',
                    'assumptions',
                    'contractChecks',
                  ] as const
                ).map((k) => (
                  <div key={k}>
                    <h4>
                      {
                        {
                          deliverables: 'Deliverables',
                          exclusions: 'Exclusions',
                          dependencies: 'Client dependencies',
                          assumptions: 'Delivery assumptions',
                          contractChecks: 'Contract checks',
                        }[k]
                      }
                    </h4>
                    <p>{pendingScenario[k]}</p>
                  </div>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={replaceConfirmed}
                  onChange={(e) => setReplaceConfirmed(e.target.checked)}
                />
                <span>
                  Replace this change’s existing scope text, classification, and response. Keep its
                  cost estimates and baseline.
                </span>
              </label>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    setPendingScenario(null);
                    setReplaceConfirmed(false);
                  }}
                >
                  <ArrowLeft size={15} /> All scenarios
                </button>
                <button
                  className="button primary"
                  disabled={!replaceConfirmed}
                  onClick={() =>
                    run(() => {
                      const s = pendingScenario;
                      store.mutate((x) =>
                        updateChange(x, change.id, {
                          title: s.title,
                          request: s.request,
                          deliverables: s.deliverables,
                          exclusions: s.exclusions,
                          dependencies: s.dependencies,
                          assumptions: s.assumptions,
                          contractChecks: s.contractChecks,
                          classification: s.classification,
                          route: s.route,
                          contractConfirmed: false,
                        }),
                      );
                      closeModal();
                    }, 'Scenario loaded. Review the wording and confirm your estimate.')
                  }
                >
                  Load scenario <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <div className="scenario-grid">
              {[...SCENARIOS, ...w.customScenarios.filter((s) => !s.deletedAt)].map((s, i) => (
                <button
                  className="scenario-option"
                  key={s.id}
                  onClick={() => setPendingScenario(s)}
                >
                  <span className="scenario-index">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{s.title}</strong>
                    <p>{s.description}</p>
                    <span>
                      {s.classification} · {s.route}
                    </span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
      {modal === 'baseline' && project && (
        <BaselineModal
          project={project}
          symbol={symbol}
          onClose={closeModal}
          onSave={(b) => {
            run(() => {
              store.mutate((x) => updateBaseline(x, project.id, b));
              closeModal();
              if (flowStep === 2) {
                setFlowStep(completeBaseline(b) ? 3 : 2);
                if (completeBaseline(b)) setPendingField('request-title');
              }
            }, 'Baseline updated. Unincorporated approvals require review.');
          }}
        />
      )}
      {modal === 'project' && (
        <ProjectModal
          currencies={CURRENCIES}
          defaultCurrency={w.agency.defaultCurrency}
          onClose={closeModal}
          clients={w.clients}
          error={actionError}
          onSave={async (name, client, currency) => {
            try {
              const activated = await authorizeExtraProject();
              store.clearMutationFailure();
              store.mutate((x) => createProject(x, { name, client, currency, activated }));
              store.assertMutationApplied();
              await store.flush();
              closeModal();
              setTab('evaluate');
              setFlowStep(2);
              setBriefFlow(false);
              notify('Project created. Establish the baseline before quoting.');
            } catch (e) {
              setActionError((e as Error).message);
            }
          }}
        />
      )}
      {modal === 'approval' && change && (
        <ApprovalModal
          timezone={w.agency.timezone ?? 'Asia/Dhaka'}
          onClose={closeModal}
          title={change.title}
          onSave={(evidence, date) =>
            run(() => {
              store.mutate((x) => recordApproval(x, change.id, evidence, date));
              closeModal();
            }, 'Approval recorded. Reconcile delivery costs before the next change.')
          }
          error={actionError}
        />
      )}
      {modal === 'reconcile' && project && change && calc && (
        <ReconcileModal
          project={project}
          change={change}
          gross={calc.grossCost}
          currency={currency}
          onClose={closeModal}
          onSave={(incurred, remaining) =>
            run(() => {
              store.mutate((x) => reconcileChange(x, change.id, incurred, remaining));
              closeModal();
            }, 'Approved change included in baseline exactly once.')
          }
          error={actionError}
        />
      )}
      {modal === 'restore' && restoreData && (
        <RestoreModal
          data={restoreData}
          onClose={closeModal}
          onBackup={backup}
          onRestore={async () => {
            await restoreAuthorized(restoreData);
            closeModal();
            notify('Workspace restored. Identities and history preserved.');
          }}
        />
      )}
      {modal === 'license' && (
        <ActivationModal
          initialPlan={activationPlan}
          status={license.status}
          statusError={license.error}
          onStatus={license.setStatus}
          onRefresh={license.refresh}
          onClose={closeModal}
        />
      )}
      {modal === 'home' && (
        <Modal title="Open Home?" onClose={closeModal}>
          <p className="modal-intro">
            Your workspace and document drafts stay in this browser and are included in backups.
            Opening Home reloads the page. Copy unfinished messages and dialog entries before
            leaving.
          </p>
          {(store.saveState === 'failed' || homeError) && (
            <div className="notice warning" role="alert">
              <strong>Keep a copy of your current edits first</strong>
              <p>{homeError || store.error}</p>
              <p>
                Export the current workspace before opening Home. Any newer edit requires another
                export.
              </p>
            </div>
          )}
          {homeExportedWorkspace === w && (
            <p className="field-hint" role="status">
              Current edits exported. Keep the downloaded file before leaving.
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" onClick={closeModal}>
              Keep editing
            </button>
            <button
              className="button secondary"
              onClick={() => {
                void exportWorkspace(false);
              }}
            >
              Export current edits
            </button>
            <button
              className="button primary"
              disabled={
                homeLeaving ||
                ((store.saveState === 'failed' || !!homeError) && homeExportedWorkspace !== w)
              }
              onClick={() => void leaveForHome(true)}
            >
              {homeLeaving ? 'Saving…' : 'Open Home'} <ArrowUpRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {modal === 'composer' && change && (
        <ViewErrorBoundary fallback={unavailable('client response composer', true)}>
          <Suspense fallback={<ViewLoading />}>
            <ClientResponseComposer w={w} change={change} onClose={closeModal} />
          </Suspense>
        </ViewErrorBoundary>
      )}
      {modal === 'comparison' && change && project && (
        <ViewErrorBoundary fallback={unavailable('response comparison', true)}>
          <Suspense fallback={<ViewLoading />}>
            <ComparisonModal
              w={w}
              project={project}
              change={change}
              onChange={store.mutate}
              onClose={closeModal}
            />
          </Suspense>
        </ViewErrorBoundary>
      )}
      {modal === 'duplicate' && (
        <DuplicateModal
          error={actionError}
          project={w.projects.find((p) => p.id === duplicateId)!}
          onClose={closeModal}
          onSave={async (options) => {
            try {
              const activated = await authorizeExtraProject();
              store.mutate((x) => duplicateProject(x, duplicateId, { ...options, activated }));
              await store.flush();
              closeModal();
              notify('Project duplicated; copied decisions require new approval.');
            } catch (e) {
              setActionError((e as Error).message);
            }
          }}
        />
      )}
      {modal === 'revision' && selectedRevision && (
        <RevisionModal w={w} revisionId={selectedRevision} onClose={closeModal} />
      )}
      {modal === 'commands' && <CommandMenu actions={commandActions} onClose={closeModal} />}
      {modal === 'shortcuts' && <KeyboardShortcuts shortcuts={shortcutHelp} onClose={closeModal} />}
      {modal === 'guide' && (
        <Modal title="Your first scope decision" onClose={closeModal}>
          <div className="guide-content">
            <div className="guide-icon">
              <Sparkles size={23} />
            </div>
            <p>
              The Harbor sample shows an $8,000 project at a 35% contribution margin. Adding 8 hours
              at $65 costs $520. An $800 fee protects the change and restores the project to 35%.
            </p>
            <ol>
              {PROJECT_STEPS.map(({ title }) => (
                <li key={title}>{title}</li>
              ))}
            </ol>
            <p className="notice">
              Aim for a clear decision in about a minute when inputs are ready. Confirm your
              contract and estimates before committing.
            </p>
          </div>
          <div className="modal-actions">
            <button
              className="button primary"
              onClick={() => {
                store.mutate({ ...w, context: { ...w.context, guideDismissed: true } });
                closeModal();
              }}
            >
              Start exploring <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ViewLoading() {
  return (
    <div className="card view-loading" role="status">
      Loading this view… Your saved workspace stays on this device.
    </div>
  );
}
function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}
function ProjectModal({
  onClose,
  onSave,
  defaultCurrency,
  currencies,
  clients,
  error,
}: {
  onClose: () => void;
  onSave: (n: string, c: string, currency: Currency) => Promise<void>;
  defaultCurrency: Currency;
  currencies: Currency[];
  clients: Workspace['clients'];
  error: string;
}) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Create a project"
      onClose={onClose}
      dirty={!!name || !!client || currency !== defaultCurrency}
    >
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="modal-intro">
        Your custom project gets its own baseline and change history. Financial inputs start
        unknown.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          void onSave(name, client, currency).finally(() => setBusy(false));
        }}
      >
        <Field label="Project name">
          <input
            required
            maxLength={160}
            aria-label="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Northline / Webflow rebuild"
          />
        </Field>
        <Field label="Client name">
          <input
            required
            maxLength={160}
            aria-label="Client name"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Client or organization"
            list="existing-clients"
          />
        </Field>
        <datalist id="existing-clients">
          {clients.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <Field label="Project currency">
          <select
            aria-label="Project currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <p className="field-hint">
          All amounts use this currency. There is no currency conversion.
        </p>
        <div className="modal-actions">
          <button type="button" data-close-dialog className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Authorizing…' : 'Create project'} <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function DuplicateModal({
  project,
  onClose,
  onSave,
  error,
}: {
  error: string;
  project: Project;
  onClose: () => void;
  onSave: (options: {
    name: string;
    carryBaseline: boolean;
    carryChanges: boolean;
    carryHistory: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(`${project.name} copy`),
    [carryBaseline, setBaseline] = useState(false),
    [carryChanges, setChanges] = useState(false),
    [carryHistory, setHistory] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Duplicate project"
      onClose={onClose}
      dirty={name !== `${project.name} copy` || carryBaseline || carryChanges || carryHistory}
    >
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <p className="modal-intro">
        Choose the records to carry over. The new project has independent identities. Copied
        decisions start as drafts and need new approval.
      </p>
      <Field label="New project name">
        <input
          aria-label="New project name"
          maxLength={160}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <label className="check-label">
        <input
          type="checkbox"
          checked={carryBaseline}
          onChange={(e) => setBaseline(e.target.checked)}
        />
        Copy the current baseline and approved scope
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={carryChanges}
          onChange={(e) => {
            setChanges(e.target.checked);
            if (!e.target.checked) setHistory(false);
          }}
        />
        Copy change wording and estimates as drafts
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={carryHistory}
          disabled={!carryChanges}
          onChange={(e) => setHistory(e.target.checked)}
        />
        Copy historical revisions for reference
      </label>
      <p className="field-hint">
        Approvals, invoices, payments and calendar deadlines belong to the source project and are
        retained there.
      </p>
      <div className="modal-actions">
        <button data-close-dialog className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || !name.trim()}
          onClick={() => {
            if (busy) return;
            setBusy(true);
            void onSave({ name, carryBaseline, carryChanges, carryHistory }).finally(() =>
              setBusy(false),
            );
          }}
        >
          {busy ? 'Duplicating…' : 'Duplicate project'}
        </button>
      </div>
    </Modal>
  );
}
function BaselineModal({
  project,
  symbol,
  onClose,
  onSave,
}: {
  project: Project;
  symbol: string;
  onClose: () => void;
  onSave: (b: Baseline) => void;
}) {
  const [b, setB] = useState({ ...project.baseline });
  return (
    <Modal
      title="Approved project baseline"
      onClose={onClose}
      dirty={JSON.stringify(b) !== JSON.stringify(project.baseline)}
    >
      <p className="modal-intro">
        Keep incurred cost separate from work still to deliver. Commercial edits require existing
        unincorporated approvals to be reviewed again.
      </p>
      <fieldset disabled={!!project.archivedAt}>
        <div className="two-fields">
          <NumberField
            id="baseline-fee"
            label="Approved fee, excluding tax"
            prefix={symbol}
            value={b.fee}
            onChange={(v) => setB({ ...b, fee: v })}
          />
          <NumberField
            id="baseline-target"
            label="Target contribution margin"
            suffix="%"
            value={b.target}
            onChange={(v) => setB({ ...b, target: v })}
            hint="At least 0% and less than 100%."
          />
          <NumberField
            id="baseline-actual"
            label="Actual cost already incurred"
            prefix={symbol}
            value={b.actual}
            onChange={(v) => setB({ ...b, actual: v })}
          />
          <NumberField
            id="baseline-remaining"
            label="Forecast remaining cost"
            prefix={symbol}
            value={b.remaining}
            onChange={(v) => setB({ ...b, remaining: v })}
          />
        </div>
        <Field label="Approved scope">
          <textarea
            maxLength={100000}
            aria-label="Approved scope"
            rows={4}
            value={b.approvedScope}
            onChange={(e) => setB({ ...b, approvedScope: e.target.value })}
          />
        </Field>
      </fieldset>
      {project.archivedAt && (
        <p className="notice">
          This project is archived. Recover it in Projects before editing its baseline.
        </p>
      )}
      <details className="scope-details">
        <summary>
          Original baseline (preserved) <ChevronDown size={14} />
        </summary>
        <p className="field-hint">
          Approved fee {formatMoney(project.originalBaseline.fee || null, project.currency)} ·
          Incurred {formatMoney(project.originalBaseline.actual || null, project.currency)} ·
          Remaining {formatMoney(project.originalBaseline.remaining || null, project.currency)}
        </p>
        <p className="field-hint">
          {project.originalBaseline.approvedScope ||
            'The project began without a completed baseline.'}
        </p>
      </details>
      <div className="modal-actions">
        <button data-close-dialog className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!!project.archivedAt}
          onClick={() => onSave(b)}
        >
          Save baseline <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
function ApprovalModal({
  title,
  timezone,
  onClose,
  onSave,
  error,
}: {
  title: string;
  timezone: string;
  onClose: () => void;
  onSave: (e: string, d: string) => void;
  error: string;
}) {
  const [evidence, setEvidence] = useState('');
  const [date, setDate] = useState(localDate(timezone));
  return (
    <Modal
      title="Record approval"
      onClose={onClose}
      dirty={!!evidence || date !== localDate(timezone)}
    >
      <p className="modal-intro">
        Record the evidence for “{title}”. This records a decision; it is not an electronic
        signature.
      </p>
      <Field label="Approval date">
        <input
          maxLength={100000}
          aria-label="Approval date"
          type="date"
          required
          max={localDate(timezone)}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
      <Field label="Approval evidence">
        <textarea
          maxLength={100000}
          aria-label="Approval evidence"
          rows={4}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="Who approved, where, and what they agreed. Include a reference to the email, signed change order, or internal authorization."
        />
      </Field>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button data-close-dialog className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!evidence.trim() || !date}
          onClick={() => onSave(evidence, date)}
        >
          Record approval <ShieldCheck size={16} />
        </button>
      </div>
    </Modal>
  );
}
function ReconcileModal({
  project,
  change,
  gross,
  currency,
  onClose,
  onSave,
  error,
}: {
  project: Project;
  change: Change;
  gross: string | null;
  currency: Currency;
  onClose: () => void;
  onSave: (a: string, r: string) => void;
  error: string;
}) {
  const [a, setA] = useState('');
  const [r, setR] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const calc = calculate(project.baseline, change);
  let preview: Baseline | null = null;
  try {
    if (
      a.trim() &&
      r.trim() &&
      gross !== null &&
      /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(a) &&
      /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(r) &&
      new Money(a).isFinite() &&
      new Money(r).isFinite() &&
      new Money(a).plus(r).equals(gross) &&
      calc.effectiveFee !== null
    )
      preview = {
        ...project.baseline,
        fee: new Money(project.baseline.fee).plus(calc.effectiveFee).toFixed(2),
        actual: new Money(project.baseline.actual).plus(a).toFixed(2),
        remaining: new Money(project.baseline.remaining).plus(r).minus(change.removed).toFixed(2),
      };
  } catch {}
  return (
    <Modal
      title="Include approved change in baseline"
      onClose={onClose}
      dirty={!!a || !!r || confirmed}
    >
      <p className="modal-intro">
        Split the gross additional delivery cost of{' '}
        <strong>{formatMoney(gross ?? '0', currency)}</strong> between work already incurred and
        work still to deliver. These values must add up exactly.
      </p>
      {gross !== null && (
        <div className="notice exact-cost">
          <strong>
            Exact cost to allocate: {gross} {currency}
          </strong>
          <p>
            Keep any fraction of a cent in the split so the reconciliation matches the delivery
            estimate.
          </p>
          <div className="button-row">
            <button
              className="text-button"
              onClick={() => {
                setA('0');
                setR(gross);
              }}
            >
              All cost remains in the future
            </button>
            <button
              className="text-button"
              onClick={() => {
                setA(gross);
                setR('0');
              }}
            >
              All cost already incurred
            </button>
          </div>
        </div>
      )}
      <div className="two-fields">
        <NumberField
          id="reconcile-incurred"
          label="Additional cost already incurred"
          value={a}
          onChange={setA}
        />
        <NumberField
          id="reconcile-remaining"
          label="Additional cost still remaining"
          value={r}
          onChange={setR}
        />
      </div>
      <p className="field-hint">
        Eligible removed future cost: {formatMoney(change.removed || '0', currency)}. It is
        subtracted only from the future forecast.
      </p>
      {preview && (
        <div className="reconcile-preview">
          <h3>Review the new baseline</h3>
          {(['fee', 'actual', 'remaining'] as const).map((k) => (
            <div key={k}>
              <span>
                {
                  {
                    fee: 'Approved revenue',
                    actual: 'Incurred cost',
                    remaining: 'Remaining forecast',
                  }[k]
                }
              </span>
              <span>
                {formatMoney(project.baseline[k], currency)} <ArrowRight size={13} />{' '}
                <strong>{formatMoney(preview![k], currency)}</strong>
              </span>
            </div>
          ))}
        </div>
      )}
      <label className="check-label">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I confirmed incurred and remaining costs. Include this approved revision exactly once.
        </span>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button data-close-dialog className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!confirmed || !a.trim() || !r.trim()}
          onClick={() => onSave(a, r)}
        >
          Confirm reconciliation <CheckCheck size={16} />
        </button>
      </div>
    </Modal>
  );
}
function RestoreModal({
  data,
  onClose,
  onBackup,
  onRestore,
}: {
  data: Workspace;
  onClose: () => void;
  onBackup: () => void;
  onRestore: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Review workspace replacement" onClose={onClose}>
      <p className="modal-intro">
        This replaces the current local workspace with the backup. It preserves record identities
        and history. Repeating a restore does not create duplicates.
      </p>
      <div className="restore-stats">
        <Stat
          label="Projects"
          value={String(data.projects.length)}
          detail="Including archived and trash"
        />
        <Stat
          label="Changes"
          value={String(data.changes.length)}
          detail={`${data.revisions.length} revision records`}
        />
      </div>
      <div className="restore-project-list">
        {data.projects.map((p) => (
          <p key={p.id}>
            <FolderKanban size={16} />
            {p.name}
            <span className="badge">{p.sample ? 'Sample' : 'Custom'}</span>
          </p>
        ))}
      </div>
      <button className="button secondary" onClick={onBackup}>
        <Download size={16} /> Back up current workspace first
      </button>
      <label className="check-label restore-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I understand this will replace my current workspace and have kept any work I need.
        </span>
      </label>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!confirmed || busy}
          onClick={() => {
            setBusy(true);
            onRestore().catch((e) => {
              setError(e.message);
              setBusy(false);
            });
          }}
        >
          {busy ? 'Restoring…' : 'Replace workspace'}
        </button>
      </div>
    </Modal>
  );
}
function Clients({
  w,
  onChange,
  onOpen,
  selectedClientId,
}: {
  w: Workspace;
  onChange: (w: Workspace) => void;
  onOpen: (id: string) => void;
  selectedClientId?: string;
}) {
  const [selected, setSelected] = useState(w.clients[0]?.id ?? '');
  useEffect(() => {
    if (selectedClientId) setSelected(selectedClientId);
  }, [selectedClientId]);
  const c = w.clients.find((x) => x.id === selected);
  const [q, setQ] = useState('');
  const visibleClients = w.clients.filter((x) =>
    x.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  return (
    <div className="clients-layout">
      <section className="card">
        <div className="section-heading">
          <h2>Client records</h2>
          <button
            className="icon-button"
            aria-label="Add client"
            onClick={() => {
              const client = { id: id(), name: 'New client', contact: '', email: '', notes: '' };
              onChange({ ...w, clients: [...w.clients, client] });
              setSelected(client.id);
            }}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="search-input">
          <Search size={16} />
          <input
            maxLength={100000}
            aria-label="Search clients"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
          />
        </div>
        <div className="client-list">
          {visibleClients.map((x) => {
            const projectCount = w.projects.filter(
              (p) => p.clientId === x.id && !p.deletedAt,
            ).length;
            return (
              <button
                className={selected === x.id ? 'active' : ''}
                key={x.id}
                onClick={() => setSelected(x.id)}
              >
                <div className="agency-avatar">{x.name.slice(0, 1)}</div>
                <div>
                  <strong>{x.name || 'Unnamed client'}</strong>
                  <span>
                    {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                  </span>
                </div>
                <ChevronRight size={15} />
              </button>
            );
          })}
          {!visibleClients.length && (
            <div className="list-empty" role="status">
              <Empty title="No matching clients">Try a different name or clear your search.</Empty>
              <button className="button secondary" onClick={() => setQ('')}>
                Clear client search
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="card">
        {c ? (
          <>
            <h2>Client details</h2>
            {(['name', 'contact', 'email', 'address', 'notes'] as const).map((k) => (
              <Field
                key={k}
                label={
                  {
                    name: 'Client name',
                    contact: 'Contact person',
                    email: 'Email address',
                    address: 'Billing address',
                    notes: 'Private notes',
                  }[k]
                }
              >
                {k === 'notes' || k === 'address' ? (
                  <textarea
                    id={k === 'address' ? 'client-address' : undefined}
                    maxLength={100000}
                    aria-label={k === 'address' ? 'Billing address' : 'Private notes'}
                    rows={4}
                    value={c[k] ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...w,
                        clients: w.clients.map((x) =>
                          x.id === c.id ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                ) : (
                  <input
                    id={k === 'name' ? 'client-name' : undefined}
                    maxLength={100000}
                    aria-label={
                      {
                        name: 'Client name',
                        contact: 'Contact person',
                        email: 'Email address',
                        address: 'Billing address',
                        notes: 'Private notes',
                      }[k]
                    }
                    value={c[k] ?? ''}
                    onChange={(e) =>
                      onChange({
                        ...w,
                        clients: w.clients.map((x) =>
                          x.id === c.id ? { ...x, [k]: e.target.value } : x,
                        ),
                      })
                    }
                  />
                )}
              </Field>
            ))}
            <h3 className="client-projects-heading">Connected projects</h3>
            {!w.projects.some((p) => p.clientId === c.id && !p.deletedAt) && (
              <p className="field-hint">No connected projects yet.</p>
            )}
            {w.projects
              .filter((p) => p.clientId === c.id && !p.deletedAt)
              .map((p) => (
                <button className="record-row" key={p.id} onClick={() => onOpen(p.id)}>
                  <FolderKanban size={18} />
                  <strong>{p.name}</strong>
                  <ArrowRight size={16} />
                </button>
              ))}
          </>
        ) : (
          <Empty title="Add a client">
            Keep contact details and private notes alongside your projects.
          </Empty>
        )}
      </section>
    </div>
  );
}
function HistoryPanel({
  w,
  project,
  onSelect,
  onRevision,
  onAction,
  onReject,
}: {
  w: Workspace;
  project: Project;
  onSelect: (c: Change) => void;
  onRevision: (id: string) => void;
  onAction: (k: 'archive' | 'delete' | 'recover', c: Change) => void;
  onReject: (c: Change) => void;
}) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const list = w.changes
    .filter(
      (c) =>
        c.projectId === project.id &&
        (filter === 'trash' ? !!c.deletedAt : !c.deletedAt) &&
        (filter === 'all' || filter === 'trash' || filter === 'archived'
          ? filter !== 'archived' || !!c.archivedAt
          : c.status === filter) &&
        c.title.toLowerCase().includes(q.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.title.localeCompare(b.title)
        : compareRecordedDates(b.updatedAt, a.updatedAt),
    );
  return (
    <section
      className="card history-panel"
      id="history-panel"
      role="tabpanel"
      aria-labelledby="history-tab"
    >
      <div className="section-heading">
        <div>
          <h2>Project decisions</h2>
          <p>Earlier revisions are preserved when commercial terms change.</p>
        </div>
      </div>
      <div className="list-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            maxLength={100000}
            aria-label="Search changes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search requests…"
          />
        </div>
        <select
          aria-label="Filter change history"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All decisions</option>
          {['Draft', 'Quoted', 'Approved', 'Rejected'].map((s) => (
            <option key={s}>{s}</option>
          ))}
          <option value="archived">Archived</option>
          <option value="trash">Trash</option>
        </select>
        <select aria-label="Sort changes" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Recently updated</option>
          <option value="name">Request title</option>
        </select>
      </div>
      {list.map((c) => {
        const approvals = w.approvals.filter((a) => a.changeId === c.id);
        const revisions = w.revisions
          .filter((r) => r.changeId === c.id)
          .sort((a, b) => b.revision - a.revision || compareRecordedDates(b.at, a.at));
        return (
          <article className="history-record" key={c.id}>
            <div className="history-record-heading">
              <div>
                <button
                  className="text-button"
                  disabled={!!c.deletedAt}
                  onClick={() => onSelect(c)}
                >
                  {c.title || 'Untitled request'}
                  <ArrowUpRight size={14} />
                </button>
                <p>
                  {c.classification} · {c.route} · Revision {c.revision} · Updated{' '}
                  {dateLabel(c.updatedAt, w.agency.timezone)}
                </p>
              </div>

              <span className={`badge status-${c.status.toLowerCase()}`}>
                {c.deletedAt ? 'In trash' : c.includedAt ? 'Reconciled' : c.status}
              </span>
            </div>
            {approvals.map((a) => (
              <div className={`approval-record ${a.invalidatedAt ? 'stale' : ''}`} key={a.id}>
                <ShieldCheck size={15} />
                <div>
                  <strong>
                    {a.invalidatedAt ? 'Earlier approval · invalidated' : 'Approval recorded'} ·
                    Revision {a.revision} · {dateLabel(a.approvedAt, w.agency.timezone)}
                  </strong>
                  <p>{a.evidence}</p>
                </div>
              </div>
            ))}
            {c.includedAt && (
              <div className="notice success">
                Included in the baseline on {dateLabel(c.includedAt, w.agency.timezone)}. Revenue
                and costs are recorded once.
              </div>
            )}
            <div className="history-actions">
              {revisions.length > 0 && (
                <details>
                  <summary>
                    {revisions.length} saved revision{revisions.length === 1 ? '' : 's'}{' '}
                    <ChevronDown size={14} />
                  </summary>
                  <div className="revision-list">
                    {revisions.map((r) => (
                      <button key={r.id} onClick={() => onRevision(r.id)}>
                        Revision {r.revision} · {r.reason}{' '}
                        <span>{dateLabel(r.at, w.agency.timezone)}</span>
                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>
                </details>
              )}
              <div className="button-row">
                {!c.includedAt && !c.deletedAt && c.status !== 'Rejected' && (
                  <button className="text-button danger" onClick={() => onReject(c)}>
                    Reject decision
                  </button>
                )}
                {c.deletedAt || c.archivedAt ? (
                  <button className="text-button" onClick={() => onAction('recover', c)}>
                    <RotateCcw size={14} /> Recover
                  </button>
                ) : (
                  <button className="text-button" onClick={() => onAction('archive', c)}>
                    <Archive size={14} /> Archive
                  </button>
                )}
                {!c.deletedAt && (
                  <button
                    className="icon-button danger"
                    aria-label={`Move ${c.title} to trash`}
                    onClick={() => onAction('delete', c)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
      {list.length === 0 && (
        <Empty title="No matching decisions">Adjust the filters or start a new change.</Empty>
      )}
    </section>
  );
}
function RevisionModal({
  w,
  revisionId,
  onClose,
}: {
  w: Workspace;
  revisionId: string;
  onClose: () => void;
}) {
  const r = w.revisions.find((x) => x.id === revisionId);
  if (!r) return null;
  const p = w.projects.find((x) => x.id === r.projectId)!;
  const c = r.change;
  const earlier = w.revisions
    .filter((x) => x.changeId === r.changeId && x.revision < r.revision)
    .sort((a, b) => b.revision - a.revision || compareRecordedDates(b.at, a.at))[0];
  const differences = earlier ? revisionDifferences(earlier.change, c) : [];
  return (
    <Modal title={`Saved revision ${r.revision}`} wide onClose={onClose}>
      <p className="modal-intro">
        {r.reason} · {dateLabel(r.at, w.agency.timezone)}. This saved record is preserved when later
        terms change.
      </p>
      <span className="badge">
        {c.status} · {c.classification} · {c.route}
      </span>
      <h3>Changes since the previous revision</h3>
      {earlier ? (
        <>
          <p>
            Revision {earlier.revision} → {r.revision}. These private differences explain this saved
            decision.
          </p>
          {differences.length ? (
            <div className="revision-differences">
              {differences.map((d) => (
                <div className="revision-detail" key={d.key}>
                  <h4>{d.label}</h4>
                  <div className="two-fields">
                    <div>
                      <small>Previous</small>
                      <p>{d.before || 'Empty'}</p>
                    </div>
                    <div>
                      <small>This revision</small>
                      <p>{d.after || 'Empty'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No scope or estimate changes; this record captures a decision-state change.</p>
          )}
        </>
      ) : (
        <p>
          This is the first preserved revision. Its scope and financial inputs establish the
          comparison reference.
        </p>
      )}
      <h3>{c.title}</h3>
      {(
        [
          'request',
          'deliverables',
          'exclusions',
          'dependencies',
          'assumptions',
          'contractChecks',
          'removedScope',
        ] as const
      ).map((k) =>
        c[k] ? (
          <div className="revision-detail" key={k}>
            <h4>
              {
                {
                  request: 'Scope request',
                  deliverables: 'Deliverables',
                  exclusions: 'Exclusions',
                  dependencies: 'Client dependencies',
                  assumptions: 'Delivery assumptions',
                  contractChecks: 'Contract checks',
                  removedScope: 'Removed scope',
                }[k]
              }
            </h4>
            <p>{c[k]}</p>
          </div>
        ) : null,
      )}
      <div className="notice">
        <strong>Private financial snapshot</strong>
        <p>
          Hours: {c.hours || 'unknown'} · Loaded cost: {c.rate || 'unknown'} · Outside costs:{' '}
          {c.outside || 'unknown'}
        </p>
        <p>
          Proposed fee: {c.fee ? formatMoney(c.fee, p.currency) : 'unknown'} · Credit:{' '}
          {c.credit ? formatMoney(c.credit, p.currency) : 'unknown'}
        </p>
        <p>
          Baseline revenue: {r.baseline.fee ? formatMoney(r.baseline.fee, p.currency) : 'unknown'}
        </p>
      </div>
      <div className="modal-actions">
        <button className="button primary" onClick={onClose}>
          Close revision
        </button>
      </div>
    </Modal>
  );
}
