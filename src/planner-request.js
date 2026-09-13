export { isPlannerRequest } from '../shared/planner-intent.js';
export async function openPlanner(surface = window) {
  const open = surface.helpPanel?.planner ?? surface.companionWindow?.planner;
  if (open) { await open(); return; }
  if (surface.helpPanel || surface.companionWindow) throw new Error('Restart Acumen to enable opening the planner from chat.');
  const popup = surface.open('/?planner-window=1', 'jarvis-planner');
  if (!popup) throw new Error('Your browser blocked the planner window. Allow pop-ups for Acumen and try again.');
  popup.opener = null;
}
