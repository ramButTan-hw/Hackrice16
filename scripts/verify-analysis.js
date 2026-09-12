import { existsSync } from 'node:fs';
import { analyzeInsight } from '../server/insights.js';
import { readFile } from 'node:fs/promises';
if (existsSync('.env')) process.loadEnvFile('.env');
if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
const { report } = JSON.parse(await readFile('artifacts/matlab-window-verification.json', 'utf8'));
// One live API request, using synthetic data only. No camera or personal readings.
const result = await analyzeInsight({ source: 'demo', task: 'Synthetic integration verification: solve an arithmetic exercise', elapsedSeconds: 120, matlab: report, presage: { heartRate: 88, breathingRate: 18.5, quality: 1, source: 'demo' }, inactivity: { idleSeconds: 5 }, previousIntervention: null });
console.log(JSON.stringify({ verified: true, decision: result.decision, usage: result.usage }));
