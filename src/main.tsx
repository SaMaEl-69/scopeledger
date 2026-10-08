import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './design.css';
import '../shared/brand.css';
import { applyAppearance, readAppearance } from '../shared/appearance.mjs';
applyAppearance(readAppearance());
ReactDOM.createRoot(document.getElementById('root')!, {
  // A boundary displays recovery controls. Never echo exception payloads that
  // might include client text; unexpected uncaught errors keep React's reporting.
  onCaughtError: () =>
    console.warn('A ScopeLedger view could not render. Recovery controls are available.'),
}).render(<App />);
