// Exact fixed-point base-ten accounting. Wire values are canonical decimal strings.
// Scale 12; values outside representation are rejected, never silently truncated.
export const SCALE=10n**12n;
export function parse(value){
 if(!['string','number'].includes(typeof value))throw Error('invalid_decimal');
 const text=String(value);if(text.length>80)throw Error('invalid_decimal');
 const m=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
 if(!m)throw Error('invalid_decimal');
 const exp=Number(m[4]||0);if(!Number.isInteger(exp)||Math.abs(exp)>24)throw Error('decimal_range');
 const shift=12+exp-(m[3]||'').length;
 let n=BigInt(m[2]+(m[3]||''));
 if(shift>=0)n*=10n**BigInt(shift);else{const d=10n**BigInt(-shift);if(n%d)throw Error('decimal_precision');n/=d;}
 if(n>10n**48n)throw Error('decimal_range');
 return m[1]? -n:n;
}
export function format(n){const sign=n<0n?'-':'';n=n<0n?-n:n;const fraction=(n%SCALE).toString().padStart(12,'0').replace(/0+$/,'');return sign+(n/SCALE).toString()+(fraction?'.'+fraction:'');}
export function roundDiv(n,d){if(d<=0n)throw Error('invalid_divisor');const sign=n<0n?-1n:1n;n=n<0n?-n:n;return sign*((n+d/2n)/d);}
export const mul=(a,b)=>roundDiv(a*b,SCALE);
export const div=(a,b)=>roundDiv(a*SCALE,b);
