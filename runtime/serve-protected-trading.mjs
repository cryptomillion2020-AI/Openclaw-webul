// Dedicated loopback-only origin for the existing Cloudflare tunnel.
// Does not replace the richer private WebUI release or expose the raw legacy socket.
import path from 'node:path';
import { realpath, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createReleaseServer } from './serve-trading.mjs';
import { createAccessVerifier, createAccessPrincipalVerifier, accessAssertion } from './access-verifier.mjs';
import config from './protected-access.json' with { type: 'json' };
import {mkdirSync,lstatSync,chmodSync,existsSync} from 'node:fs';
import {PaperSimulation} from './paper-simulation.mjs';
import {createPaperActionApprovals} from './paper-capability.mjs';

export function createProtectedOrigin({ root, accessConfig = config, verifier, releaseId = 'isolated-unsealed', ledgerPath=null, ...options }) {
  if (accessConfig.appOrigin !== 'https://app.sevinsolutions.com') throw new Error('Exact application origin required');
  const verify = verifier || createAccessVerifier(accessConfig);
  const principal = createAccessPrincipalVerifier(accessConfig);
  let ledger=null;
  let simulation={};
  if(ledgerPath){
    if(!path.isAbsolute(ledgerPath))throw new Error('Absolute persistent ledger path required');
    const directory=path.dirname(ledgerPath);mkdirSync(directory,{recursive:true,mode:0o700});
    if(lstatSync(directory).isSymbolicLink()||(existsSync(ledgerPath)&&lstatSync(ledgerPath).isSymbolicLink()))throw new Error('Symlink ledger refused');
    chmodSync(directory,0o700);const previous=process.umask(0o077);
    try{const gate=createPaperActionApprovals();ledger=new PaperSimulation({filename:ledgerPath,verifyApproval:gate.verifyApproval});chmodSync(ledgerPath,0o600);simulation={ledger,requestApproval:gate.requestApproval};}finally{process.umask(previous);}
  }
  const paper = {...simulation,identity:req=>principal(accessAssertion(req.headers)),...options.paper};
  const app = createReleaseServer({ ...options, paper, root, extraOrigins: [accessConfig.appOrigin], authorizeRequest: req => verify(accessAssertion(req.headers)) });
  app.server.prependListener('request', (_req, res) => res.setHeader('X-Trading-Origin-Release', releaseId));
  const close=app.close;app.close=async()=>{await close();ledger?.close();};
  return app;
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const port = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 5181;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid loopback port');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  const manifest = await readFile(path.join(root, '../RELEASE-MANIFEST.json'));
  const releaseId = createHash('sha256').update(manifest).digest('hex');
  if (path.basename(path.dirname(root)) !== releaseId) throw new Error('Content-addressed release required');
  const { server, close } = createProtectedOrigin({ root, releaseId, ledgerPath:'/home/k/.openclaw/services/trading-protected-origin/state/paper.sqlite' });
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ event:'ready',host:'127.0.0.1',port,mode:'paper-only',access:'issuer-and-audience-pinned' })));
  for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { close().then(() => process.exit(0)); setTimeout(() => process.exit(1), 8000).unref(); });
}
