import { useState } from 'react';
import { SUPPORT_EMAIL } from '../domain/access';
export function SupportAction({ context = 'Workspace' }: { context?: string }) {
  const [message, setMessage] = useState('');
  const body = `ScopeLedger issue report\n\nArea: ${context}\nBrowser and operating system:\nWhat I expected:\nWhat happened:\nSteps to reproduce:\n\nPlease omit license keys and private project data. No files are attached automatically.`;
  return (
    <div className="support-action">
      <a
        className="button secondary"
        href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`ScopeLedger support — ${context}`)}&body=${encodeURIComponent(body)}`}
      >
        Lifetime support
      </a>
      <button
        className="text-button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(SUPPORT_EMAIL);
            setMessage('Support address copied');
          } catch {
            setMessage(`Copy this address: ${SUPPORT_EMAIL}`);
          }
        }}
      >
        {SUPPORT_EMAIL}
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
