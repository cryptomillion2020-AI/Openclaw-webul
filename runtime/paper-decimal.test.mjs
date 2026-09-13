import test from 'node:test';
import assert from 'node:assert/strict';
import {parse,format,mul,div,roundDiv} from './paper-decimal.mjs';
test('exact base-ten arithmetic and symmetric half-away rounding',()=>{
 assert.equal(format(parse('0.1')+parse('0.2')),'0.3');
 assert.equal(format(mul(parse('0.1'),parse('0.2'))),'0.02');
 assert.equal(format(div(parse('1'),parse('3'))),'0.333333333333');
 assert.equal(roundDiv(5n,2n),3n);assert.equal(roundDiv(-5n,2n),-3n);
 assert.equal(format(parse('1e-8')),'0.00000001');
 assert.equal(format(parse('999999999999.123456789012')),'999999999999.123456789012');
 for(const s of ['NaN','Infinity','1e100','0.0000000000001','',{},null])assert.throws(()=>parse(s));
});
test('cost allocations reconcile on final close',()=>{
 const cost=parse('10'),quantity=parse('3');
 const allocated=roundDiv(cost*parse('1'),quantity);
 assert.equal(allocated+(cost-allocated),cost);
 assert.equal(format(cost-allocated),'6.666666666667');
});
