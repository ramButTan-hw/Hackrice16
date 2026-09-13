import test from 'node:test';
import assert from 'node:assert/strict';
import {monthDays,plansOnDay} from '../src/planner-calendar.js';
test('month grid covers full weeks, leap days and year boundaries',()=>{
 const feb=monthDays('2028-02');assert.equal(feb.length,42);assert.ok(feb.includes('2028-02-29'));assert.equal(new Date(feb[0]+'T12:00:00').getDay(),0);
 const jan=monthDays('2027-01');assert.ok(jan[0].startsWith('2026-12'));assert.equal(new Set(jan).size,42);
});
test('calendar shows blocks on every day they overlap, excluding exact ending midnight',()=>{
 const ms=s=>new Date(s).getTime();const plans=[{id:'overnight',start:ms('2026-09-12T23:00'),end:ms('2026-09-13T01:00')},{id:'midnight',start:ms('2026-09-12T22:00'),end:ms('2026-09-13T00:00')}];
 assert.deepEqual(plansOnDay(plans,'2026-09-13').map(p=>p.id),['overnight']);assert.equal(plansOnDay(plans,'2026-09-12').length,2);
});
