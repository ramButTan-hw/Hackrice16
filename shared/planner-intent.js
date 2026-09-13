export function isPlannerRequest(text) {
  const value = String(text).toLowerCase().replace(/[’]/g, "'").replace(/[.!?,]+/g, ' ').trim();
  if (/\b(don't|do not|not|never|without|instead of)\b/.test(value)) return false;
  return /^(?:(?:hey )?jarvis\s+)?(?:(?:please|can you|could you|would you|will you)\s+)?(?:open|show|launch|bring up|pull up)(?:\s+me)?\s+(?:(?:my|the|jarvis)\s+)?(?:planner|schedule|planning window|planner window)(?:\s+(?:please|for me))?$/.test(value);
}
