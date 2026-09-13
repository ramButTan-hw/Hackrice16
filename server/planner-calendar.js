import { fail } from '../shared/contracts.js';
const base = 'https://www.googleapis.com/calendar/v3';

export function plannerCalendar({ auth, workspace }) {
  function owner() {
    const status = auth.status();
    if (!status.connected || !status.accountId) fail('Connect Google Calendar first.', 401);
    return status.accountId;
  }
  return {
    async busy(start, end) {
      const accountId = owner();
      const calendarId = await workspace.plannerCalendarId();
      const ids = ['primary', ...(calendarId ? [calendarId] : [])];
      const result = await auth.request(base + '/freeBusy', 'POST', {
        timeMin: new Date(start - 900000).toISOString(), timeMax: new Date(end + 900000).toISOString(),
        items: ids.map(id => ({ id })),
      }, accountId);
      if (owner() !== accountId) fail('Google account changed. Find times again.', 409);
      return ids.flatMap(id => {
        const calendar = result.calendars?.[id];
        if (!calendar || calendar.errors?.length || !Array.isArray(calendar.busy)) fail('Google availability could not be checked. Reconnect Google and try again.', 502);
        return calendar.busy.map(interval => {
          const start = Date.parse(interval.start), end = Date.parse(interval.end);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) fail('Google returned incomplete availability.', 502);
          return { start, end };
        });
      });
    },
    async publish(plan) {
      const accountId = owner();
      if (plan.google && plan.google.accountId !== accountId) fail('Reconnect the Google account used for this plan.', 409);
      const calendarId = await workspace.plannerCalendarId(plan.timeZone);
      const eventId = plan.id.replaceAll('-', '');
      const url = `${base}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`;
      // Stable event IDs allow recovery after a network failure or a local save failure.
      let event;
      try { event = await auth.request(url, 'GET', undefined, accountId); }
      catch (e) { if (e.googleStatus !== 404) throw e; }
      if (!event) {
        const busy = await this.busy(plan.start, plan.end);
        if (busy.some(p => plan.start < p.end + 900000 && plan.end + 900000 > p.start)) fail('Google Calendar has a conflict within 15 minutes of this block. Choose another time.', 409);
        try {
          event = await auth.request(url.slice(0, url.lastIndexOf('/')), 'POST', {
            id: eventId, summary: plan.title,
            start: { dateTime: new Date(plan.start).toISOString(), timeZone: plan.timeZone },
            end: { dateTime: new Date(plan.end).toISOString(), timeZone: plan.timeZone },
            extendedProperties: { private: { jarvisPlanId: plan.id } },
          }, accountId);
        } catch (e) {
          if (e.googleStatus !== 409) throw e;
          event = await auth.request(url, 'GET', undefined, accountId);
        }
      }
      if (event.status === 'cancelled') fail('This event was deleted in Google. Create a new work block to add it again.', 409);
      if (event.extendedProperties?.private?.jarvisPlanId !== plan.id) fail('Google event does not match this plan.', 409);
      if (owner() !== accountId) fail('Google account changed. Reconnect the original account to check this event.', 409);
      return { accountId, calendarId, eventId, url: event.htmlLink || 'https://calendar.google.com/calendar/u/0/r', syncedAt: Date.now() };
    },
  };
}
