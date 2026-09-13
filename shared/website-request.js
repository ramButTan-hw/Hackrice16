export function websiteUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || /[\s\\\u0000-\u001f]/.test(value)) throw new Error('Use a website address such as roblox.com.');
  const input = value.trim();
  const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : 'https://' + input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) throw new Error('Only HTTP or HTTPS website addresses can be opened.');
  return url.href;
}
export function websiteRequest(text) {
  const value = String(text).trim().replace(/^(?:hey\s+)?jarvis[,! ]*/i, '').replace(/[.!?]+$/, '').trim();
  const match = value.match(/^(?:(?:please|can you|could you|would you|will you)\s+)?(?:open|launch|visit|go to|take me to|bring up)\s+(.+?)(?:\s+(?:please|for me|in (?:my |the )?browser))?$/i);
  if (!match) return null;
  let address = match[1].replace(/^(?:the )?(.+?) (?:website|site)$/i,'$1').replace(/\s+dot\s+/gi, '.');
  const names = { roblox: 'roblox.com', youtube: 'youtube.com', 'youtube music': 'music.youtube.com', google: 'google.com', github: 'github.com', 'google docs': 'docs.google.com', 'google drive': 'drive.google.com', 'google calendar': 'calendar.google.com', gmail: 'mail.google.com' };
  address = names[address.toLowerCase()] ?? address;
  try { return websiteUrl(address); } catch { return null; }
}
