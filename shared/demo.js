export const isPulseDemo=session=>session?.source==='demo'&&session.demoScenario==='sustained_pulse';
// Accelerated presentation timing applies only to explicitly simulated sessions.
export const pulseTiming=session=>isPulseDemo(session)?{baselineMs:20000,baselineSamples:10,holdSeconds:30}:{baselineMs:60000,baselineSamples:25,holdSeconds:null};
