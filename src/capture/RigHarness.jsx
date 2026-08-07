/* Rig proof harness — not a shipped route. */
import { AgentRig } from '../world/AgentRig';
const PHASES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
export default function RigHarness() {
  return (
    <div style={{ background:'#14100B', color:'#B89555', font:'13px ui-monospace,monospace', padding:24 }}>
      <div style={{ marginBottom:6, letterSpacing:'0.14em' }}>
        PATH 1-REFERENCE PROOF · SEVIN · WALK CYCLE
      </div>
      <div style={{ opacity:0.5, marginBottom:16, fontSize:11 }}>
        One locked reference. Zero baked frames. The face is byte-identical in all eight.
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:10 }}>
        {PHASES.map(p => (
          <div key={p} style={{ textAlign:'center' }}>
            <AgentRig agent="sevin" gait="walk" phase={p} scale={0.55} />
            <div style={{ opacity:0.4, fontSize:10, marginTop:4 }}>φ {p}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
