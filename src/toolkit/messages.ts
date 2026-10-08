import type { AgencySettings, Change, Workspace } from '../domain/types';
import { buildBrief } from '../domain/commercial';
import { formatMoney, Money } from '../domain/finance';
export type TemplateKind = keyof NonNullable<AgencySettings['messageTemplates']>;
export const MESSAGE_TEMPLATES: NonNullable<AgencySettings['messageTemplates']> = {
  quote:
    'Hello {{client_name}},\n\nFor {{project_name}}, we have reviewed “{{change_title}}”.\n\n{{scope}}\n\nDeliverables: {{deliverables}}\nExclusions: {{exclusions}}\nDependencies: {{dependencies}}\nAssumptions: {{assumptions}}\n\nProposed additional fee or explicit credit: {{fee}} ({{currency}}), excluding tax.\n\n{{approval_requirements}}\nStatus: {{approval_status}}',
  absorb:
    'Hello {{client_name}},\n\nFor {{project_name}}, we propose handling “{{change_title}}” with no additional client fee.\n\n{{scope}}\nDeliverables: {{deliverables}}\nExclusions: {{exclusions}}\nDependencies: {{dependencies}}\nAssumptions: {{assumptions}}\n\n{{approval_requirements}}\nStatus: {{approval_status}}',
  exchange:
    'Hello {{client_name}},\n\nFor {{project_name}}, we propose this scope exchange for “{{change_title}}”:\n\n{{scope}}\nAdded deliverables: {{deliverables}}\nProposed removed scope: {{removed_scope}}\nDependencies: {{dependencies}}\nAssumptions: {{assumptions}}\nAdditional fee or explicit credit: {{fee}} ({{currency}}), excluding tax.\n\nPlease confirm both the added and removed scope. {{approval_requirements}}\nStatus: {{approval_status}}',
  defer:
    'Hello {{client_name}},\n\nWe have kept “{{change_title}}” for {{project_name}} as a deferred request.\n\n{{scope}}\n\nThis message makes no delivery, date or fee commitment. We can review the scope and dependencies before agreeing the next step.',
  followup:
    'Hello {{client_name}},\n\nFollowing up on “{{change_title}}” for {{project_name}}.\n\nCurrent status: {{approval_status}}.\n{{approval_requirements}}\n\nPlease let us know whether you wish to proceed or discuss the scope. No approval is inferred from this follow-up.',
};
export const MESSAGE_TOKENS = [
  'client_name',
  'project_name',
  'change_title',
  'scope',
  'deliverables',
  'exclusions',
  'dependencies',
  'assumptions',
  'removed_scope',
  'fee',
  'currency',
  'approval_requirements',
  'approval_status',
] as const;
export function messagePlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1].trim()))];
}

export async function copyClientResponse(text: string): Promise<boolean> {
  try {
    if (!globalThis.navigator?.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
export function composeClientMessage(
  w: Workspace,
  change: Change,
  kind?: TemplateKind,
  customText?: string,
) {
  const selected = kind ?? (change.route.toLowerCase() as TemplateKind);
  if (selected !== 'followup' && selected !== change.route.toLowerCase())
    throw new Error(
      'Choose this response in the change workspace before composing its client message.',
    );
  const document = buildBrief(w, change.id);
  const template =
    customText ?? w.agency.messageTemplates?.[selected] ?? MESSAGE_TEMPLATES[selected];
  const credit = document.subtotal !== '' && new Money(document.subtotal).isNegative();
  const fields: Record<(typeof MESSAGE_TOKENS)[number], string> = {
    client_name: document.client.name || '[client name to confirm]',
    project_name: document.projectName,
    change_title: document.changeTitle || '[request title to confirm]',
    scope: document.scope || '[scope to confirm]',
    deliverables: document.deliverables || '[deliverables to confirm]',
    exclusions: document.exclusions || '[exclusions to confirm]',
    dependencies: document.dependencies || '[dependencies to confirm]',
    assumptions: document.assumptions || '[assumptions to confirm]',
    removed_scope: document.removedScope || '[removed scope to confirm]',
    fee:
      change.route === 'Defer'
        ? 'No commitment'
        : document.subtotal === ''
          ? '[fee to confirm]'
          : `${credit ? 'Credit ' : ''}${formatMoney(new Money(document.subtotal).abs().toString(), document.currency)}`,
    currency: document.currency,
    approval_requirements: !change.contractConfirmed
      ? `Contract review is still pending. ${document.approvalText}`
      : document.approvalText,
    approval_status: document.approvalRecorded
      ? `Recorded approval for revision ${document.revision} (${document.approvalDate})`
      : `${change.status} — no recorded current-revision approval`,
  };
  const unknown = new Set<string>();
  const text = template.replace(/\{\{([^{}]+)\}\}/g, (match, rawToken: string) => {
    const token = rawToken.trim();
    if (Object.hasOwn(fields, token)) return fields[token as keyof typeof fields];
    unknown.add(token);
    return match;
  });
  return { text, unknownTokens: [...unknown], kind: selected };
}
