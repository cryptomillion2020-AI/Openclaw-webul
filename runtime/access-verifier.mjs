// Shared Worker/origin verifier. Only public signing keys are cached; never assertions or identities.
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const ASSERTION_HEADER = 'cf-access-jwt-assertion';
export function accessAssertion(headers) {
  const value = typeof headers?.get === 'function' ? headers.get(ASSERTION_HEADER) : headers?.[ASSERTION_HEADER];
  return typeof value === 'string' && value.length <= 16384 ? value : null;
}

export function createAccessPrincipalVerifier(config, { keyResolver, now = () => new Date() } = {}) {
  if (!config || !/^[a-f0-9]{64}$/.test(config.audience || '')) throw new Error('Access audience must be explicitly pinned');
  const issuer = new URL(config.issuer);
  if (issuer.protocol !== 'https:' || !issuer.hostname.endsWith('.cloudflareaccess.com') || issuer.username || issuer.password || issuer.port || !['', '/'].includes(issuer.pathname) || issuer.search || issuer.hash || config.issuer !== issuer.origin) throw new Error('Invalid pinned Access issuer');
  const keys = keyResolver || createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), { timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 300000 });
  return async assertion => {
    if (typeof assertion !== 'string' || assertion.length === 0 || assertion.length > 16384) return false;
    try {
      const { payload } = await jwtVerify(assertion, keys, {
        issuer: config.issuer, audience: config.audience, algorithms: ['RS256'],
        requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp'], currentDate: now(), clockTolerance: 0,
      });
      // Public metadata and organization tokens are not application authorization.
      const valid = payload.type === 'app' && typeof payload.sub === 'string' && payload.sub.length > 0 &&
        typeof payload.iat === 'number' && payload.iat <= now().getTime() / 1000 + 30;
      return valid ? Object.freeze({authenticated:true,subject:payload.sub}) : false;
    } catch { return false; }
  };
}

export function createAccessVerifier(config, options) {
  const principal = createAccessPrincipalVerifier(config, options);
  return async assertion => Boolean(await principal(assertion));
}
