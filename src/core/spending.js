/* Aggregate actual resource payments, without retaining a growing transaction
 * log. Inventory transfers are explicitly excluded. Old saves begin a partial
 * record; loading them never invents historical transactions. */
import { RESOURCES } from './tiles.js';
const owners = new WeakMap();
export const SPENDING_CATEGORIES = ['buildings','tools','refining','abundance','unlocks','props','care','restoration','other'];
export function bindSpending(s) { owners.set(s.inv,s); }
export function recordSpending(inv,cost,category) {
  const s=owners.get(inv);
  if(!s || category===null)return;
  const key=SPENDING_CATEGORIES.includes(category)?category:'other';
  const totals=s.spending.totals[key]??={};
  for(const r of RESOURCES) if(cost[r]>0)totals[r]=(totals[r]||0)+cost[r];
}
export function loadSpending(s,record) {
  s.spending={since:s.time,complete:false,totals:{}};
  if(!record || typeof record!=='object' || !Number.isFinite(record.since) || record.since<0 || record.since>s.time || typeof record.complete!=='boolean' || !record.totals || typeof record.totals!=='object')return;
  const totals={};
  for(const key of SPENDING_CATEGORIES) {
    if(!record.totals[key])continue;
    const row={};
    for(const r of RESOURCES) {
      const n=record.totals[key][r];
      if(n!==undefined && (!Number.isFinite(n)||n<0))return;
      if(n>0)row[r]=n;
    }
    totals[key]=row;
  }
  s.spending={since:record.since,complete:record.complete,totals};
}
export function recordedSpending(s) {
  return SPENDING_CATEGORIES.filter(k=>s.spending?.totals[k]).map(id=>({id,cost:s.spending.totals[id]}));
}

export function spendingSnapshot(record) {
  return {...record,totals:Object.fromEntries(SPENDING_CATEGORIES.filter(k=>record.totals[k]).map(k=>[k,
    Object.fromEntries(RESOURCES.filter(r=>record.totals[k][r]>0).map(r=>[r,record.totals[k][r]]))]))};
}
