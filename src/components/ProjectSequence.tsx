import './project-sequence.css';

export const PROJECT_STEPS = [
  {
    label: 'Project',
    title: 'Choose a project',
    detail: 'Select the project you want to work on.',
  },
  {
    label: 'Baseline',
    title: 'Complete its baseline',
    detail: 'Confirm the approved scope, project fee, delivery costs and target margin.',
  },
  {
    label: 'Change',
    title: 'Load or describe a change',
    detail: 'Use an example or describe the request and its deliverables.',
  },
  {
    label: 'Costs',
    title: 'Review costs',
    detail: 'Check the delivery estimate before deciding what to charge.',
  },
  {
    label: 'Fee',
    title: 'Choose a fee',
    detail: 'Choose your response and fee, then confirm the agreement.',
  },
  {
    label: 'Brief',
    title: 'Review the brief',
    detail: 'Review the client-facing scope, fee, dependencies and approval wording.',
  },
  { label: 'Export', title: 'Export', detail: 'Download the reviewed brief as a PDF.' },
] as const;

export function ProjectSequence({
  step,
  onSelect,
}: {
  step: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav className="project-sequence" aria-label="Project workflow">
      {PROJECT_STEPS.map(({ label, title }, index) => (
        <button
          type="button"
          key={label}
          aria-label={`${index + 1}. ${title}`}
          aria-current={step === index + 1 ? 'step' : undefined}
          aria-keyshortcuts={`Alt+${index + 1}`}
          className={step === index + 1 ? 'current' : ''}
          onClick={() => onSelect(index + 1)}
        >
          <span className="sequence-number" aria-hidden="true">
            {index + 1}
          </span>
          <span className="sequence-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
