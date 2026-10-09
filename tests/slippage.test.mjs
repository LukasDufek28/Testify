import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateSlippage} from '../lib/slippage.js';
test('slippage averages both sides, includes spread and increases with consumed depth',()=>{
 const book={bids:[[99,1],[98,10]],asks:[[101,1],[102,10]]};
 const small=estimateSlippage(book,50),large=estimateSlippage(book,200);
 assert.ok(Math.abs(small.slippageBps-100)<.11);
 assert.ok(Math.abs(large.slippageBps-150)<.11);
 assert.equal(small.spreadBps,200);
 assert.ok(large.slippageBps>small.slippageBps);
 assert.throws(()=>estimateSlippage(book,1e6),/depth/);
 assert.throws(()=>estimateSlippage({...book,auction_mode:true},100),/auction/);
 assert.throws(()=>estimateSlippage({bids:[[101,1]],asks:[[100,1]]},100),/crossed/);
});
test('tight liquid books use explicit minimum and malformed quantities are rejected',()=>{
 assert.equal(estimateSlippage({bids:[[99.9999,100]],asks:[[100.0001,100]]},100).slippageBps,.5);
 assert.throws(()=>estimateSlippage({bids:[],asks:[]},100),/empty/);
 assert.throws(()=>estimateSlippage({},NaN),/valid/);
});
