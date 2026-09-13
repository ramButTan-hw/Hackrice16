// A presentation hint, never used to mark synthetic records as measured data.
export const rehearsal = new URLSearchParams(globalThis.location?.search ?? '').has('rehearsal');
