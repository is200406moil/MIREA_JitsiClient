# Android reference observations

Observed in the official Jitsi Meet app running in BlueStacks on 2026-11-01. These are direct UI observations, not assumptions about the iPhone version.

- Home: left-aligned title; unfocused room field cycles generated suggestions. Focus expands a description with Create / Join. Short names add an inline security warning. Empty history has explanatory text.
- Opening a short room: warning screen first; Continue opens preview and does not join automatically.
- Preview: close icon at leading edge; room label over preview; microphone/video controls together; centered, narrower name and join controls. Empty display name is allowed. Camera off replaces video with an avatar in the same area.
- Lobby: same preview area, spinner and waiting text, organizer button together. Joining first shows the meeting shell, then Lobby if authentication is needed.
- Profile: no separate field labels; example name and email placeholders; Gravatar explanation; Apply near bottom; bottom navigation remains available.
- Settings: Android switches have a narrow track and round thumb. In-call settings omit server and initial local-media settings.
- Call: microphone, video, chat, screen share, hand, tile view, overflow and hangup on the toolbar at the observed width. Blank-area tap hides/shows controls without moving media.
- Overflow: inset bottom menu; no reaction strip. Contains driving/audio-only mode, security, streaming, whiteboard, YouTube, statistics, breakout rooms and settings. Toolbar actions are not duplicated there.
- Chat: left-aligned heading and close icon; Chat / Polls tabs; search, centered plain empty message, composer at bottom.
- Poll form: question and option placeholders without separate labels; Add option; Cancel / Save; Save disabled while incomplete.
- Participants: search/invite, remote participants before self, avatars, role and media state icons. Moderator ellipsis opens a menu before acting.
- Hangup returns directly to home and records call duration.

## Remaining implementation gaps

Native polling, breakout rooms, streaming/YouTube/statistics, full moderator admission policies and audio-output selection are not implemented by the current native bridge. The app still uses a server iframe for media rather than a native Jitsi SDK port. Screen-share support depends on the Aurora WebView and requires device testing. Do not describe the current app as a complete native Android port.
