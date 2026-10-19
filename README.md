# Imposter Who?

A family-friendly React game prototype with:

- Room creation and joining screens
- Family lobby and room code
- Secret player/imposter role reveal
- Sequential clue turns with a **Next** button
- Voice-call panel with browser microphone permission
- Voting and round results
- Responsive mobile layout

## Run it

Install Node.js LTS, then from this folder run:

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## Current scope

The game logic currently runs in the browser as a playable prototype. The microphone button requests local browser microphone access, but remote family-to-family audio requires connecting the call panel to a LiveKit room and a small server that creates LiveKit tokens. Socket.IO should be added for true multi-device room synchronization; the UI states and turn events are already separated so that integration can be added without redesigning the screens.
