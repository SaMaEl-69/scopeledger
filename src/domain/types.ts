export type Currency = 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD';
export type Classification = 'Addition' | 'Included' | 'Defect' | 'Ambiguous';
export type DecisionRoute = 'Quote' | 'Absorb' | 'Exchange' | 'Defer';
export type DecisionStatus = 'Draft' | 'Quoted' | 'Approved' | 'Rejected';
export interface Baseline {
  fee: string;
  actual: string;
  remaining: string;
  target: string;
  approvedScope: string;
}
export interface Project {
  id: string;
  clientId: string;
  name: string;
  currency: Currency;
  sample: boolean;
  baseline: Baseline;
  originalBaseline: Baseline;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  state?: 'active' | 'on-hold' | 'completed';
  deadline?: string | null;
  /** Calendar days added to the original deadline; unfinished drafts remain text. */
  additionalDays?: string;
}
export interface Client {
  id: string;
  name: string;
  contact: string;
  email: string;
  notes: string;
  address?: string;
}
export interface ChangeTerms {
  title: string;
  request: string;
  deliverables: string;
  exclusions: string;
  dependencies: string;
  assumptions: string;
  contractChecks: string;
  classification: Classification;
  route: DecisionRoute;
  hours: string;
  rate: string;
  outside: string;
  removed: string;
  removedScope: string;
  fee: string;
  feeMode?: 'excluding-tax' | 'including-tax' | 'custom';
  taxRate?: string;
  additionalDays?: string;
  credit: string;
  creditReason: string;
  contractConfirmed: boolean;
}
export interface Change extends ChangeTerms {
  id: string;
  projectId: string;
  revision: number;
  status: DecisionStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  includedAt: string | null;
}
export interface ChangeRevision {
  id: string;
  projectId: string;
  changeId: string;
  revision: number;
  at: string;
  reason: string;
  change: Change;
  baseline: Baseline;
}
export interface Approval {
  id: string;
  projectId: string;
  changeId: string;
  revision: number;
  approvedAt: string;
  recordedAt: string;
  evidence: string;
  invalidatedAt: string | null;
}
export interface Reconciliation {
  id: string;
  projectId: string;
  changeId: string;
  approvalId: string;
  at: string;
  addedFee: string;
  incurred: string;
  remaining: string;
  removedFuture: string;
  before: Baseline;
  after: Baseline;
  beforeAdditionalDays?: string;
  afterAdditionalDays?: string;
  deliveryDate?: string;
}
export interface AgencySettings {
  name: string;
  defaultCurrency: Currency;
  defaultRate: string;
  defaultTarget: string;
  defaultsReviewedFor?: string;
  legalName?: string;
  address?: string;
  email?: string;
  website?: string;
  logoDataUrl?: string;
  accentColor?: string;
  timezone?: string;
  invoicePrefix?: string;
  paymentInstructions?: string;
  documentFooter?: string;
  defaultTaxRate?: string;
  approvalText?: string;
  deliveryImplications?: string;
  messageTemplates?: {
    quote: string;
    absorb: string;
    exchange: string;
    defer: string;
    followup: string;
  };
}
export interface DocumentSigner {
  name: string;
  role: string;
  date: string;
  imageDataUrl: string;
}
export interface DocumentSignatures {
  enabled: boolean;
  showClient: boolean;
  issuer: DocumentSigner;
  client: DocumentSigner;
}
export interface ClientDocument {
  schemaVersion: 1;
  kind: 'brief' | 'invoice' | 'credit';
  reference: string;
  agency: {
    name: string;
    legalName: string;
    address: string;
    email: string;
    website: string;
    logoDataUrl: string;
    accentColor: string;
  };
  client: { name: string; contact: string; email: string; address: string };
  projectName: string;
  changeTitle: string;
  changeReference: string;
  revision: number;
  status: string;
  currency: Currency;
  issueDate: string;
  dueDate: string;
  scope: string;
  deliverables: string;
  removedScope: string;
  exclusions: string;
  dependencies: string;
  assumptions: string;
  deliveryImplications: string;
  approvalText: string;
  approvalRecorded: string;
  approvalDate: string;
  description: string;
  subtotal: string;
  taxRate: string;
  tax: string;
  total: string;
  paymentInstructions: string;
  footer: string;
  demo: boolean;
  /** Optional extension: older preserved documents remain valid and unchanged. */
  signatures?: DocumentSignatures;
  feeMode?: ChangeTerms['feeMode'];
  additionalDays?: string;
  deliveryDate?: string;
  sections?: DocumentSections;
}
export interface DocumentSections {
  agencyLogo: boolean;
  contactDetails: boolean;
  exclusions: boolean;
  dependencies: boolean;
  assumptions: boolean;
  delivery: boolean;
  footer: boolean;
}
export interface DocumentRecord {
  id: string;
  projectId: string;
  changeId: string;
  revision: number;
  kind: 'brief' | 'invoice' | 'credit';
  createdAt: string;
  assetId?: string;
  snapshot?: ClientDocument | null;
  issuedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string;
}
export type DocumentOverrides = Partial<
  Pick<
    ClientDocument,
    | 'reference'
    | 'issueDate'
    | 'dueDate'
    | 'taxRate'
    | 'paymentInstructions'
    | 'deliveryImplications'
    | 'approvalText'
    | 'description'
    | 'footer'
    | 'demo'
    | 'signatures'
    | 'sections'
  >
>;
/** Editable settings are saved separately from preserved client-document snapshots. */
export interface DocumentDraft {
  projectId: string;
  changeId: string;
  revision: number;
  kind: ClientDocument['kind'];
  updatedAt: string;
  values: DocumentOverrides;
}
export interface PaymentRecord {
  id: string;
  projectId: string;
  documentId: string;
  amount: string;
  receivedAt: string;
  reference?: string;
  note?: string;
  createdAt?: string;
  voidedAt?: string | null;
  voidReason?: string;
}
export type EventType =
  | 'milestone'
  | 'delivery'
  | 'client-content'
  | 'quote-followup'
  | 'approval-followup'
  | 'invoice-due'
  | 'task';
export interface CalendarEvent {
  id: string;
  projectId: string;
  changeId?: string;
  documentId?: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  allDay?: boolean;
  timezone?: string;
  type?: EventType;
  status?: 'open' | 'completed' | 'cancelled';
  source?: 'manual' | 'invoice' | 'project';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}
export interface ActivityRecord {
  id: string;
  at: string;
  kind: string;
  message: string;
  projectId?: string;
  changeId?: string;
  documentId?: string;
}
export interface CustomScenario extends Scenario {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface AssumptionPreset {
  id: string;
  title: string;
  text: string;
  deletedAt: string | null;
}
export interface DecisionComparison {
  id: string;
  projectId: string;
  changeId: string;
  name: string;
  terms: ChangeTerms;
  createdAt: string;
  deletedAt: string | null;
}
export interface LicenseActivation {
  id: string;
  browserLabel: string;
  serverActivationId: string;
  verifiedAt: string;
}
export interface Workspace {
  schemaVersion: 3;
  id: string;
  sequence: number;
  updatedAt: string;
  agency: AgencySettings;
  clients: Client[];
  projects: Project[];
  changes: Change[];
  revisions: ChangeRevision[];
  approvals: Approval[];
  reconciliations: Reconciliation[];
  documents: DocumentRecord[];
  /** Optional for existing schema-3 workspaces and backups. */
  documentDrafts?: DocumentDraft[];
  payments: PaymentRecord[];
  calendarEvents: CalendarEvent[];
  activity: ActivityRecord[];
  customScenarios: CustomScenario[];
  assumptionPresets: AssumptionPreset[];
  comparisons: DecisionComparison[];
  context: {
    projectId: string;
    changeId: string;
    view:
      | 'workspace'
      | 'dashboard'
      | 'projects'
      | 'clients'
      | 'settings'
      | 'support'
      | 'calendar'
      | 'documents'
      | 'playbook';
    guideDismissed: boolean;
    lastBackupAt: string | null;
  };
}
export interface Scenario {
  id: string;
  title: string;
  description: string;
  request: string;
  deliverables: string;
  exclusions: string;
  dependencies: string;
  assumptions: string;
  contractChecks: string;
  classification: Classification;
  route: DecisionRoute;
  confirm: string;
}
export const CURRENCIES: Currency[] = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'];
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
