// Preserve the existing app.sevinsolutions.com/ws* route, but use the real guarded origin.
// The origin and this Worker both verify the pinned Access assertion; no edge localhost target.
import { createTradingEdge } from '../trading-app/index.mjs';
export default createTradingEdge({ staticAssets: false });
