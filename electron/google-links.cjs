// Only destinations that Acumen creates or uses for Google sign-in may leave the app.
function googleLink(value) {
  if (typeof value !== 'string' || value.length > 10000) throw new Error('Invalid Google link.');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Google link.'); }
  const allowed = (url.hostname === 'accounts.google.com' && url.pathname === '/o/oauth2/v2/auth')
    || (url.hostname === 'docs.google.com' && /^\/(document|presentation)\/d\/[^/]+(?:\/|$)/.test(url.pathname))
    || (url.hostname === 'calendar.google.com' && url.pathname.startsWith('/calendar/'))
    || (url.hostname === 'www.google.com' && url.pathname === '/calendar/event');
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed) throw new Error('Only Google sign-in, Docs, Slides, and Calendar links can be opened.');
  return url.href;
}
async function openGoogleLink(value, shell) {
  const url = googleLink(value);
  try { await shell.openExternal(url, { activate: true }); }
  catch { throw new Error('macOS could not open your browser. Try again, or copy the Google link and paste it into your browser.'); }
}
module.exports = { googleLink, openGoogleLink };
