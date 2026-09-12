import { existsSync } from 'node:fs';
import { analyzeInsight } from '../server/insights.js';
import { analyzeWindow } from '../server/local-analysis.js';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
const samples=Array.from({length:61},(_,i)=>({timestamp:i*2000,heartRate:i<20?70:90,breathingRate:i<20?14:18,quality:1}));
const report=analyzeWindow({startedAt:0,samples},120000);
// One live API request, using synthetic data only. No camera or personal readings.
const result = await analyzeInsight({ source: 'demo', task: 'Synthetic integration verification: solve an arithmetic exercise', elapsedSeconds: 120, analysis: report, presage: { heartRate: 88, breathingRate: 18.5, quality: 1, source: 'demo' }, inactivity: { idleSeconds: 5 }, previousIntervention: null });
console.log(JSON.stringify({ verified: true, decision: result.decision, usage: result.usage }));
