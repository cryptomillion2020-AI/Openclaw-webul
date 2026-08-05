/**
 * MarketsHarness.jsx — capture-only mount for approval renderings.
 *
 * Unlike the Bridge harness, this one carries NO specimen payload. It loads
 * the REAL shared/state files (market-context/current.json and
 * mode3-conditions.json), staged to public/data at capture time. What the
 * Architect approves is therefore the page against live fleet state, not a
 * dressed-up sample — which is the whole point of the rebuild.
 *
 * ?state=dark drops both sources to null to prove the empty rendering.
 */
import { createRoot } from 'react-dom/client';
import { Markets } from '../pages/Markets';
import '../phase4-tokens.css';
import '../App.css';

const params = new URLSearchParams(location.search);
const dark = params.get('state') === 'dark';

document.documentElement.style.background = '#0A0806';
const root = createRoot(document.getElementById('root'));

if (dark) {
  root.render(<Markets marketContext={null} mode3={null} feedHealth={null} />);
} else {
  fetch('/data/markets-capture.json')
    .then(r => r.json())
    .then(d => root.render(
      <Markets marketContext={d.marketContext} mode3={d.mode3} feedHealth={null} />
    ));
}
