export function appendEvent(session, time, source, event, data = null) {
  session.events ??= [];
  session.events.push({ sequence: (session.eventSequence ?? 0) + 1, timestamp: time, source, event, data });
  session.eventSequence = session.events.at(-1).sequence;
  session.events = session.events.slice(-180);
}
