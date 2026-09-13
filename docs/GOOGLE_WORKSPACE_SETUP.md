# Google Workspace for Jarvis

Jarvis can turn the current screen into study notes or a checklist in Google Docs, append to documents it created, and create or reschedule work blocks in a separate **Jarvis work sessions** calendar. It can also create editable Google Slides decks with up to eight slides.

## Setup

1. In Google Cloud, enable Google Docs API, Google Slides API, Google Drive API, and Google Calendar API.
2. Configure the OAuth consent screen. If the app is in Testing, add each teammate's Google account as a test user.
3. Create an OAuth client with application type **Desktop app**.
4. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your private `.env`. These are separate from the Gemini API key. Never commit `.env`.
5. Restart the backend and Electron app (`npm run dev` for development).
6. Open Jarvis, open the three-dot settings menu, and choose **Connect Google**. Finish sign-in in the browser and grant the requested access.

The desktop OAuth callback uses `http://127.0.0.1:3001/oauth/google/callback` (or the configured backend `PORT`). A Web application OAuth client is not interchangeable with the Desktop client.

## Try it

- “Hey Jarvis, turn the current screen into study notes in a Google Doc.”
- “Turn this page into a checklist.”
- “Schedule a 30-minute study block tomorrow at 3 PM.”
- “Add these points to my study notes.”
- “Move my study block to tomorrow at 4 PM.”

Explicit screen-to-notes requests take one screenshot even when the general Screen toggle is off. Keep the relevant material visible. Screenshots are sent to Gemini for this request, not saved as image files by this feature.

Jarvis displays a preview before writing to Google. Review the full content or event time, then say **confirm** or click the confirmation button. Say **cancel** to discard it. With several previews, spoken confirmation applies to the first pending one. Previews expire after 20 minutes. Checklists use plain checkbox characters in a Google Doc.

## Slides and AI illustrations

Say “Create a five-slide presentation about this screen” or “Make a deck about effective study habits with illustrations.” Review the slide titles and bullets. Say **generate illustrations** (or use the button) to generate up to two images, then **confirm** to save the deck. You can confirm without images. Repeated image requests reuse successful images in the same preview; ask for a revised deck to change their prompts.

Images use `GEMINI_IMAGE_MODEL` (default `gemini-2.5-flash-image`) and `GEMINI_IMAGE_API_KEY` (falling back to `GEMINI_API_KEY` if unset). Image models need their own available quota; a working text model does not prove image quota is enabled. A quota of zero requires configuring billing/model access in Google AI Studio, not repeatedly retrying. Failed generation leaves the text preview usable.

Decks use a consistent 16:9 layout with green, blue, or ivory themes, editable headings and bullets, and optional embedded illustrations. The app uploads a PowerPoint file through Drive's conversion API to create Google Slides; no extra OAuth scope or public image hosting is required. The Drive API must be enabled. AI illustrations are conceptual visuals, not verified scientific diagrams. Images stay in preview memory until confirmation, then persist with the local deck registry and are embedded in the Google deck; image bytes are not sent to Backboard memory.

## Access and memory

The app requests identity/email, `drive.file`, `calendar.app.created`, and `calendar.events.freebusy` scopes. It works with documents and a calendar it creates; it does not browse your existing Drive. The Planner can check busy times on your primary calendar and the Jarvis work sessions calendar. Reconnect Google after this upgrade and grant the availability permission. Other calendars are not checked. Document and chat calendar edits require a known Jarvis-created item.

Click Planner to open its separate desktop window. Save a suggested block, then click Add to Google Calendar to send only its title and times to Jarvis work sessions. Linked plans offer Open in Google; manage event changes there. Google edits are not imported into the local plan. Remove from Jarvis only keeps the Google event. Closing the planner does not end a work session.

OAuth tokens stay in backend memory. Reconnect Google after restarting the backend. Disconnect clears the local connection; revoke the app in your Google account settings to remove Google's authorization too.

Local item IDs, links, and operation status are stored in ignored `data/google-workspace.json`, separated by Google account. With work memory enabled, Backboard also remembers completed item links. Google document content remains in Google; ordinary conversation memory still follows the existing memory setting.

If a write fails after being sent, Jarvis labels it uncertain and will not repeat that operation automatically. Open Google and check whether it succeeded before requesting another copy. Backend restarts discard pending previews; ask for a fresh preview.

## Troubleshooting

- **Access blocked:** check the consent screen's test users and that the account is allowed.
- **Invalid client/redirect:** use a Desktop app client and restart after editing `.env`.
- **Permissions/API error:** enable all four APIs in the credentials' project and reconnect with the requested permissions.
- **Preview only:** creation happens after confirmation and Google sign-in.
- **Screen capture requires desktop:** run Electron, not just the Vite page in a browser.

References: [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

## Standalone image requests

Say “Hey Jarvis, generate an image of a cozy study room in watercolor.” The image appears in chat with a Download link; no Google sign-in or Slides deck is needed. Request square, landscape or portrait composition. Images use a separate image-generation request and show a progress status. One standalone generation runs at a time; errors do not automatically spend quota on retries.

Set `GEMINI_IMAGE_API_KEY` to your image-enabled Google key and restart the backend. Chat continues to use `GEMINI_API_KEY`. Both standalone images and slide illustrations use the image key. Generated image bytes stay in the current chat until it closes and are excluded from subsequent text history and Backboard memory. Download to keep a local copy. Follow-up variations generate new images from a text description; pixel-based image editing is not supported yet.

## Editing decks and retaining images

Say “Edit the last presentation: make slide 2 shorter and switch to the blue theme.” Jarvis prepares an `update_slides` preview; confirm updates the existing link. Available themes are green, blue, and ivory. This is a complete deck replacement, so review every slide before confirming, especially if you made manual edits in Google. Jarvis checks the Drive version immediately before uploading and rejects a stale preview; this is not an atomic collaborative-edit lock.

Enable **Google Slides API** as well as Drive API to let Jarvis read current slide content, particularly decks made before this update. No additional OAuth scope is needed. Deck outlines and generated slide images now persist in ignored local `data/google-workspace.json` so later edits can retain illustrations. Do not delete this file if you want to retain the app's deck context. Previews still expire and disappear on restart.

When asking for images in a deck, Jarvis generates them into the preview before confirmation. Each preview shows the number of attached images. An image generated separately in chat can be inserted with **Add to a slide…** when a slide preview is open. Revising a preview keeps images with unchanged illustration prompts; changing a prompt means generating a replacement. Illustrations are embedded in the uploaded presentation, not linked to publicly hosted images.

On macOS, Open in Google supports both `calendar.google.com` and the `www.google.com/calendar/event` links returned by Calendar. If the browser cannot launch, the preview displays an error and a selectable link. Restart the desktop app after updating to load the new link handler and voice-panel planner controls.
