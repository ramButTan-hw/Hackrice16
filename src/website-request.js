import { websiteUrl } from '../shared/website-request.js';
export { websiteRequest } from '../shared/website-request.js';
export async function openWebsite(address, surface = window) {
  const url = websiteUrl(address);
  const open = surface.helpPanel?.openWebsite ?? surface.helpBridge?.openWebsite;
  if (open) { await open(url); return url; }
  if (surface.helpPanel || surface.helpBridge) throw new Error('Restart Jarvis to enable website opening.');
  const popup = surface.open(url, '_blank');
  if (!popup) throw new Error('Allow browser pop-ups for Jarvis and try again.');
  popup.opener = null;
  return url;
}
