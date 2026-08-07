/**
 * ScrollWorldHarness.jsx — capture-only mount for approval renderings.
 * Not linked from the app, not in the route table.
 */
import { createRoot } from 'react-dom/client';
import { ScrollWorld } from '../world/ScrollWorld';
import manifest from '../../public/world/final/manifest.json';
import '../phase4-tokens.css';
import '../App.css';

const stills = new URLSearchParams(location.search).get('stills') === '1';
document.documentElement.style.background = '#0A0806';
createRoot(document.getElementById('root')).render(
  <ScrollWorld manifest={manifest} stillsOnly={stills}>
    <div>
      <div className="sw-eyebrow">Master Workflow · Scroll City</div>
      <h1 className="sw-title">One world.<br />Keep scrolling.</h1>
    </div>
  </ScrollWorld>
);
