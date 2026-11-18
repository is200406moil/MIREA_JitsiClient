/* Call screen of the Aurora Jitsi client.
 *
 * The page is served by the application from 127.0.0.1 and talks to the
 * Jitsi server directly through lib-jitsi-meet, which is loaded from that
 * server so its version always matches the deployment. The interface follows
 * the Jitsi Meet mobile client; its strings come from Jitsi's own language
 * files (lang/main*.json). The QML side only hosts the page and handles
 * system integration: sharing, sign-in popups and leaving the page.
 */
(function () {
    'use strict';

    const cfg = window.CALL_CONFIG;
    const prefs = cfg.preferences || {};
    const $ = id => document.getElementById(id);

    // ---------------------------------------------------------------- bridge

    function notify(name, data) {
        fetch('event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, data: data || {} }),
            credentials: 'omit'
        }).catch(() => {});
    }

    // Errors go to the application's call log (see AppState), since the
    // WebView console is not reachable on a device.
    function log(...args) {
        console.warn(...args);
        const text = args.map(arg => {
            if (arg instanceof Error) return arg.name + ': ' + arg.message;
            if (typeof arg === 'string') return arg;
            try { return JSON.stringify(arg); } catch (error) { return String(arg); }
        }).join(' ');
        notify('log', { message: text.slice(0, 2000) });
    }

    // ------------------------------------------------------------------ i18n

    let strings = [{}, {}];

    function lookup(table, key) {
        return key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);
    }

    function t(key, params) {
        let value = lookup(strings[0], key);
        if (typeof value !== 'string') value = lookup(strings[1], key);
        if (typeof value !== 'string') return key;
        value = value.replace(/\$t\(([^)]+)\)/g, (match, nested) => t(nested));
        return value.replace(/{{\s*(\w+)\s*}}/g, (match, name) => (params && params[name] !== undefined ? params[name] : ''));
    }

    async function loadStrings() {
        const files = cfg.language === 'en' ? ['lang/main.json'] : ['lang/main-ru.json', 'lang/main.json'];
        const loaded = await Promise.all(files.map(file => fetch(file).then(r => r.json()).catch(() => ({}))));
        strings = loaded.length === 1 ? [loaded[0], {}] : loaded;
    }

    function translateStatic(root) {
        root.querySelectorAll('[data-t]').forEach(node => { node.textContent = t(node.dataset.t); });
    }

    // ----------------------------------------------------------------- helpers

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function icon(name, size) {
        const node = el('i', 'icon' + (size ? ' ' + size : ''));
        node.style.setProperty('--icon', `url(icons/${name}.svg)`);
        return node;
    }

    function setupIcons(root) {
        root.querySelectorAll('[data-icon]').forEach(node => node.style.setProperty('--icon', `url(icons/${node.dataset.icon}.svg)`));
    }

    // A server that does not answer would keep the page loading for minutes.
    function loadScript(src, timeout = 20000) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => { script.remove(); reject(new Error('Timed out loading ' + src)); }, timeout);
            script.src = src;
            script.onload = () => { clearTimeout(timer); resolve(); };
            script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Failed to load ' + src)); };
            document.head.appendChild(script);
        });
    }

    // Same rule as getBackendSafeRoomName() in jitsi-meet.
    function backendSafeRoomName(room) {
        let name = room;
        try { name = decodeURIComponent(name); } catch (error) { /* keep as is */ }
        name = name.normalize('NFKC').toLowerCase();
        return encodeURIComponent(name).toLowerCase();
    }

    const AVATAR_COLORS = ['#6A50D3', '#FF9B42', '#DF486F', '#73348C', '#B23683', '#F96E57', '#4380E2', '#238561', '#00A8B3'];

    function initials(name) {
        const words = (name || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '';
        const first = Array.from(words[0])[0] || '';
        const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] || '') : '';
        return (first + last).toUpperCase();
    }

    function avatarColor(text) {
        let hash = 0;
        for (const ch of text || '') hash += ch.codePointAt(0);
        return AVATAR_COLORS[hash % AVATAR_COLORS.length];
    }

    const avatarCache = new Map();

    function probeAvatar(url) {
        if (!url) return Promise.resolve(false);
        if (!avatarCache.has(url)) {
            avatarCache.set(url, new Promise(resolve => {
                const image = new Image();
                image.onload = () => resolve(true);
                image.onerror = () => resolve(false);
                image.src = url;
            }));
        }
        return avatarCache.get(url);
    }

    function fillAvatar(node, person) {
        const name = displayNameOf(person);
        const text = initials(name);
        node.style.backgroundColor = avatarColor(text);
        node.style.backgroundImage = '';
        node.textContent = '';
        if (text) node.textContent = text;
        else node.appendChild(icon('user'));
        const url = person && person.avatarURL;
        node.dataset.avatar = url || '';
        if (url) {
            probeAvatar(url).then(ok => {
                if (ok && node.dataset.avatar === url) {
                    node.textContent = '';
                    node.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
                }
            });
        }
    }

    function avatar(person, className) {
        const node = el('div', 'avatar' + (className ? ' ' + className : ''));
        fillAvatar(node, person);
        return node;
    }

    async function gravatarUrl(email) {
        if (!email || !window.crypto || !crypto.subtle) return '';
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()));
        const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
        return `https://www.gravatar.com/avatar/${hex}?s=256&d=404&r=g`;
    }

    function formatDuration(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor(total / 60) % 60;
        const s = total % 60;
        const pad = n => String(n).padStart(2, '0');
        return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    function formatTime(ts) {
        const date = new Date(ts);
        return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    }

    function isRaised(value) {
        if (!value) return false;
        if (typeof value === 'number') return value > 0;
        return value !== '0' && value !== 'false';
    }

    // ------------------------------------------------------------------ state

    const state = {
        serverConfig: null,
        connection: null,
        conference: null,
        jwt: cfg.jwt || '',
        joined: false,
        leaving: false,
        localId: 'local',
        local: { id: 'local', local: true, name: cfg.displayName, email: cfg.email, avatarURL: cfg.avatarURL,
            role: 'none', raisedHand: false, tracks: {} },
        remotes: new Map(),
        dominantId: '',
        pinnedId: '',
        tileView: false,
        toolboxVisible: true,
        audioOnly: !!prefs.lowBandwidth || !!cfg.audioOnly,
        facingMode: 'user',
        audioMuted: !!cfg.audioMuted,
        videoMuted: !!cfg.videoMuted,
        startedAt: 0,
        messages: [],
        unread: 0,
        chatTab: 'chat',
        polls: new Map(),
        pollsUnread: 0,
        pollDraft: null,
        volumes: new Map(),
        iAmVisitor: false,
        liveStream: { status: 'off', session: null },
        recording: { status: 'off', session: null },
        transcribing: false,
        subtitlesRequested: false,
        subtitles: [],
        demoteActor: '',
        promotionRequests: new Map(),
        visitorCount: 0,
        localStats: null,
        remoteStats: new Map(),
        followMe: false,
        followMeRecorder: false,
        followMeModerator: '',
        followMeModeratorRecorder: false,
        startReactionsMuted: false,
        joinedAt: 0,
        privateRecipient: null,
        knocking: new Map(),
        lobbyEnabled: false,
        locked: false,
        roomPassword: '',
        // XMPP login of servers with username/password authentication.
        credentials: null,
        // The login saved for this server (AppState, secure storage): used
        // once for the first connection instead of asking again.
        savedLogin: cfg.savedLogin || null,
        upgradeProcess: null,
        waitForOwnerTimer: 0,
        screen: '',
        waiting: null,
        retries: 0,
        switchingRoom: false,
        roomName: null,
        breakoutRooms: {},
        roomCounter: 0,
        collabDetails: null,
        whiteboardOpen: false,
        screenSharing: false,
        avModeration: { audio: false, video: false },
        connectionIndicators: new Map(),
        participantFilter: ''
    };

    function displayNameOf(person) {
        if (!person) return '';
        if (person.local) return person.name || t('localRecording.me');
        return person.name || t('notify.somebody');
    }

    function isModerator() {
        return state.conference ? state.conference.isModerator() : false;
    }

    function everyone() {
        return [state.local, ...state.remotes.values()];
    }

    function person(id) {
        if (id === LOCAL_SCREEN_ID) return localScreen();
        return id === state.localId || id === 'local' ? state.local : state.remotes.get(id);
    }

    // The own screen share is a second video track beside the camera; it is
    // shown as a view of its own (as in the mobile client).
    const LOCAL_SCREEN_ID = 'local-screen';

    function localScreen() {
        const desktop = state.local.tracks.desktop;
        if (!desktop) return null;
        return { id: LOCAL_SCREEN_ID, local: true, screen: true, name: state.local.name, avatarURL: state.local.avatarURL,
            role: 'none', raisedHand: false, tracks: { video: desktop } };
    }

    // ------------------------------------------------------------- rendering

    let renderQueued = false;
    let reportedCallState = '';

    // The application cover and the meeting notification show the microphone
    // and the meeting time. Sent outside requestAnimationFrame, which does not
    // run while the application is in the background.
    function reportCallState() {
        const callState = {
            audioMuted: !!state.audioMuted,
            canUnmute: !state.iAmVisitor,
            startedAt: state.startedAt || 0
        };
        const text = JSON.stringify(callState);
        if (text === reportedCallState) return;
        reportedCallState = text;
        notify('callState', callState);
    }

    function render() {
        reportCallState();
        if (renderQueued) return;
        renderQueued = true;
        requestAnimationFrame(() => {
            renderQueued = false;
            renderTitlebar();
            renderMedia();
            renderToolbox();
            renderLonely();
            if (state.screen === 'participants') renderParticipants();
        });
    }

    function stageParticipant() {
        if (state.pinnedId && person(state.pinnedId)) return person(state.pinnedId);
        if (state.dominantId && state.remotes.has(state.dominantId)) return state.remotes.get(state.dominantId);
        const first = state.remotes.values().next();
        return first.done ? state.local : first.value;
    }

    // AudioLevels._updateLargeVideoShadow: the rings around the avatar of the
    // participant on the stage while that participant speaks.
    function onAudioLevel(id, level) {
        const node = $('stage').querySelector('.avatar');
        const view = node && node.closest('[data-id]');
        if (!view || view.dataset.id !== id) return;
        const value = parseFloat(level) || 0;
        const inner = value > 0.15 ? 20 : 0;
        const outer = Math.round(inner * 2 * value + inner);
        node.style.boxShadow = `0 0 ${inner ? 2 : 0}px ${inner}px rgba(255, 255, 255, .4), 0 0 ${outer ? 6 : 0}px ${outer}px rgba(255, 255, 255, .2)`;
    }

    // getParticipantCountWithFake: a shared video counts as a participant.
    function participantCountWithFake() {
        return state.remotes.size + 1 + (state.sharedVideo ? 1 : 0);
    }

    function filmstripVisible() {
        return participantCountWithFake() > 1;
    }

    // shouldRemoteVideosBeVisible (native): in a one to one meeting the other
    // participant is on the stage only, unless the local video is pinned.
    function shouldRemoteVideosBeVisible() {
        const count = participantCountWithFake();
        const localPinned = !!state.pinnedId && state.pinnedId === state.local.id;
        return count > 2 || (count > 1 && localPinned) || !!(state.serverConfig || {}).disable1On1Mode;
    }

    function videoTrackOf(p) {
        const track = p && p.tracks.video;
        if (!track || track.isMuted()) return null;
        // Low bandwidth mode keeps only audio and screen sharing.
        if (state.audioOnly && !p.local && track.getVideoType() !== 'desktop') return null;
        return track;
    }

    // A view is the DOM of one participant inside one container (stage,
    // filmstrip or tile grid). It keeps its <video> and re-attaches only when
    // the participant's track actually changes.
    function updateView(view, p, options) {
        view.dataset.id = p.id;
        const gifUrl = activeGif(p.id);
        let gif = view.querySelector('img.gif');
        if (gifUrl) {
            if (!gif) { gif = el('img', 'gif'); view.prepend(gif); }
            if (gif.getAttribute('src') !== gifUrl) gif.src = gifUrl;
        } else if (gif) gif.remove();
        const track = gifUrl ? null : videoTrackOf(p);
        let video = view.querySelector('video');
        if (track) {
            if (!video) {
                video = el('video');
                video.autoplay = true;
                video.playsInline = true;
                video.muted = true;
                view.prepend(video);
            }
            if (video._track !== track) {
                if (video._track) video._track.detach(video);
                track.attach(video);
                video._track = track;
            }
            video.classList.toggle('mirror', !!p.local && state.facingMode === 'user' && track.getVideoType() !== 'desktop');
        } else if (video) {
            if (video._track) video._track.detach(video);
            video.remove();
        }
        let holder = view.querySelector('.avatar-holder');
        if (!track && !gifUrl) {
            if (!holder) {
                holder = el('div', 'avatar-holder');
                holder.appendChild(el('div', 'avatar'));
                view.appendChild(holder);
            }
            const node = holder.firstChild;
            const key = displayNameOf(p) + '|' + (p.avatarURL || '');
            if (node.dataset.key !== key) {
                node.dataset.key = key;
                node.style.boxShadow = '';
                fillAvatar(node, p);
            }
        } else if (holder) {
            holder.remove();
        }
        if (options.indicators) {
            view.querySelectorAll('.indicators, .top-indicators, .name').forEach(node => node.remove());
            const bottom = el('div', 'indicators');
            const audio = p.tracks.audio;
            if (!p.screen && (!audio || audio.isMuted())) {
                const muted = el('div', 'indicator');
                muted.appendChild(icon('mic-slash', 'small'));
                bottom.appendChild(muted);
            }
            if (p.role === 'moderator' && !p.local) {
                const mod = el('div', 'indicator');
                mod.appendChild(icon('moderator', 'small'));
                bottom.appendChild(mod);
            }
            if (state.pinnedId === p.id) {
                const pin = el('div', 'indicator');
                pin.appendChild(icon('pinned', 'small'));
                bottom.appendChild(pin);
            }
            if (bottom.childNodes.length) view.appendChild(bottom);
            const connection = connectionIndicator(p);
            if (p.raisedHand || connection) {
                const top = el('div', 'top-indicators');
                if (connection) top.appendChild(connection);
                if (p.raisedHand) {
                    const hand = el('div', 'indicator hand');
                    hand.appendChild(icon('raise-hand', 'small'));
                    top.appendChild(hand);
                }
                view.appendChild(top);
            }
            if (options.name) view.appendChild(el('div', 'name', displayNameOf(p)));
        }
        // On the stage the thumbnail with its indicators may be hidden (a
        // meeting of two), so a raised hand is shown there too.
        if (options.stageHand) {
            let hand = view.querySelector('.stage-hand');
            if (p.raisedHand) {
                if (!hand) {
                    hand = el('div', 'stage-hand');
                    hand.appendChild(icon('raise-hand', 'small'));
                    hand.appendChild(el('span', 'stage-hand-name'));
                    view.appendChild(hand);
                }
                hand.querySelector('.stage-hand-name').textContent = displayNameOf(p);
            } else if (hand) {
                hand.remove();
            }
        }
        view.classList.toggle('dominant', !p.local && p.id === state.dominantId && state.remotes.size > 1);
        view.classList.toggle('raised-hand', !!p.raisedHand);
    }

    function reconcile(container, people, className, options) {
        const existing = new Map();
        container.querySelectorAll(':scope > .' + className.split(' ')[0]).forEach(node => existing.set(node.dataset.id, node));
        people.forEach((p, index) => {
            let view = existing.get(p.id);
            if (view) existing.delete(p.id);
            else {
                view = el('div', className);
                view.addEventListener('click', event => options.onClick(view.dataset.id, event));
                if (options.menu) onLongPress(view, () => openParticipantMenu(view.dataset.id));
            }
            updateView(view, p, options);
            if (container.children[index] !== view) container.insertBefore(view, container.children[index] || null);
        });
        existing.forEach(node => {
            const video = node.querySelector('video');
            if (video && video._track) video._track.detach(video);
            node.remove();
        });
    }

    function renderMedia() {
        const app = $('app');
        renderSharedVideo(!!state.sharedVideo && !state.pinnedId && !state.tileView);
        app.classList.toggle('tile-view', state.tileView);
        $('stage').hidden = state.tileView;
        $('tiles').hidden = !state.tileView;
        const showSelf = !prefs.hideSelfView;
        if (state.tileView) {
            reconcile($('stage'), [], 'participant', {});
            reconcile($('filmstrip'), [], 'thumbnail', {});
            const people = [...state.remotes.values()];
            if (showSelf || !people.length) people.push(state.local);
            if (localScreen()) people.push(localScreen());
            layoutTiles(people.length);
            reconcile($('tiles'), people, 'tile participant', { indicators: true, name: true, menu: true, onClick: toggleToolbox });
        } else {
            reconcile($('tiles'), [], 'tile', {});
            const videoOnStage = !!state.sharedVideo && !state.pinnedId;
            reconcile($('stage'), videoOnStage ? [] : [stageParticipant()], 'participant', { stageHand: true, onClick: toggleToolbox });
            const thumbs = shouldRemoteVideosBeVisible() ? [...state.remotes.values()] : [];
            if (filmstripVisible() && showSelf) thumbs.push(state.local);
            const screen = localScreen();
            if (screen) thumbs.push(screen);
            reconcile($('filmstrip'), thumbs, 'thumbnail participant', { indicators: true, menu: true, onClick: togglePin });
            $('filmstrip').hidden = !thumbs.length;
        }
        updateReceiverConstraints();
    }

    function layoutTiles(count) {
        const grid = $('tiles');
        const columns = count <= 2 ? 1 : count <= 6 ? 2 : 3;
        const rows = Math.ceil(count / columns);
        const style = getComputedStyle(grid);
        const width = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const height = grid.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const size = Math.floor(Math.min((width - (columns - 1) * 4) / columns, (height - (rows - 1) * 4) / rows));
        grid.style.gridTemplateColumns = `repeat(${columns}, ${Math.max(size, 80)}px)`;
        grid.style.justifyContent = 'center';
        grid.style.gridAutoRows = `${Math.max(size, 80)}px`;
        grid.style.setProperty('--tile', `${Math.max(size, 80)}px`);
    }

    let lastConstraints = '';

    function updateReceiverConstraints() {
        const conference = state.conference;
        if (!conference || !state.joined || typeof conference.setReceiverConstraints !== 'function') return;
        const constraints = {};
        let onStage = [];
        if (!state.tileView) {
            const staged = stageParticipant();
            const track = staged && !staged.local && staged.tracks.video;
            if (track && typeof track.getSourceName === 'function') {
                onStage = [track.getSourceName()];
                // A shared screen gets the full quality on the stage, as in
                // jitsi-meet (ULTRA, 2160); a camera stays at 720.
                const desktop = track.getVideoType && track.getVideoType() === 'desktop';
                constraints[onStage[0]] = { maxHeight: desktop ? 2160 : 720 };
            }
        }
        const value = {
            lastN: state.audioOnly ? 0 : -1,
            defaultConstraints: { maxHeight: state.tileView ? 360 : 180 },
            constraints,
            onStageSources: onStage
        };
        const serialized = JSON.stringify(value);
        if (serialized === lastConstraints) return;
        lastConstraints = serialized;
        try { conference.setReceiverConstraints(value); } catch (error) { log('receiver constraints', error); }
    }

    function renderTitlebar() {
        $('titlebar').classList.toggle('hidden', !state.toolboxVisible);
        const breakout = currentBreakoutRoom();
        $('room-name').textContent = breakout ? breakout.name : cfg.room;
        $('room-timer').hidden = !state.startedAt;
        $('insecure-label').hidden = !cfg.insecureRoomName;
        $('audio-only-label').hidden = !state.audioOnly;
        $('live-label').hidden = !liveStreamRunning();
        $('live-label').classList.toggle('pending', state.liveStream.status === 'pending');
        $('rec-label').hidden = !recordingRunning();
        $('rec-label').classList.toggle('pending', state.recording.status === 'pending');
        $('tr-label').hidden = !state.transcribing;
        $('tr-label').textContent = t('transcribing.tr');
        // A visitor is not one of the meeting participants.
        const count = state.remotes.size + (state.iAmVisitor ? 0 : 1);
        $('participants-count').hidden = !state.joined;
        $('participants-count').textContent = count;
        $('tb-camera').hidden = state.videoMuted || !state.local.tracks.video;
        // VisitorsCountLabel
        $('visitors-label').hidden = !state.joined || !(state.visitorCount > 0);
        $('visitors-count').textContent = state.visitorCount;
    }

    function tick() {
        if (state.startedAt) $('room-timer').textContent = formatDuration(Date.now() - state.startedAt);
    }

    // NATIVE_THRESHOLDS from react/features/toolbox/constants.ts. The screen
    // sharing button is shown only where the WebView can capture the screen.
    function mainButtons() {
        // A visitor has no microphone or camera (Toolbox.native).
        if (state.iAmVisitor) return ['chat', 'raisehand', 'tileview', 'hangup'];
        const width = window.innerWidth;
        if (width >= 560 && screenShareSupported()) {
            return ['microphone', 'camera', 'chat', 'desktop', 'raisehand', 'tileview', 'overflowmenu', 'hangup'];
        }
        if (width >= 500) return ['microphone', 'camera', 'chat', 'raisehand', 'tileview', 'overflowmenu', 'hangup'];
        if (width >= 440) return ['microphone', 'camera', 'chat', 'raisehand', 'overflowmenu', 'hangup'];
        return ['microphone', 'camera', 'chat', 'overflowmenu', 'hangup'];
    }

    const buttons = {
        microphone: () => ({ icon: state.audioMuted ? 'mic-slash' : 'mic', label: t('toolbar.mute'), action: toggleAudio }),
        camera: () => ({ icon: state.videoMuted ? 'video-off' : 'video', label: t('toolbar.videomute'), action: toggleVideo }),
        chat: () => ({ icon: 'message', label: t('toolbar.chat'), action: () => openScreen('chat'), dot: state.unread + state.pollsUnread > 0 }),
        raisehand: () => ({ icon: 'raise-hand', label: t(state.local.raisedHand ? 'toolbar.lowerYourHand' : 'toolbar.raiseYourHand'),
            action: toggleRaiseHand, toggled: state.local.raisedHand }),
        tileview: () => ({ icon: 'tile-view', label: t('toolbar.tileViewToggle'), action: toggleTileView, toggled: state.tileView }),
        desktop: () => ({ icon: 'screenshare', label: t('toolbar.accessibilityLabel.shareYourScreen'), action: toggleScreenShare,
            toggled: state.screenSharing }),
        overflowmenu: () => ({ icon: 'dots-horizontal', label: t('toolbar.moreActions'), action: openOverflowMenu }),
        hangup: () => ({ icon: 'hangup', label: t('toolbar.hangup'), action: onHangup, className: 'hangup' })
    };

    function renderToolbox() {
        $('bottom').classList.toggle('toolbox-hidden', !state.toolboxVisible);
        const box = $('toolbox');
        box.textContent = '';
        mainButtons().forEach(key => {
            const spec = buttons[key]();
            const button = el('button', 'tool' + (spec.className ? ' ' + spec.className : '') + (spec.toggled ? ' toggled' : ''));
            button.setAttribute('aria-label', spec.label);
            button.appendChild(icon(spec.icon));
            if (spec.dot) button.appendChild(el('span', 'dot'));
            button.addEventListener('click', spec.action);
            box.appendChild(button);
        });
    }

    function renderLonely() {
        $('lonely').hidden = !state.joined || state.remotes.size > 0 || state.tileView;
    }

    function toggleToolbox() {
        state.toolboxVisible = !state.toolboxVisible;
        $('expanded-label').hidden = true;
        render();
    }

    // ExpandedLabelPopup: the explanation under a title bar label, hidden
    // again after EXPANDED_LABEL_TIMEOUT (5 s) or on tap.
    let expandedTimer = 0;

    function showExpandedLabel(kind) {
        const label = $('expanded-label');
        clearTimeout(expandedTimer);
        if (!label.hidden && label.dataset.kind === kind) { label.hidden = true; return; }
        label.textContent = '';
        label.dataset.kind = kind;
        label.className = 'expanded-label ' + kind;
        if (kind === 'insecure') {
            // getUnsafeRoomText(): the web string carries the localized "here" link.
            const text = t('security.insecureRoomNameWarningWeb', { recommendAction: t('security.unsafeRoomActions.meeting') });
            const match = text.match(/^([\s\S]*?)<a[^>]*>([\s\S]*?)<\/a>([\s\S]*)$/);
            label.appendChild(document.createTextNode(match ? match[1] : text));
            if (match) {
                const link = el('a', '', match[2]);
                link.href = '#';
                link.addEventListener('click', e => { e.preventDefault(); notify('openUrl', { url: cfg.securityHelpUrl }); });
                label.appendChild(link);
                label.appendChild(document.createTextNode(match[3]));
            }
        } else if (kind === 'audio-only') {
            label.textContent = t('videoStatus.lowBandwidthModeExpanded');
        } else if (kind === 'live') {
            // RecordingExpandedLabel
            label.textContent = t(state.liveStream.status === 'pending' ? 'liveStreaming.expandedPending' : 'liveStreaming.expandedOn');
        } else if (kind === 'recording') {
            label.textContent = t(state.recording.status === 'pending' ? 'recording.expandedPending' : 'recording.expandedOn');
        } else if (kind === 'transcribing') {
            label.textContent = t('transcribing.expandedLabel');
        }
        label.hidden = false;
        expandedTimer = setTimeout(() => { label.hidden = true; }, 5000);
    }

    function togglePin(id) {
        const wasScreen = state.pinnedId === LOCAL_SCREEN_ID;
        state.pinnedId = state.pinnedId === id ? '' : id;
        // The own screen view exists only here; the others follow the rest.
        if (id !== LOCAL_SCREEN_ID && !wasScreen) sendFollowMe();
        render();
    }

    // ---------------------------------------------------------- notifications

    function showNotification(options) {
        const box = $('notifications');
        const node = el('div', 'notification' + (options.type ? ' ' + options.type : ''));
        const body = el('div');
        if (options.title) body.appendChild(el('div', 'title', options.title));
        if (options.description) body.appendChild(el('div', 'description', options.description));
        if (options.actions) {
            const row = el('div', 'actions');
            options.actions.forEach(action => {
                const button = el('button', '', action.label);
                button.addEventListener('click', event => { event.stopPropagation(); action.onClick(); node.remove(); });
                row.appendChild(button);
            });
            body.appendChild(row);
        }
        node.appendChild(body);
        node.addEventListener('click', () => { node.remove(); if (options.onClick) options.onClick(); });
        if (options.key) {
            const old = box.querySelector(`[data-key="${options.key}"]`);
            if (old) old.remove();
            node.dataset.key = options.key;
        }
        box.appendChild(node);
        while (box.children.length > 3) box.firstChild.remove();
        setTimeout(() => node.remove(), options.timeout || 5000);
    }

    // ---------------------------------------------------------------- dialogs

    function closeDialog() {
        delete $('dialog').dataset.kind;
        $('dialog').hidden = true;
        $('dialog-backdrop').hidden = true;
        $('dialog').textContent = '';
    }

    function openDialog(build) {
        const dialog = $('dialog');
        dialog.textContent = '';
        build(dialog);
        dialog.hidden = false;
        $('dialog-backdrop').hidden = false;
        // No focus() here: in the Aurora WebView a field focused by script
        // gets no keyboard session, and the first key closes the keyboard.
        // Fields are focused by the user's tap.
    }

    function dialogActions(dialog, actions) {
        const row = el('div', 'dialog-actions');
        actions.forEach(action => {
            const button = el('button', 'button ' + (action.type || 'tertiary'), action.label);
            button.addEventListener('click', action.onClick);
            if (action.disabled) button.disabled = true;
            row.appendChild(button);
        });
        dialog.appendChild(row);
        return row;
    }

    function confirmDialog(options) {
        openDialog(dialog => {
            if (options.kind) dialog.dataset.kind = options.kind;
            if (options.title) dialog.appendChild(el('div', 'dialog-title', options.title));
            if (options.text) dialog.appendChild(el('div', 'dialog-text', options.text));
            const actions = [];
            if (options.cancelLabel !== null) {
                actions.push({ label: options.cancelLabel || t('dialog.Cancel'), onClick: () => { closeDialog(); if (options.onCancel) options.onCancel(); } });
            }
            actions.push({ label: options.confirmLabel || t('dialog.Ok'), type: options.danger ? 'danger' : 'primary',
                onClick: () => { closeDialog(); if (options.onConfirm) options.onConfirm(); } });
            dialogActions(dialog, actions);
        });
    }

    function passwordDialog(options) {
        openDialog(dialog => {
            dialog.appendChild(el('div', 'dialog-title', options.title));
            if (options.text) dialog.appendChild(el('div', 'dialog-text', options.text));
            const input = el('input', 'field' + (options.error ? ' error' : ''));
            input.type = 'password';
            input.placeholder = t('lobby.enterPasswordButton');
            dialog.appendChild(input);
            if (options.error) dialog.appendChild(el('div', 'field-error', options.error));
            const row = dialogActions(dialog, [
                { label: t('dialog.Cancel'), onClick: () => { closeDialog(); if (options.onCancel) options.onCancel(); } },
                { label: options.confirmLabel || t('dialog.Ok'), type: 'primary', disabled: true,
                    onClick: () => { const value = input.value; closeDialog(); options.onSubmit(value); } }
            ]);
            const submit = row.lastChild;
            input.addEventListener('input', () => { submit.disabled = !input.value; });
            input.addEventListener('keydown', event => { if (event.key === 'Enter' && input.value) submit.click(); });
        });
    }

    // ----------------------------------------------------------- bottom sheet

    function closeSheet() {
        delete $('sheet').dataset.stats;
        $('sheet').hidden = true;
        $('sheet-backdrop').hidden = true;
        $('sheet').textContent = '';
    }

    function openSheet(build) {
        const sheet = $('sheet');
        sheet.textContent = '';
        build(sheet);
        sheet.hidden = false;
        $('sheet-backdrop').hidden = false;
    }

    function sheetItem(sheet, iconName, label, onClick, className) {
        const item = el('button', 'sheet-item' + (className ? ' ' + className : ''));
        if (iconName) item.appendChild(icon(iconName));
        item.appendChild(el('span', '', label));
        item.addEventListener('click', () => { closeSheet(); onClick(); });
        sheet.appendChild(item);
        return item;
    }

    // REACTIONS of react/features/reactions/constants.ts. Aurora has no colour
    // emoji font, so they are drawn with Twemoji images (emoji/, CC-BY 4.0).
    const REACTIONS = {
        like: '1f44d', clap: '1f44f', laugh: '1f600', surprised: '1f62e', boo: '1f641', silence: '1f636', love: '1f496'
    };

    function emoji(key, className) {
        const image = el('img', className || 'emoji');
        image.src = `emoji/${REACTIONS[key]}.svg`;
        image.alt = '';
        return image;
    }

    function openOverflowMenu() {
        const main = mainButtons();
        // Order of OverflowMenu.native: low bandwidth, security, whiteboard,
        // the main toolbar buttons that did not fit, breakout rooms, reactions.
        openSheet(sheet => {
            sheetItem(sheet, state.audioOnly ? 'video' : 'performance',
                t(state.audioOnly ? 'toolbar.lowBandwidthModeOff' : 'toolbar.lowBandwidthModeOn'), toggleAudioOnly);
            sheetItem(sheet, state.locked || state.lobbyEnabled ? 'security-on' : 'security-off', t('toolbar.security'), openSecurityDialog);
            // LiveStreamButton
            if (liveStreamButtonVisible()) {
                sheetItem(sheet, 'sites', t(liveStreamRunning() ? 'dialog.stopLiveStreaming' : 'dialog.startLiveStreaming'), toggleLiveStream);
            }
            // RecordButton
            if (recordButtonVisible()) {
                sheetItem(sheet, 'record', t(recordingRunning() ? 'dialog.stopRecording' : 'dialog.startRecording'), toggleRecording);
            }
            // ClosedCaptionButton: subtitles are shown in the chat screen.
            if (closedCaptionsEnabled()) {
                sheetItem(sheet, 'subtitles', t('transcribing.subtitles'), () => openScreen('chat', 'cc'));
            }
            if (whiteboardButtonVisible()) {
                sheetItem(sheet, 'whiteboard', t(state.whiteboardOpen ? 'toolbar.hideWhiteboard' : 'toolbar.showWhiteboard'), toggleWhiteboard);
            }
            sheet.appendChild(el('div', 'sheet-divider'));
            if (sharedVideoButtonVisible()) {
                sheetItem(sheet, 'play', t(isSharedVideoOwner() ? 'toolbar.stopSharedVideo' : 'toolbar.sharedvideo'), toggleSharedVideo);
            }
            if (!main.includes('chat')) sheetItem(sheet, 'message', t('toolbar.chat'), () => openScreen('chat'));
            if (!main.includes('desktop') && screenShareSupported()) {
                sheetItem(sheet, 'screenshare', t(state.screenSharing ? 'toolbar.stopScreenSharing' : 'toolbar.startScreenSharing'), toggleScreenShare);
            }
            if (!main.includes('tileview')) sheetItem(sheet, 'tile-view', t('toolbar.tileViewToggle'), toggleTileView);
            sheetItem(sheet, 'connection', t('toolbar.speakerStats'), () => openScreen('stats'));
            if (breakoutRoomsVisible()) sheetItem(sheet, 'breakout', t('breakoutRooms.buttonLabel'), () => openScreen('breakout'));
            sheet.appendChild(el('div', 'sheet-divider'));
            sheetItem(sheet, 'gear', t('toolbar.Settings'), () => notify('openSettings', { title: t('toolbar.Settings'), moderation: moderationState() }));
            // Reaction menu footer, as in the mobile overflow menu.
            sheet.appendChild(el('div', 'sheet-divider'));
            const row = el('div', 'reactions-row');
            Object.keys(REACTIONS).forEach(key => {
                const button = el('button', 'reaction-button');
                button.appendChild(emoji(key));
                button.addEventListener('click', () => sendReaction(key));
                row.appendChild(button);
            });
            if (giphyEnabled()) {
                const gif = el('button', 'reaction-button gif-button');
                gif.setAttribute('aria-label', t('toolbar.accessibilityLabel.giphy'));
                const image = el('img', 'emoji');
                image.src = 'icons/giphy.png';
                gif.appendChild(image);
                gif.addEventListener('click', () => openScreen('gifs'));
                row.appendChild(gif);
            }
            sheet.appendChild(row);
            const hand = el('button', 'button secondary wide');
            hand.style.margin = '0 16px 16px';
            hand.style.width = 'calc(100% - 32px)';
            hand.appendChild(icon('raise-hand'));
            hand.appendChild(el('span', '', t(state.local.raisedHand ? 'toolbar.lowerYourHand' : 'toolbar.raiseYourHand')));
            hand.addEventListener('click', () => { closeSheet(); toggleRaiseHand(); });
            sheet.appendChild(hand);
        });
    }

    function onHangup() {
        if (!isModerator() || !state.remotes.size) { leave('hangup'); return; }
        openSheet(sheet => {
            const box = el('div', 'hangup-sheet');
            const end = el('button', 'button danger', t('toolbar.endConference'));
            end.addEventListener('click', () => { closeSheet(); endForAll(); });
            const leaveButton = el('button', 'button secondary', t('toolbar.leaveConference'));
            leaveButton.addEventListener('click', () => { closeSheet(); leave('hangup'); });
            const cancel = el('button', 'button tertiary', t('dialog.Cancel'));
            cancel.addEventListener('click', closeSheet);
            box.append(end, leaveButton, cancel);
            sheet.appendChild(box);
        });
    }

    // ----------------------------------------------------------------- screens

    function openScreen(name, tab) {
        closeSheet();
        state.screen = name;
        $('chat').hidden = name !== 'chat';
        $('participants').hidden = name !== 'participants';
        $('breakout').hidden = name !== 'breakout';
        $('gifs').hidden = name !== 'gifs';
        $('stats').hidden = name !== 'stats';
        $('livestream').hidden = name !== 'livestream';
        if (name === 'livestream') renderLiveStreamScreen();
        if (name === 'gifs') openGifMenu();
        if (name === 'stats') renderSpeakerStats();
        if (name === 'chat') {
            if (tab) state.chatTab = tab;
            renderChatTabs();
            render();
        }
        if (name === 'participants') renderParticipants();
        if (name === 'breakout') renderBreakoutRooms();
    }

    function closeScreen() {
        state.screen = '';
        $('chat').hidden = true;
        $('participants').hidden = true;
        $('breakout').hidden = true;
        $('gifs').hidden = true;
        $('stats').hidden = true;
        $('livestream').hidden = true;
        $('stream-key').blur();
        $('chat-input').blur();
        render();
    }

    // ------------------------------------------------------------------- chat

    function renderChat() {
        updateChatInput();
        const list = $('chat-messages');
        list.textContent = '';
        if (!state.messages.length) {
            list.appendChild(el('div', 'chat-empty', t('chat.noMessagesMessage')));
        }
        // Search over the text and the author of the messages.
        $('chat-search').hidden = !state.messages.length;
        const query = (state.chatFilter || '').trim().toLowerCase();
        const messages = query ? state.messages.filter(message => (message.text || '').toLowerCase().includes(query)
            || (message.name || '').toLowerCase().includes(query)) : state.messages;
        if (query && !messages.length) list.appendChild(el('div', 'chat-empty', t('addPeople.noResults')));
        let group = null;
        let lastKey = '';
        messages.forEach(message => {
            const key = message.from + '|' + (message.privateTo || message.privateFrom ? 'p' : '');
            if (!group || key !== lastKey) {
                group = el('div', 'message-group' + (message.local ? ' local' : ''));
                if (!message.local) group.appendChild(avatar(person(message.from) || { name: message.name }));
                group.appendChild(el('div', 'message-stack'));
                list.appendChild(group);
                lastKey = key;
            }
            const stack = group.lastChild;
            const bubble = el('div', 'message' + (message.privateTo || message.privateFrom ? ' private' : ''));
            if (!message.local && stack.childNodes.length === 0) bubble.appendChild(el('div', 'author', message.name));
            if (message.privateTo) bubble.appendChild(el('div', 'private-note', t('chat.messageTo', { recipient: message.privateToName })));
            else if (message.privateFrom) bubble.appendChild(el('div', 'private-note', t('chat.privateNotice', { recipient: t('chat.you') })));
            const gifUrl = gifDisplayMode() !== 'tile' && gifFromMessage(message.text);
            if (gifUrl) {
                const image = el('img', 'chat-gif');
                image.src = gifUrl;
                image.addEventListener('load', () => { if (list.scrollHeight - list.scrollTop - list.clientHeight < 400) list.scrollTop = list.scrollHeight; });
                bubble.appendChild(image);
            } else bubble.appendChild(document.createTextNode(message.text));
            stack.appendChild(bubble);
            stack.appendChild(el('div', 'message-time', formatTime(message.ts)));
        });
        list.scrollTop = list.scrollHeight;
        const recipient = state.privateRecipient && person(state.privateRecipient);
        $('chat-recipient').hidden = !recipient;
        $('chat-to').classList.toggle('private', !!recipient);
        $('chat-to').hidden = !state.remotes.size;
        if (recipient) $('chat-recipient-text').textContent = t('chat.messageTo', { recipient: displayNameOf(recipient) });
    }

    function addMessage(message) {
        const gifUrl = gifFromMessage(message.text);
        // Messages of the room history (sent on joining) go to the chat only:
        // no GIF on a tile, no sound and no notification, as in jitsi-meet.
        if (gifUrl && !message.history && !message.privateTo && !message.privateFrom && gifDisplayMode() !== 'chat') {
            showGifOnTile(message.from, gifUrl);
        }
        if (gifUrl && gifDisplayMode() === 'tile' && !message.history) return;
        state.messages.push(message);
        if (!message.local && !message.history) playSound('message');
        if (state.screen === 'chat' && state.chatTab === 'chat') renderChat();
        else if (!message.local && !message.history) {
            state.unread++;
            if (prefs.chatNotifications !== false) {
                showNotification({ title: message.name, description: gifUrl ? t('notify.gifsMenu') : message.text, onClick: () => openScreen('chat') });
            }
            render();
        }
    }

    function sendChat(text) {
        const value = text.trim();
        if (!value || !state.conference || !state.joined) return;
        const recipient = state.privateRecipient && person(state.privateRecipient);
        if (recipient) {
            state.conference.sendPrivateTextMessage(recipient.id, value);
            addMessage({ local: true, from: state.localId, name: displayNameOf(state.local), text: value, ts: Date.now(),
                privateTo: recipient.id, privateToName: displayNameOf(recipient) });
        } else {
            // The server echoes public messages back with our own id.
            state.conference.sendTextMessage(value);
        }
    }

    function startPrivateChat(id) {
        state.privateRecipient = id;
        openScreen('chat');
    }

    // The recipient picker of the chat (jitsi-meet web: "Send to"): everyone,
    // or one participant for a private message.
    function openRecipientPicker() {
        $('chat-input').blur();
        openSheet(sheet => {
            sheet.appendChild(el('div', 'sheet-title', t('chat.sendButton')));
            sheetItem(sheet, 'users', t('chat.everyone'), () => { state.privateRecipient = null; renderChat(); },
                state.privateRecipient ? '' : 'selected');
            [...state.remotes.values()]
                .filter(p => !p.hidden && !chatSendDisabledFor(p.id))
                .sort((a, b) => displayNameOf(a).localeCompare(displayNameOf(b)))
                .forEach(p => {
                    sheetItem(sheet, 'message', displayNameOf(p), () => { state.privateRecipient = p.id; renderChat(); },
                        state.privateRecipient === p.id ? 'selected' : '');
                });
        });
    }

    // ----------------------------------------------------------- participants

    function participantItem(p, options) {
        const item = el('div', 'participant-item');
        item.appendChild(avatar(p));
        const details = el('div', 'details');
        details.appendChild(el('div', 'name', displayNameOf(p) + (p.local ? ` (${t('chat.you')})` : '')));
        if (p.role === 'moderator') details.appendChild(el('div', 'role', t('videothumbnail.moderator')));
        item.appendChild(details);
        if (options.lobby) {
            const actions = el('div', 'lobby-actions');
            const reject = el('button', 'button secondary small', t('participantsPane.actions.reject'));
            reject.addEventListener('click', () => rejectKnocking(p.id));
            const admit = el('button', 'button primary small', t('participantsPane.actions.admit'));
            admit.addEventListener('click', () => admitKnocking(p.id));
            actions.append(reject, admit);
            item.appendChild(actions);
            return item;
        }
        const states = el('div', 'states');
        if (p.raisedHand) { const hand = icon('raise-hand', 'medium'); hand.classList.add('hand'); states.appendChild(hand); }
        const video = p.tracks.video;
        const videoIcon = icon(!video || video.isMuted() ? 'video-off' : 'video', 'medium');
        if (!video || video.isMuted()) videoIcon.classList.add('muted');
        const audio = p.tracks.audio;
        const audioIcon = icon(!audio || audio.isMuted() ? 'mic-slash' : 'mic', 'medium');
        if (!audio || audio.isMuted()) audioIcon.classList.add('muted');
        states.append(videoIcon, audioIcon);
        item.appendChild(states);
        item.addEventListener('click', () => openParticipantMenu(p.id));
        return item;
    }

    function renderParticipants() {
        const lobby = $('lobby-list');
        lobby.textContent = '';
        if (isModerator() && state.knocking.size) {
            const heading = el('div', 'list-heading', t('participantsPane.headings.lobby', { count: state.knocking.size }));
            lobby.appendChild(heading);
            state.knocking.forEach(knocker => lobby.appendChild(participantItem(knocker, { lobby: true })));
            if (state.knocking.size > 1) {
                const all = el('button', 'button secondary wide', t('participantsPane.actions.admitAll'));
                all.addEventListener('click', () => [...state.knocking.keys()].forEach(admitKnocking));
                lobby.appendChild(all);
            }
        }
        const people = state.iAmVisitor ? [...state.remotes.values()] : everyone();
        $('participants-heading').textContent = t('participantsPane.headings.participantsList', { count: people.length });
        const list = $('participants-list');
        list.textContent = '';
        const filter = state.participantFilter.trim().toLowerCase();
        const sorted = [...(state.iAmVisitor ? [] : [state.local]), ...[...state.remotes.values()].sort((a, b) =>
            (isRaised(b.raisedHand) - isRaised(a.raisedHand)) || displayNameOf(a).localeCompare(displayNameOf(b)))];
        sorted.filter(p => !filter || displayNameOf(p).toLowerCase().includes(filter))
            .forEach(p => list.appendChild(participantItem(p, {})));
        renderVisitors(lobby);
        $('participants-footer').hidden = !isModerator();
        $('breakout-button').hidden = !breakoutRoomsVisible();
    }

    // RemoteVideoMenu.native: the participant's menu from the participants
    // list or a long press on the thumbnail.
    function openParticipantMenu(id) {
        if (id === LOCAL_SCREEN_ID) return;
        if (id === state.localId || id === 'local') { openLocalMenu(); return; }
        const p = person(id);
        if (!p) return;
        const moderator = isModerator();
        const config = state.serverConfig || {};
        const remoteMute = moderator && !config.disableRemoteMute;
        const audioMuted = !p.tracks.audio || p.tracks.audio.isMuted();
        const videoMuted = !p.tracks.video || p.tracks.video.isMuted();
        openSheet(sheet => {
            sheetHeader(sheet, p);
            // AskUnmuteButton: under audio moderation it lets the participant
            // speak, as in jitsi-meet. Without moderation jitsi-meet has no such
            // request; clients of this application understand the message.
            if (moderator && audioMuted) {
                sheetItem(sheet, 'mic', t('participantsPane.actions.askUnmute'), () => {
                    if (state.avModeration && state.avModeration.audio && typeof state.conference.avModerationApprove === 'function') {
                        state.conference.avModerationApprove('audio', p.id);
                    } else {
                        sendEndpoint(p.id, { name: ASK_UNMUTE_MESSAGE });
                    }
                });
            }
            if (remoteMute) {
                sheetItem(sheet, 'mic-slash', t(audioMuted ? 'videothumbnail.muted' : 'videothumbnail.domute'), () => confirmDialog({
                    text: t('dialog.muteParticipantBody'), confirmLabel: t('dialog.muteParticipantButton'),
                    onConfirm: () => state.conference.muteParticipant(p.id, 'audio')
                }), audioMuted ? 'disabled' : '');
            }
            if (moderator) {
                sheetItem(sheet, 'mic-slash', t('videothumbnail.domuteOthers'), () => confirmDialog({
                    title: t('dialog.muteEveryoneElseTitle', { whom: displayNameOf(p) }), text: t('dialog.muteEveryoneElseDialog'),
                    confirmLabel: t('dialog.muteParticipantButton'),
                    onConfirm: () => [...state.remotes.keys()].filter(other => other !== p.id)
                        .forEach(other => state.conference.muteParticipant(other, 'audio'))
                }));
            }
            if (moderator && isRaised(p.raisedHand)) {
                sheetItem(sheet, 'raise-hand', t('participantsPane.actions.lowerHand'), () => lowerHand(p.id));
            }
            if (remoteMute) {
                sheetItem(sheet, 'video-off', t(videoMuted ? 'videothumbnail.videoMuted' : 'videothumbnail.domuteVideo'), () => confirmDialog({
                    title: t('dialog.muteParticipantsVideoTitle'), text: t('dialog.muteParticipantsVideoBody'),
                    confirmLabel: t('dialog.muteParticipantsVideoButton'),
                    onConfirm: () => state.conference.muteParticipant(p.id, 'video')
                }), videoMuted ? 'disabled' : '');
            }
            sheet.appendChild(el('div', 'sheet-divider'));
            if (moderator && !(config.remoteVideoMenu && config.remoteVideoMenu.disableKick)) {
                sheetItem(sheet, 'user-deleted', t('videothumbnail.kick'), () => confirmDialog({
                    title: t('dialog.kickParticipantTitle'), text: t('dialog.kickParticipantDialog'),
                    confirmLabel: t('dialog.kickParticipantButton'), danger: true,
                    onConfirm: () => state.conference.kickParticipant(p.id)
                }));
            }
            if (moderator && p.role !== 'moderator' && !isInBreakoutRoom()
                    && !(config.remoteVideoMenu && config.remoteVideoMenu.disableGrantModerator)) {
                sheetItem(sheet, 'moderator', t('videothumbnail.grantModerator'), () => confirmDialog({
                    title: t('dialog.grantModeratorTitle'),
                    text: t('dialog.grantModeratorDialog', { participantName: displayNameOf(p) }),
                    confirmLabel: t('dialog.Yes'),
                    onConfirm: () => state.conference.grantOwner(p.id)
                }));
            }
            // PinButton: show the participant large.
            sheetItem(sheet, 'enlarge', t('videothumbnail.show'), () => {
                state.pinnedId = p.id;
                if (state.tileView) state.tileView = false;
                sendFollowMe();
                closeScreen();
                render();
            });
            if (moderator) {
                sheetItem(sheet, 'users', t('videothumbnail.demote'), () => confirmDialog({
                    title: t('dialog.demoteParticipantTitle'), text: t('dialog.demoteParticipantDialog'),
                    confirmLabel: t('dialog.Yes'),
                    onConfirm: () => demoteParticipant(p)
                }));
            }
            if (!chatSendDisabledFor(p.id)) sheetItem(sheet, 'message', t('toolbar.privateMessage'), () => startPrivateChat(p.id));
            sheetItem(sheet, 'info', t('videothumbnail.connectionInfo'), () => openConnectionInfo(p.id));
            const rooms = Object.values(state.breakoutRooms);
            if (moderator && rooms.length > 1) {
                sheet.appendChild(el('div', 'sheet-divider'));
                sheet.appendChild(el('div', 'sheet-title', t('breakoutRooms.actions.sendToBreakoutRoom')));
                rooms.filter(room => room.id !== currentRoomId()).forEach(room => {
                    sheetItem(sheet, null, room.isMainRoom ? t('breakoutRooms.mainRoom') : room.name, () => sendParticipantToRoom(p.id, room.id));
                });
            }
            volumeSlider(sheet, p);
        });
    }

    // LocalVideoMenu.native: self view, demote to visitor, connection info.
    function openLocalMenu() {
        const p = state.local;
        const config = state.serverConfig || {};
        openSheet(sheet => {
            sheetHeader(sheet, p);
            const hidden = !!prefs.hideSelfView;
            sheetItem(sheet, hidden ? 'video' : 'video-off', t(hidden ? 'videothumbnail.showSelfView' : 'videothumbnail.hideSelfView'), () => {
                prefs.hideSelfView = !hidden;
                notify('preference', { key: 'hideSelfView', value: !hidden });
                render();
            });
            if (!config.disableSelfDemote && !state.iAmVisitor && state.remotes.size > 0) {
                sheetItem(sheet, 'users', t('videothumbnail.demote'), () => confirmDialog({
                    title: t('dialog.demoteParticipantTitle'), text: t('dialog.demoteParticipantDialog'),
                    confirmLabel: t('dialog.Yes'),
                    onConfirm: () => becomeVisitor('')
                }));
            }
            sheetItem(sheet, 'info', t('videothumbnail.connectionInfo'), () => openConnectionInfo(p.id));
        });
    }

    function sheetHeader(sheet, p) {
        const title = el('div', 'sheet-title');
        title.appendChild(avatar(p));
        Object.assign(title.lastChild.style, { width: '32px', height: '32px', fontSize: '13px' });
        title.appendChild(el('span', '', displayNameOf(p)));
        sheet.appendChild(title);
    }

    // VolumeSlider.native: the local playback volume of the participant.
    function volumeSlider(sheet, p) {
        if (!p.tracks.audio) return;
        const row = el('div', 'sheet-volume');
        row.appendChild(icon('volume'));
        const slider = el('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.05';
        slider.value = String(state.volumes.has(p.id) ? state.volumes.get(p.id) : 1);
        const apply = () => {
            const value = Number(slider.value);
            state.volumes.set(p.id, value);
            slider.style.setProperty('--fill', value * 100 + '%');
            const sink = p.tracks.audio && p.tracks.audio._sink;
            if (sink) sink.volume = value;
        };
        slider.addEventListener('input', apply);
        slider.addEventListener('click', event => event.stopPropagation());
        apply();
        row.appendChild(slider);
        sheet.appendChild(row);
    }

    // isSendPrivateChatDisabled for one recipient.
    function chatSendDisabledFor(id) {
        return !!id && !isModerator() && !!roomPermissions().privateChatRestricted;
    }

    // ConnectionStatusComponent.native: status, bitrate, packet loss,
    // resolution and codecs from the connection quality statistics, updated
    // while the sheet is open.
    function openConnectionInfo(id) {
        const local = id === state.localId || id === 'local';
        const p = person(id);
        if (!p) return;
        const refresh = () => {
            const sheet = $('sheet');
            if (sheet.hidden || sheet.dataset.stats !== id) return false;
            const stats = local ? state.localStats || {} : Object.assign({}, state.remoteStats.get(id));
            const own = state.localStats || {};
            const key = local ? state.localId : id;
            const resolution = (own.resolution || {})[key] || stats.resolution;
            const codec = (own.codec || {})[key] || stats.codec;
            const bitrate = stats.bitrate || {};
            const loss = stats.packetLoss || {};
            const quality = typeof stats.connectionQuality === 'number' ? stats.connectionQuality : null;
            const status = quality === null ? 'inactive' : quality > 66 ? 'good' : quality > 33 ? 'nonoptimal' : 'poor';
            const values = sheet.querySelectorAll('[data-stat]');
            values.forEach(node => {
                switch (node.dataset.stat) {
                case 'status': node.textContent = t(`connectionindicator.quality.${status}`); break;
                case 'down': node.textContent = bitrate.download !== undefined ? `${bitrate.download}` : 'N/A'; break;
                case 'up': node.textContent = bitrate.upload !== undefined ? `${bitrate.upload} Kbps` : 'N/A'; break;
                case 'lossDown': node.textContent = loss.download !== undefined ? `${loss.download}%` : 'N/A'; break;
                case 'lossUp': node.textContent = loss.upload !== undefined ? `${loss.upload}%` : 'N/A'; break;
                case 'resolution': node.textContent = formatResolution(resolution); break;
                case 'codec': node.textContent = formatCodec(codec); break;
                }
            });
            return true;
        };
        openSheet(sheet => {
            sheet.dataset.stats = id;
            sheetHeader(sheet, p);
            const table = el('div', 'stats-table');
            const row = (label, cells) => {
                const line = el('div', 'stats-row');
                line.appendChild(el('span', 'stats-label', t(label)));
                cells.forEach(cell => {
                    if (cell.icon) line.appendChild(icon(cell.icon, 'small'));
                    const value = el('span', 'stats-value', '');
                    value.dataset.stat = cell.stat;
                    line.appendChild(value);
                });
                table.appendChild(line);
            };
            row('connectionindicator.status', [{ stat: 'status' }]);
            row('connectionindicator.bitrate', [{ icon: 'arrow-down', stat: 'down' }, { icon: 'arrow-up', stat: 'up' }]);
            row('connectionindicator.packetloss', [{ icon: 'arrow-down', stat: 'lossDown' }, { icon: 'arrow-up', stat: 'lossUp' }]);
            row('connectionindicator.resolution', [{ stat: 'resolution' }]);
            row('connectionindicator.codecs', [{ stat: 'codec' }]);
            sheet.appendChild(table);
        });
        refresh();
        const timer = setInterval(() => { if (!refresh()) clearInterval(timer); }, 1000);
    }

    function formatResolution(resolution) {
        if (!resolution) return 'N/A';
        const list = typeof resolution.width === 'number' ? [resolution] : Object.values(resolution);
        const text = list.filter(item => item && item.width).map(item => `${item.width}x${item.height}`).join(', ');
        return text || 'N/A';
    }

    function formatCodec(codec) {
        if (!codec) return 'N/A';
        const list = codec.audio || codec.video ? [codec] : Object.values(codec);
        const audio = [...new Set(list.map(item => item && item.audio).filter(Boolean))].join(', ');
        const video = [...new Set(list.map(item => item && item.video).filter(Boolean))].join(', ');
        return [audio, video].filter(Boolean).join(', ') || 'N/A';
    }

    // A long press, like onLongPress of the native thumbnails; the click
    // that ends it is swallowed.
    function onLongPress(node, handler) {
        let timer = 0;
        let fired = false;
        const cancel = () => clearTimeout(timer);
        node.addEventListener('pointerdown', () => {
            fired = false;
            timer = setTimeout(() => { fired = true; handler(); }, 500);
        });
        node.addEventListener('pointerup', cancel);
        node.addEventListener('pointerleave', cancel);
        node.addEventListener('pointercancel', cancel);
        node.addEventListener('contextmenu', event => event.preventDefault());
        node.addEventListener('click', event => {
            if (fired) { event.stopImmediatePropagation(); fired = false; }
        }, true);
    }

    // ContextMenuMore.native: stop everyone's video and, where the server
    // supports it, whether non-moderators may unmute themselves.
    function openModerationMenu() {
        const conference = state.conference;
        openSheet(sheet => {
            sheetItem(sheet, 'video-off', t('participantsPane.actions.stopEveryonesVideo'),
                () => [...state.remotes.keys()].forEach(id => conference.muteParticipant(id, 'video')));
            sheetItem(sheet, 'raise-hand', t('participantsPane.actions.lowerAllHands'), lowerAllHands);
            if (!conference || typeof conference.isAVModerationSupported !== 'function' || !conference.isAVModerationSupported()
                || isInBreakoutRoom()) return;
            sheet.appendChild(el('div', 'sheet-title', t('participantsPane.actions.allow')));
            [['audio', 'participantsPane.actions.audioModeration'], ['video', 'participantsPane.actions.videoModeration']].forEach(([type, key]) => {
                const item = el('button', 'sheet-item');
                const check = icon('check');
                check.style.visibility = state.avModeration[type] ? 'hidden' : 'visible';
                item.append(check, el('span', '', t(key)));
                item.addEventListener('click', () => {
                    closeSheet();
                    if (state.avModeration[type]) conference.disableAVModeration(type);
                    else conference.enableAVModeration(type);
                });
                sheet.appendChild(item);
            });
        });
    }

    // MuteEveryoneDialog.native: the "allow participants to unmute
    // themselves" switch is on while audio moderation is off, and the text
    // follows the switch.
    function muteAll() {
        const conference = state.conference;
        const supported = !!conference && typeof conference.isAVModerationSupported === 'function'
            && conference.isAVModerationSupported() && !isInBreakoutRoom();
        let moderation = !!state.avModeration.audio;
        openDialog(dialog => {
            dialog.appendChild(el('div', 'dialog-title', t('dialog.muteEveryoneTitle')));
            const text = el('div', 'dialog-text');
            const updateText = () => {
                text.textContent = t(moderation ? 'dialog.muteEveryoneDialogModerationOn' : 'dialog.muteEveryoneDialog');
            };
            updateText();
            dialog.appendChild(text);
            if (supported) {
                dialog.appendChild(el('div', 'sheet-divider'));
                const row = el('div', 'switch-row');
                row.appendChild(el('span', '', t('dialog.moderationAudioLabel')));
                const toggle = el('button', 'switch' + (moderation ? '' : ' on'));
                toggle.addEventListener('click', () => {
                    moderation = !moderation;
                    toggle.classList.toggle('on', !moderation);
                    updateText();
                });
                row.appendChild(toggle);
                dialog.appendChild(row);
            }
            dialogActions(dialog, [
                { label: t('dialog.Cancel'), onClick: closeDialog },
                { label: t('dialog.muteParticipantButton'), type: 'primary', onClick: () => {
                    closeDialog();
                    // Jicofo mutes on the bridge only participants that may
                    // not unmute, so the moderation changes first.
                    if (supported && moderation !== !!state.avModeration.audio) {
                        if (moderation) conference.enableAVModeration('audio');
                        else conference.disableAVModeration('audio');
                    }
                    [...state.remotes.keys()].forEach(id => conference.muteParticipant(id, 'audio'));
                } }
            ]);
        });
    }

    function admitKnocking(id) {
        if (state.conference) state.conference.lobbyApproveAccess(id);
        state.knocking.delete(id);
        render();
        if (state.screen === 'participants') renderParticipants();
    }

    function rejectKnocking(id) {
        if (state.conference) state.conference.lobbyDenyAccess(id);
        state.knocking.delete(id);
        render();
        if (state.screen === 'participants') renderParticipants();
    }

    // --------------------------------------------------------------- security

    function openSecurityDialog() {
        const moderator = isModerator();
        openDialog(dialog => {
            dialog.appendChild(el('div', 'dialog-title', t('security.title')));
            dialog.appendChild(el('div', 'dialog-text', t('lobby.enableDialogText')));
            const lobbyRow = el('div', 'switch-row');
            lobbyRow.appendChild(el('span', '', t('lobby.toggleLabel')));
            const lobbySwitch = el('button', 'switch' + (state.lobbyEnabled ? ' on' : ''));
            lobbySwitch.disabled = !moderator;
            lobbySwitch.addEventListener('click', () => {
                const enable = !state.lobbyEnabled;
                const result = enable ? state.conference.enableLobby() : state.conference.disableLobby();
                Promise.resolve(result).then(() => {
                    state.lobbyEnabled = enable;
                    lobbySwitch.classList.toggle('on', enable);
                }).catch(error => log('lobby toggle', error));
            });
            lobbyRow.appendChild(lobbySwitch);
            dialog.appendChild(lobbyRow);
            dialog.appendChild(el('div', 'sheet-divider'));
            // Password section of SecurityDialog.native: "Set password", then
            // a field with Cancel/Add; once locked, Remove and Copy.
            dialog.appendChild(el('div', 'dialog-text', t(moderator ? 'security.about' : 'security.aboutReadOnly')));
            const section = el('div', 'password-section');
            const button = (label, onClick, disabled) => {
                const node = el('button', 'button tertiary small', label);
                node.disabled = !!disabled;
                node.addEventListener('click', onClick);
                return node;
            };
            const showSet = () => {
                section.textContent = '';
                section.appendChild(button(t('info.addPassword'), showEdit, !moderator));
            };
            const showEdit = () => {
                section.textContent = '';
                const input = el('input', 'field');
                input.type = 'password';
                input.placeholder = t('dialog.password');
                const row = el('div', 'password-actions');
                const add = button(t('dialog.add'), () => {
                    const value = input.value;
                    if (!value) return;
                    state.conference.lock(value).then(() => {
                        state.locked = true;
                        state.roomPassword = value;
                        showLocked();
                    }).catch(() => showNotification({ type: 'error', title: t('dialog.lockTitle'), description: t('dialog.lockMessage') }));
                }, true);
                input.addEventListener('input', () => { add.disabled = !input.value; });
                row.append(button(t('dialog.Cancel'), showSet), add);
                section.append(input, row);
            };
            const showLocked = () => {
                section.textContent = '';
                const row = el('div', 'password-actions');
                row.appendChild(el('span', 'password-value', `${t('info.password')} ${state.roomPassword || '••••'}`));
                if (moderator) {
                    row.appendChild(button(t('dialog.Remove'), () => {
                        state.conference.lock('').then(() => { state.locked = false; state.roomPassword = ''; showSet(); });
                    }));
                }
                if (state.roomPassword) row.appendChild(button(t('dialog.copy'), () => notify('copy', { text: state.roomPassword })));
                section.appendChild(row);
            };
            if (state.locked) showLocked();
            else showSet();
            dialog.appendChild(section);
            dialogActions(dialog, [{ label: t('dialog.Ok'), type: 'tertiary', onClick: closeDialog }]);
        });
    }

    // ------------------------------------------------------------------ media

    // Gecko (Aurora OS 5.1) chooses the camera device in the application,
    // which needs to know the facing before the request; its cameras also
    // refuse exact size limits, so only the preferred size is given there.
    const gecko = /Firefox\//.test(navigator.userAgent);

    // The camera from the application (Aurora OS 5.1, see NativeCamera):
    // JPEG frames of the local server are drawn on a canvas, and the canvas
    // stream becomes the camera track. Disposing the track stops the camera.
    let nativeCameraSerial = 0;

    // The outgoing frames of a track so far (outbound-rtp framesEncoded), or
    // null while it is not sent.
    async function encodedFrames(mediaTrack) {
        const room = state.conference;
        if (!room) return null;
        const session = room.isP2PActive && room.isP2PActive() ? room.p2pJingleSession : room.jvbJingleSession;
        const pc = session && session.peerconnection && session.peerconnection.peerconnection;
        if (!pc) return null;
        let frames = null;
        try {
            (await pc.getStats(mediaTrack)).forEach(report => {
                if (report.type === 'outbound-rtp' && typeof report.framesEncoded === 'number') frames = report.framesEncoded;
            });
        } catch (error) {
            return null;
        }
        return frames;
    }

    // The camera from the application (Aurora OS 5.1, see NativeCamera):
    // JPEG frames of the local server are drawn on a canvas, and the canvas
    // stream becomes the camera track. Disposing the track stops the camera.
    //
    // Gecko encodes video in software, and how much a device manages is not
    // told by its processor (KVADRA_T has 8 slow cores). The picture size
    // follows what the encoder actually sends: one step down while it
    // falls behind 15 frames per second, one step up (to the server's size
    // at most) while it keeps up.
    async function nativeCameraTrack(facing) {
        // A newer track (another camera) owns the application camera; an
        // older one only stops drawing when disposed.
        const serial = ++nativeCameraSerial;
        const config = state.serverConfig || {};
        const ideal = config.constraints && config.constraints.video && config.constraints.video.height
            && config.constraints.video.height.ideal;
        const limit = Number(ideal || config.resolution) || 720;
        // The shorter side of the picture, from the largest.
        const steps = [1080, 720, 540, 480, 360, 270].filter(height => height <= limit);
        if (!steps.length) steps.push(limit);
        let step = steps.findIndex(height => height <= 480);
        if (step < 0) step = steps.length - 1;
        // The application grabs at the server's size; the page scales down.
        notify('nativeCamera', { active: true, facing, maxHeight: limit });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const frameUrl = new URL('camera.jpg', location.href).toString();
        let stopped = false;
        let timer = 0;
        let adaptTimer = 0;
        const stop = () => {
            if (stopped) return;
            stopped = true;
            clearTimeout(timer);
            clearTimeout(adaptTimer);
            if (serial === nativeCameraSerial) notify('nativeCamera', { active: false });
        };
        // 200 with a frame drawn, false while none is ready; throws when the
        // camera failed.
        const draw = async () => {
            const response = await fetch(frameUrl, { cache: 'no-store' });
            if (response.status === 503) throw new Error(await response.text());
            if (response.status !== 200) return false;
            const bitmap = await createImageBitmap(await response.blob());
            const scale = Math.min(1, steps[step] / Math.min(bitmap.width, bitmap.height));
            const width = 2 * Math.round(bitmap.width * scale / 2);
            const height = 2 * Math.round(bitmap.height * scale / 2);
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }
            context.drawImage(bitmap, 0, 0, width, height);
            if (bitmap.close) bitmap.close();
            return true;
        };
        const deadline = Date.now() + 10000;
        try {
            while (!(await draw())) {
                if (Date.now() > deadline) throw new Error('No camera frames');
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        } catch (error) {
            stop();
            error.name = 'gum.general';
            throw error;
        }
        const next = async () => {
            if (stopped) return;
            const started = Date.now();
            try { await draw(); } catch (error) { log('camera frame', error.message || error); }
            // 15 pictures per second, the time of the fetch included.
            if (!stopped) timer = setTimeout(next, Math.max(0, 66 - (Date.now() - started)));
        };
        timer = setTimeout(next, 66);
        const stream = canvas.captureStream(15);
        const mediaTrack = stream.getVideoTracks()[0];

        // A size the encoder fell behind at is tried again after a minute.
        const failedAt = {};
        let last = null;
        let goodWindows = 0;
        const adapt = async () => {
            if (stopped) return;
            const frames = await encodedFrames(mediaTrack);
            const now = Date.now();
            if (frames !== null && last && frames > last.frames) {
                const fps = (frames - last.frames) * 1000 / (now - last.at);
                let wanted = step;
                if (fps < 11 && step < steps.length - 1) {
                    failedAt[step] = now;
                    wanted = step + 1;
                } else if (fps >= 14) {
                    goodWindows++;
                    const tried = failedAt[step - 1];
                    if (goodWindows >= 2 && step > 0 && !(tried && now - tried < 60000)) wanted = step - 1;
                } else {
                    goodWindows = 0;
                }
                if (wanted !== step) {
                    log('camera picture', steps[step], '->', steps[wanted], 'lines at', fps.toFixed(1), 'fps');
                    step = wanted;
                    goodWindows = 0;
                    // The window after a change is not counted.
                    last = null;
                    adaptTimer = setTimeout(adapt, 4000);
                    return;
                }
            }
            last = frames === null ? null : { frames, at: now };
            adaptTimer = setTimeout(adapt, 4000);
        };
        adaptTimer = setTimeout(adapt, 4000);

        // A camera track takes its size from the constraints when the track
        // does not tell it (a canvas track of Gecko 78 does not).
        const tracks = await Promise.resolve(JitsiMeetJS.createLocalTracksFromMediaStreams([{
            stream, sourceType: 'camera', mediaType: 'video', videoType: 'camera',
            constraints: { height: { ideal: canvas.height }, width: { ideal: canvas.width } }
        }]));
        const track = tracks[0];
        const dispose = track.dispose.bind(track);
        track.dispose = () => { stop(); return dispose(); };
        track.auroraNative = true;
        return track;
    }

    // The microphone on Aurora OS 5.1 (Gecko). Some devices give a very quiet
    // signal (KVADRA_T: speech about 25 dB under the usual level, already in
    // the system), which the WebRTC gain control of Gecko 78 does not make
    // up. The gain follows the speech: while someone speaks, it moves the
    // level towards the usual one (0 to +30 dB); in pauses it stays, so the
    // noise is not raised. A compressor keeps the peaks from clipping. A
    // device with a normal microphone stays near 0 dB.
    async function adaptiveMicrophone(track) {
        const AudioContextType = window.AudioContext || window.webkitAudioContext;
        const input = track.getOriginalStream();
        if (!AudioContextType || !input) return track;
        const audio = new AudioContextType();
        const source = audio.createMediaStreamSource(input);
        const analyser = audio.createAnalyser();
        analyser.fftSize = 2048;
        const gain = audio.createGain();
        const compressor = audio.createDynamicsCompressor();
        compressor.threshold.value = -10;
        compressor.knee.value = 6;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;
        const output = audio.createMediaStreamDestination();
        source.connect(analyser);
        source.connect(gain);
        gain.connect(compressor);
        compressor.connect(output);
        // Connected to the speaker at zero volume: an audio context without
        // an output runs Gecko's media graph on a timer, and the voices of
        // the others (played in the same graph) are then not heard.
        const silent = audio.createGain();
        silent.gain.value = 0;
        compressor.connect(silent);
        silent.connect(audio.destination);
        if (audio.state === 'suspended') audio.resume().catch(() => {});

        const TARGET = -22;     // speech level, dBFS (RMS over 100 ms)
        const SPEECH = -62;     // quieter than this is a pause
        const MAX_GAIN = 30;
        let gainDb = 12;
        let reported = gainDb;
        gain.gain.value = Math.pow(10, gainDb / 20);
        const samples = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
            analyser.getFloatTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
            const level = 10 * Math.log10(sum / samples.length + 1e-12);
            if (level < SPEECH) return;
            const wanted = Math.max(0, Math.min(MAX_GAIN, TARGET - level));
            // Down quickly (loud speech), up within a few seconds of speech.
            const change = wanted - gainDb;
            gainDb += change < 0 ? Math.max(change, -3) * 0.5 : Math.min(change, 2) * 0.3;
            gain.gain.setTargetAtTime(Math.pow(10, gainDb / 20), audio.currentTime, 0.05);
            if (Math.abs(gainDb - reported) >= 6) {
                reported = gainDb;
                log('microphone gain', Math.round(gainDb), 'dB');
            }
        }, 100);

        const tracks = await Promise.resolve(JitsiMeetJS.createLocalTracksFromMediaStreams([{
            stream: output.stream, sourceType: 'microphone', mediaType: 'audio'
        }]));
        const wrapped = tracks[0];
        const dispose = wrapped.dispose.bind(wrapped);
        wrapped.dispose = () => {
            clearInterval(timer);
            audio.close().catch(() => {});
            track.dispose();
            return dispose();
        };
        return wrapped;
    }

    async function createTrack(type) {
        const options = { devices: [type] };
        if (type === 'video') {
            if (gecko && cfg.nativeCamera) return nativeCameraTrack(state.facingMode);
            options.facingMode = state.facingMode;
            if (gecko) {
                await fetch('event', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'cameraFacing', data: { facing: state.facingMode } }), credentials: 'omit' }).catch(() => {});
                options.constraints = { video: { height: { ideal: 720 }, width: { ideal: 1280 } } };
            } else {
                options.constraints = { video: { height: { ideal: 720, max: 720, min: 180 }, width: { ideal: 1280, max: 1280, min: 320 } } };
            }
        }
        const tracks = await JitsiMeetJS.createLocalTracks(options);
        const track = tracks.find(item => item.getType() === type) || null;
        if (track && type === 'audio' && gecko) {
            try {
                return await adaptiveMicrophone(track);
            } catch (error) {
                log('microphone gain', error);
            }
        }
        return track;
    }

    async function setLocalTrack(type, track) {
        const old = state.local.tracks[type];
        if (state.conference) {
            // lib-jitsi-meet replaces a video track only with one of the same
            // video type; the camera and the screen are swapped by removing
            // one and adding the other.
            const swap = old && track && type === 'video' && old.getVideoType() !== track.getVideoType();
            if (swap) {
                await state.conference.replaceTrack(old, null);
                await state.conference.addTrack(track);
            } else if (old) await state.conference.replaceTrack(old, track);
            else if (track) await state.conference.addTrack(track);
        }
        if (old && old !== track) old.dispose();
        state.local.tracks[type] = track || undefined;
        render();
    }

    let mediaBusy = false;
    const ASK_UNMUTE_MESSAGE = 'aurora-ask-unmute';
    const INDICATOR_DISPLAY_THRESHOLD = 30;

    // The moderator asked this participant to speak (notify.hostAskedUnmute).
    function showAskedToUnmute() {
        showNotification({ key: 'ask-unmute', type: 'normal', title: t('notify.hostAskedUnmute'), timeout: 15000,
            actions: [{ label: t('notify.unmute'), onClick: toggleAudio }] });
    }

    // AbstractConnectionIndicator: the indicator of a participant appears when
    // the quality falls under the threshold and stays until it has been good
    // for the auto hide time, so a stable connection shows nothing.
    function onConnectionStats(id, stats) {
        const percent = stats && stats.connectionQuality;
        if (typeof percent !== 'number' || !id) return;
        const entry = state.connectionIndicators.get(id) || {};
        state.connectionIndicators.set(id, entry);
        const wasShown = entry.show;
        const before = connectionClass(entry.percent);
        entry.percent = percent;
        if (percent < INDICATOR_DISPLAY_THRESHOLD) {
            clearTimeout(entry.timer);
            entry.timer = undefined;
            entry.show = true;
        } else if (!entry.timer) {
            const config = (state.serverConfig || {}).connectionIndicators || {};
            entry.timer = setTimeout(() => { entry.show = false; render(); }, config.autoHideTimeout || 5000);
        }
        if (entry.show !== wasShown || (entry.show && connectionClass(percent) !== before)) render();
    }

    // CONNECTOR_INDICATOR_COLORS of the native ConnectionIndicator.
    function connectionClass(percent) {
        if (percent >= INDICATOR_DISPLAY_THRESHOLD) return 'good';
        return percent >= 10 ? 'nonoptimal' : 'poor';
    }

    function connectionIndicator(p) {
        const config = (state.serverConfig || {}).connectionIndicators || {};
        const entry = state.connectionIndicators.get(p.id);
        if (config.disabled || !entry || !entry.show) return null;
        const video = p.tracks.video;
        const status = video && video.getTrackStreamingStatus && video.getTrackStreamingStatus();
        if (status === 'inactive' && config.inactiveDisabled) return null;
        const kind = status === 'inactive' ? 'inactive' : status === 'interrupted' ? 'lost' : connectionClass(entry.percent);
        const node = el('div', `indicator connection ${kind}`);
        node.appendChild(icon('connection', 'small'));
        return node;
    }

    async function toggleAudio() {
        if (mediaBusy) return;
        mediaBusy = true;
        try {
            let track = state.local.tracks.audio;
            if (state.audioMuted) {
                if (!track) {
                    track = await createTrack('audio');
                    await setLocalTrack('audio', track);
                } else await track.unmute();
                state.audioMuted = false;
            } else if (track) {
                await track.mute();
                state.audioMuted = true;
            }
        } catch (error) {
            showNotification({ type: 'error', title: t('toolbar.mute'), description: String(error && (error.message || error.name) || error) });
        } finally {
            mediaBusy = false;
            render();
        }
    }

    async function toggleVideo() {
        if (mediaBusy) return;
        mediaBusy = true;
        try {
            let track = state.local.tracks.video;
            if (state.videoMuted) {
                if (state.audioOnly) setAudioOnly(false);
                if (!track) {
                    track = await createTrack('video');
                    await setLocalTrack('video', track);
                } else await track.unmute();
                state.videoMuted = false;
            } else if (track && track.auroraNative) {
                // The application camera is released while the video is off.
                await setLocalTrack('video', null);
                state.videoMuted = true;
            } else if (track) {
                await track.mute();
                state.videoMuted = true;
            }
        } catch (error) {
            showNotification({ type: 'error', title: t('toolbar.videomute'), description: String(error && (error.message || error.name) || error) });
        } finally {
            mediaBusy = false;
            render();
        }
    }

    async function switchCamera() {
        if (mediaBusy || state.videoMuted) return;
        mediaBusy = true;
        const previous = state.facingMode;
        state.facingMode = previous === 'user' ? 'environment' : 'user';
        try {
            const track = await createTrack('video');
            await setLocalTrack('video', track);
        } catch (error) {
            state.facingMode = previous;
        } finally {
            mediaBusy = false;
            render();
        }
    }

    function setAudioOnly(enabled) {
        state.audioOnly = enabled;
        if (enabled && !state.videoMuted && state.local.tracks.video && !state.screenSharing) {
            state.local.tracks.video.mute();
            state.videoMuted = true;
        }
        if (enabled) showExpandedLabel('audio-only');
        else if ($('expanded-label').dataset.kind === 'audio-only') $('expanded-label').hidden = true;
        render();
    }

    function toggleAudioOnly() { setAudioOnly(!state.audioOnly); }

    function toggleTileView() {
        state.tileView = !state.tileView;
        sendFollowMe();
        render();
    }

    // LowerHandButton / ContextMenuMore.native: a moderator asks one or all
    // participants to lower the hand (LOWER_HAND_MESSAGE).
    const LOWER_HAND_MESSAGE = 'lower-hand-message';

    function lowerHand(id) {
        sendEndpoint(id, { name: LOWER_HAND_MESSAGE });
    }

    function lowerAllHands() {
        if (state.local.raisedHand) toggleRaiseHand();
        sendEndpoint('', { name: LOWER_HAND_MESSAGE });
    }

    // A hand still raised from an earlier promotion would make the visitor
    // node ask for promotion again at once, and the server would bring the
    // participant straight back; the hand is lowered first.
    function demoteParticipant(p) {
        const demote = () => {
            if (state.conference) state.conference.sendMessage({ type: 'visitors', action: 'demote-request', id: p.id, actor: state.localId });
        };
        if (!isRaised(p.raisedHand)) { demote(); return; }
        lowerHand(p.id);
        setTimeout(demote, 1000);
    }

    function toggleRaiseHand() {
        state.local.raisedHand = !state.local.raisedHand;
        if (state.conference) state.conference.setLocalParticipantProperty('raisedHand', state.local.raisedHand ? Date.now() : 0);
        // A raised hand of a visitor is a request to join.
        if (state.iAmVisitor) {
            if (!$('dialog').hidden && $('dialog').dataset.kind === 'joinMeeting') closeDialog();
            const box = $('notifications').querySelector('[data-key="request-to-join"]');
            if (box) box.remove();
            if (state.local.raisedHand) {
                showNotification({ key: 'request-to-join', title: t('visitors.notification.requestToJoin'),
                    description: t('visitors.notification.requestToJoinDescription'), timeout: 600000 });
            }
        }
        render();
    }

    // Endpoint messages (reactions, lower hand, ask to unmute) go over the
    // bridge channel; while it is not open (Gecko 78 may fail to open it)
    // they go as JSON messages over XMPP, which the other clients receive
    // as the same endpoint message.
    let bridgeChannelOpen = false;

    function sendEndpoint(to, payload) {
        const conference = state.conference;
        if (!conference) return;
        if (bridgeChannelOpen) {
            try {
                conference.sendEndpointMessage(to, payload);
                return;
            } catch (error) {
                log('bridge channel', error.message || error);
            }
        }
        conference.sendMessage(payload, to || '');
    }

    function sendReaction(key) {
        closeSheet();
        showReaction(key);
        if (state.conference && state.joined) {
            sendEndpoint('', { name: 'endpoint-reaction', reactions: [key], timestamp: Date.now() });
        }
    }

    const SOUNDS = {
        joined: ['joined', 'soundJoined'], left: ['left', 'soundLeft'],
        message: ['incomingMessage', 'soundMessage'], knock: ['knock', 'soundLobby'],
        like: ['reactions-thumbs-up', 'soundReactions'], clap: ['reactions-applause', 'soundReactions'],
        laugh: ['reactions-laughter', 'soundReactions'], surprised: ['reactions-surprise', 'soundReactions'],
        boo: ['reactions-boo', 'soundReactions'], silence: ['reactions-crickets', 'soundReactions'],
        love: ['reactions-love', 'soundReactions'],
        // RAISE_HAND_SOUND_ID of jitsi-meet, under the reactions sound setting.
        raiseHand: ['reactions-raised-hand', 'soundReactions']
    };
    const soundCache = new Map();
    const soundFailed = new Set();

    function playSound(key) {
        const sound = SOUNDS[key];
        if (!sound || prefs[sound[1]] === false) return;
        let audio = soundCache.get(key);
        if (!audio) {
            // The servers have every sound as MP3 and Opus; the Gecko WebView
            // of Aurora OS 5.1 may have no MP3 decoder, Opus it always has.
            audio = new Audio(`${new URL(cfg.server).origin}/sounds/${sound[0]}.${gecko ? 'opus' : 'mp3'}`);
            soundCache.set(key, audio);
        }
        audio.currentTime = 0;
        audio.play().catch(error => {
            if (soundFailed.has(key)) return;
            soundFailed.add(key);
            log('sound', key, error && error.name, error && error.message);
        });
    }

    function showReaction(key) {
        if (!REACTIONS[key]) return;
        playSound(key);
        const node = emoji(key, 'flying-reaction');
        node.style.left = (20 + Math.random() * 60) + '%';
        $('reactions-layer').appendChild(node);
        setTimeout(() => node.remove(), 4000);
    }

    // ---------------------------------------------------------- screen share

    function screenShareSupported() {
        return !!cfg.nativeScreenShare
            || !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
    }

    // Screen frames from the application (ScreenCapture over StreamCamera):
    // JPEG frames of the local server are drawn on a canvas, and the canvas
    // stream becomes the desktop track.
    let nativeShare = null;

    async function nativeScreenStream() {
        notify('screenShare', { active: true });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        let stopped = false;
        let drawn = false;
        const frameUrl = new URL('screen.jpg', location.href).toString();
        const next = async () => {
            if (stopped) return;
            try {
                const response = await fetch(frameUrl, { cache: 'no-store' });
                if (response.status === 503) throw new Error(await response.text());
                if (response.status === 200) {
                    const bitmap = await createImageBitmap(await response.blob());
                    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                    }
                    context.drawImage(bitmap, 0, 0);
                    if (bitmap.close) bitmap.close();
                    drawn = true;
                }
            } catch (error) {
                if (!drawn) { stopped = true; throw error; }
                log('screen frame', error.message || error);
            }
            if (!stopped) nativeShare.timer = setTimeout(next, 200);
        };
        nativeShare = { stop: () => { stopped = true; clearTimeout(nativeShare && nativeShare.timer); notify('screenShare', { active: false }); } };
        // The first frame sets the size of the shared picture.
        let deadline = Date.now() + 8000;
        while (!drawn) {
            const response = await fetch(frameUrl, { cache: 'no-store' });
            if (response.status === 403) {
                nativeShare.stop();
                nativeShare = null;
                const refused = new Error('Screen sharing was refused');
                refused.name = 'gum.permission_denied';
                throw refused;
            }
            // The application is asking the user.
            if (response.status === 202) deadline = Date.now() + 8000;
            if (response.status === 503) {
                const reason = await response.text();
                nativeShare.stop();
                nativeShare = null;
                throw new Error(reason);
            }
            if (response.status === 200) {
                const bitmap = await createImageBitmap(await response.blob());
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                context.drawImage(bitmap, 0, 0);
                drawn = true;
                break;
            }
            if (Date.now() > deadline) {
                nativeShare.stop();
                nativeShare = null;
                throw new Error('No screen frames');
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        nativeShare.timer = setTimeout(next, 200);
        return canvas.captureStream(5);
    }

    async function toggleScreenShare() {
        if (mediaBusy || !state.conference) return;
        mediaBusy = true;
        try {
            if (state.screenSharing) {
                await stopScreenShare();
            } else {
                let tracks;
                if (cfg.nativeScreenShare) {
                    const stream = await nativeScreenStream();
                    tracks = await Promise.resolve(JitsiMeetJS.createLocalTracksFromMediaStreams([{
                        stream, sourceType: 'screen', mediaType: 'video', videoType: 'desktop'
                    }]));
                } else {
                    try {
                        tracks = await JitsiMeetJS.createLocalTracks({ devices: ['desktop'] });
                    } catch (error) {
                        log('screen share with audio', error);
                        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                        tracks = await Promise.resolve(JitsiMeetJS.createLocalTracksFromMediaStreams([{
                            stream, sourceType: 'screen', mediaType: 'video', videoType: 'desktop'
                        }]));
                    }
                }
                const desktop = tracks.find(track => track.getType() === 'video');
                tracks.filter(track => track !== desktop).forEach(track => track.dispose());
                if (!desktop) throw new Error('No screen track');
                desktop.on(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED, () => { if (state.screenSharing) stopScreenShare(); });
                // As the mobile client: the screen is a second video track
                // beside the camera, which stays as it is.
                await state.conference.addTrack(desktop);
                state.local.tracks.desktop = desktop;
                state.screenSharing = true;
            }
        } catch (error) {
            log('screen share', error && (error.message || error.name) || error);
            if (nativeShare) { nativeShare.stop(); nativeShare = null; }
            if (!error || error.name !== 'gum.permission_denied') {
                showNotification({ type: 'error', title: t('dialog.screenSharingFailed') });
            }
        } finally {
            mediaBusy = false;
            render();
        }
    }

    async function stopScreenShare() {
        state.screenSharing = false;
        if (nativeShare) { nativeShare.stop(); nativeShare = null; }
        const desktop = state.local.tracks.desktop;
        delete state.local.tracks.desktop;
        if (state.pinnedId === LOCAL_SCREEN_ID) state.pinnedId = '';
        if (desktop) {
            try {
                if (state.conference) await state.conference.removeTrack(desktop);
            } catch (error) {
                log('screen share stop', error && (error.message || error));
            }
            desktop.dispose();
        }
        render();
    }

    // ------------------------------------------------------------ whiteboard

    // Whiteboard as in jitsi-meet: the session (roomId + roomKey) is shared in
    // the conference metadata under "whiteboard"; every client opens the
    // server's static/whiteboard.html with that session.
    function whiteboardConfig() {
        return (state.serverConfig && state.serverConfig.whiteboard) || {};
    }

    function whiteboardEnabled() {
        const config = whiteboardConfig();
        const metadata = state.conference && state.conference.getMetadataHandler && state.conference.getMetadataHandler();
        return (config.enabled !== undefined ? config.enabled : !!state.collabDetails)
            && !!config.collabServerBaseUrl && !!metadata && metadata.isSupported();
    }

    function whiteboardButtonVisible() {
        return whiteboardEnabled() && (isModerator() || !!state.collabDetails);
    }

    function collabServerUrl() {
        const base = whiteboardConfig().collabServerBaseUrl;
        if (!base) return '';
        const path = '/' + cfg.room.normalize('NFKC').toLowerCase();
        const room = md5(isInBreakoutRoom() ? `${path}|${currentRoomId()}` : path);
        return base + (base.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(room);
    }

    function base64Url(text) {
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function whiteboardUrl() {
        const details = state.collabDetails;
        const info = { roomId: details.roomId, roomKey: details.roomKey, collabServerUrl: collabServerUrl(),
            localParticipantName: cfg.displayName || '' };
        return new URL(cfg.server).origin + '/static/whiteboard.html#state=' + base64Url(JSON.stringify(info));
    }

    // generateCollaborationLinkData() of Excalidraw: a random AES-GCM key.
    async function generateRoomKey() {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
        return (await crypto.subtle.exportKey('jwk', key)).k;
    }

    async function toggleWhiteboard() {
        if (state.whiteboardOpen) { closeWhiteboard(); return; }
        if (!state.collabDetails) {
            if (!isModerator()) return;
            try {
                const collabDetails = { roomId: currentRoomId(), roomKey: await generateRoomKey() };
                state.collabDetails = collabDetails;
                state.conference.getMetadataHandler().setMetadata('whiteboard', { collabDetails, collabServerUrl: collabServerUrl() });
            } catch (error) {
                log('whiteboard', error);
                showNotification({ type: 'error', title: t('info.noWhiteboard') });
                return;
            }
        }
        openWhiteboard();
    }

    function openWhiteboard() {
        if (!state.collabDetails) return;
        state.whiteboardOpen = true;
        notify('openWhiteboard', { url: whiteboardUrl(), title: t('whiteboard.screenTitle'), closeLabel: t('dialog.close') });
    }

    function closeWhiteboard() {
        state.whiteboardOpen = false;
        notify('closeWhiteboard');
    }

    function onMetadataUpdated(metadata) {
        const details = metadata && metadata.whiteboard && metadata.whiteboard.collabDetails;
        const previous = state.collabDetails;
        if (!details) return;
        state.collabDetails = details;
        // Only a new session opens the board (middleware.any UPDATE_CONFERENCE_METADATA).
        if ((!previous || previous.roomId !== details.roomId || previous.roomKey !== details.roomKey) && !state.whiteboardOpen) {
            openWhiteboard();
        }
    }

    // ----------------------------------------------------- moderator settings

    // ModeratorSection of settings/components/native: the start muted
    // policy, follow me, the reaction sounds and the chat permissions of the
    // room. The section lives in the QML settings page, which reads
    // moderationState() and changes values through setModeration().
    const FOLLOW_ME_COMMAND = 'follow-me';
    const MUTE_REACTIONS_COMMAND = 'mute-reactions';

    function roomMetadata() {
        const handler = state.conference && state.conference.getMetadataHandler && state.conference.getMetadataHandler();
        return handler && handler.isSupported() ? handler : null;
    }

    // The restrictions as the server sent them (UPDATE_CONFERENCE_METADATA).
    // A visitor node has no metadata component to write to, but still gets
    // the metadata of the main room, thus no isSupported() check here.
    function roomPermissions() {
        const handler = state.conference && state.conference.getMetadataHandler && state.conference.getMetadataHandler();
        const metadata = handler && handler.getMetadata();
        return (metadata && metadata.permissions) || {};
    }

    function moderationState() {
        if (!state.conference || !state.joined || !isModerator()) return null;
        const config = state.serverConfig;
        const handler = roomMetadata();
        // setStartMutedPolicy keeps the policy in the room metadata; the
        // conference's own copy only changes before joining.
        const policy = (handler && handler.getMetadata().startMuted)
            || (state.conference.getStartMutedPolicy && state.conference.getStartMutedPolicy()) || {};
        const permissions = roomPermissions();
        // isFollowMeActive: another moderator leads.
        const followMeActive = !!state.followMeModerator && !state.followMeModeratorRecorder;
        const followMeRecorderActive = !!state.followMeModerator && state.followMeModeratorRecorder;
        return {
            startAudioMuted: !!policy.audio,
            startVideoMuted: !!policy.video,
            audioModeration: !!(state.avModeration && state.avModeration.audio),
            videoModeration: !!(state.avModeration && state.avModeration.video),
            followMe: state.followMe && !followMeActive,
            followMeRecorder: state.followMeRecorder && !followMeRecorderActive,
            followMeActive,
            followMeRecorderActive,
            startReactionsMuted: !!state.startReactionsMuted,
            showReactions: !config.disableReactionsModeration,
            chatRestricted: !!permissions.groupChatRestricted,
            privateChatRestricted: !!permissions.privateChatRestricted,
            // The released mobile clients show the chat restrictions always
            // (neither showChatPermissionsModeratorSetting nor allowners hide
            // them; visitors stay restricted in an allowners room). They are
            // kept in the room metadata, thus need it.
            showChat: !!handler
        };
    }

    function moderationChanged() {
        notify('moderation', { state: moderationState() });
    }

    function setModeration(key, value) {
        const conference = state.conference;
        if (!conference || !isModerator()) return;
        const current = moderationState();
        switch (key) {
        case 'startAudioMuted':
        case 'startVideoMuted': {
            const audio = key === 'startAudioMuted' ? value : current.startAudioMuted;
            const video = key === 'startVideoMuted' ? value : current.startVideoMuted;
            conference.setStartMutedPolicy({ audio, video });
            break;
        }
        case 'followMe':
            // Turning off the recorder mode also turns off follow me.
            if (value && state.followMeRecorder) state.followMeRecorder = false;
            state.followMe = value;
            sendFollowMe(value ? undefined : 'off');
            break;
        case 'followMeRecorder':
            // setFollowMeRecorderExclusive: one mode at a time.
            state.followMeRecorder = value;
            if (value) state.followMe = false;
            sendFollowMe(value ? undefined : 'off');
            break;
        case 'startReactionsMuted':
            state.startReactionsMuted = value;
            prefs.soundReactions = !value;
            notify('reactionsMuted', { value: !!value });
            conference.sendCommand(MUTE_REACTIONS_COMMAND, { attributes: { startReactionsMuted: Boolean(value) } });
            break;
        case 'chatRestricted':
        case 'privateChatRestricted': {
            const handler = roomMetadata();
            if (!handler) return;
            const name = key === 'chatRestricted' ? 'groupChatRestricted' : 'privateChatRestricted';
            handler.setMetadata('permissions', Object.assign({}, handler.getMetadata().permissions, { [name]: value }));
            break;
        }
        }
        moderationChanged();
    }

    // follow-me/subscriber.ts: the leading moderator sends the tile view and
    // the pinned participant whenever they change.
    function sendFollowMe(off) {
        const conference = state.conference;
        if (!conference || !state.joined || !isModerator()) return;
        if (off) {
            conference.sendCommandOnce(FOLLOW_ME_COMMAND, { attributes: { off: true } });
            return;
        }
        if (!state.followMe && !state.followMeRecorder) return;
        conference.sendCommand(FOLLOW_ME_COMMAND, { attributes: {
            recorder: state.followMeRecorder,
            filmstripVisible: true,
            nextOnStage: state.pinnedId || undefined,
            sharedDocumentVisible: false,
            tileViewEnabled: state.tileView
        } });
    }

    // follow-me/middleware.ts _onFollowMeCommand. This client is never the
    // recorder, so the recorder mode only marks the leader.
    function onFollowMeCommand(attributes = {}, id) {
        if (id === state.localId) return;
        const sender = person(id);
        if (!sender || sender.role !== 'moderator') { log('follow-me command not from a moderator'); return; }
        if (attributes.off === 'true' || attributes.off === true) {
            state.followMeModerator = '';
            state.followMeModeratorRecorder = false;
        } else {
            state.followMeModerator = id;
            state.followMeModeratorRecorder = attributes.recorder === 'true';
            if (!state.followMeModeratorRecorder) {
                state.tileView = attributes.tileViewEnabled === 'true';
                const pinned = attributes.nextOnStage;
                if (pinned && pinned !== state.localId && state.remotes.has(pinned)) state.pinnedId = pinned;
                else if (!pinned) state.pinnedId = '';
            }
        }
        render();
        moderationChanged();
    }

    // reactions/middleware.ts _onMuteReactionsCommand.
    function onMuteReactionsCommand(attributes = {}, id) {
        const sender = person(id);
        if (!sender || sender.role !== 'moderator') return;
        const muted = attributes.startReactionsMuted === 'true';
        if (muted === !!state.startReactionsMuted) return;
        state.startReactionsMuted = muted;
        prefs.soundReactions = !muted;
        notify('preference', { key: 'soundReactions', value: !muted });
        notify('reactionsMuted', { value: muted });
        moderationChanged();
    }

    // The start muted policy concerns those who join: it is applied on
    // joining and when it arrives right after, not to participants already in.
    async function onStartMutedPolicy(policy) {
        moderationChanged();
        if (!state.joined || !policy || Date.now() - state.joinedAt > 5000) return;
        await applyStartMuted(policy);
    }

    async function applyStartMuted(policy) {
        if (!policy || isModerator()) return;
        if (policy.audio && !state.audioMuted) await toggleAudio();
        if (policy.video && !state.videoMuted) await toggleVideo();
    }

    // isSendGroupChatDisabled / isSendPrivateChatDisabled: moderators may
    // always write.
    function chatSendDisabled() {
        if (!state.conference || isModerator()) return false;
        const permissions = roomPermissions();
        return state.privateRecipient ? !!permissions.privateChatRestricted : !!permissions.groupChatRestricted;
    }

    function updateChatInput() {
        const disabled = chatSendDisabled();
        $('chat-form').hidden = disabled;
        $('chat-disabled').hidden = !disabled;
    }

    // --------------------------------------------------------------- visitors

    // react/features/visitors. A visitor watches the meeting from a visitor
    // node without microphone or camera; raising the hand asks the
    // moderators to be promoted. Jicofo moves participants between the main
    // room and the visitor nodes with CONNECTION_REDIRECTED.

    function appendParam(url, name, value) {
        if (!url) return url;
        return `${url}${url.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(value)}`;
    }

    // getVisitorOptions of base/conference/functions.ts.
    function visitorOptions(vnode, focusJid, username) {
        const config = state.serverConfig;
        if (!config || !config.hosts) return null;
        if (!vnode) {
            // Back to the main room after a promotion. disableFocus stays
            // set: the promoted participant joins the room directly under
            // the username jicofo gave, without a new conference request.
            if (!config.oldConfig || !username) return null;
            const old = config.oldConfig;
            return {
                hosts: old.hosts,
                focusUserJid: focusJid,
                disableLocalStatsBroadcast: false,
                preferVisitor: false,
                bosh: old.bosh && appendParam(old.bosh, 'customusername', username),
                p2p: old.p2p,
                websocket: old.websocket && appendParam(old.websocket, 'customusername', username),
                oldConfig: undefined
            };
        }
        const old = config.oldConfig || {
            hosts: Object.assign({}, config.hosts),
            focusUserJid: config.focusUserJid,
            bosh: config.bosh,
            p2p: config.p2p,
            websocket: config.websocket
        };
        const domain = `${vnode}.meet.jitsi`;
        return {
            oldConfig: old,
            // Only domain and muc: an anonymous or auth domain of the main
            // deployment would make the visitor node refuse the login.
            hosts: { domain, muc: old.hosts.muc.replace(old.hosts.domain, domain) },
            focusUserJid: focusJid,
            disableFocus: true,
            disableLocalStatsBroadcast: true,
            bosh: old.bosh && appendParam(old.bosh, 'vnode', vnode),
            p2p: Object.assign({}, old.p2p, { enabled: false }),
            websocket: old.websocket && appendParam(old.websocket, 'vnode', vnode)
        };
    }

    // redirect() of base/conference/actions.any.ts.
    async function onRedirected(vnode, focusJid, username) {
        const options = visitorOptions(vnode, focusJid, username);
        if (!options) { log('redirect without parameters', vnode || '', focusJid || ''); return; }
        log('redirected', vnode ? 'to visitor node ' + vnode : 'to the main room');
        state.serverConfig = Object.assign({}, state.serverConfig, options);
        showConnecting(t('connectingOverlay.joiningRoom'));
        // A visitor sends no media; the tracks are created again when the
        // microphone or camera is turned on after the promotion.
        await disconnect(false);
        state.iAmVisitor = !!vnode;
        state.audioMuted = true;
        state.videoMuted = true;
        state.local.raisedHand = false;
        state.promotionRequests.clear();
        // The request to join and the visitor notice belong to the old room.
        ['request-to-join', 'visitor', 'promotion'].forEach(key => {
            const node = $('notifications').querySelector('[data-key="' + key + '"]');
            if (node) node.remove();
        });
        render();
        if (!state.leaving) connect();
    }

    // The local participant asked to become a visitor, or a moderator moved
    // them: join again preferring a visitor node.
    async function becomeVisitor(actorName) {
        state.demoteActor = actorName || '';
        showConnecting(t('connectingOverlay.joiningRoom'));
        await disconnect(false);
        // From the original configuration: after a promotion the current one
        // joins the main room directly (disableFocus, customusername) and
        // would never ask jicofo for a visitor node.
        state.serverConfig = Object.assign({}, state.baseConfig || state.serverConfig, { preferVisitor: true });
        state.audioMuted = true;
        state.videoMuted = true;
        if (!state.leaving) connect();
    }

    // CONFERENCE_JOINED of visitors/middleware.ts for a visitor.
    function onVisitorJoined() {
        if (state.demoteActor) {
            showNotification({ key: 'visitor', title: t('visitors.notification.title'),
                description: t('visitors.notification.demoteDescription', { actor: state.demoteActor }), timeout: 60000 });
            state.demoteActor = '';
        } else {
            // JoinMeetingDialog.native
            confirmDialog({
                kind: 'joinMeeting',
                title: t('visitors.joinMeeting.title'),
                text: `${t('visitors.joinMeeting.description')} ${t('visitors.joinMeeting.wishToSpeak')}`,
                confirmLabel: t('visitors.joinMeeting.raiseHand'),
                onConfirm: () => { if (!state.local.raisedHand) toggleRaiseHand(); }
            });
        }
    }

    function onVisitorsMessage(msg) {
        if (!msg) return;
        if (msg.action === 'demote-request') {
            if (msg.id !== state.localId) return;
            const actor = person(msg.actor);
            becomeVisitor(actor ? displayNameOf(actor) : '');
        } else if (msg.action === 'promotion-request') {
            if (msg.on) state.promotionRequests.set(msg.from, msg.nick || msg.from);
            else state.promotionRequests.delete(msg.from);
            showPromotionNotification();
            if (state.screen === 'participants') renderParticipants();
        }
    }

    function answerPromotion(from, approved) {
        if (state.conference) {
            state.conference.sendMessage({ type: 'visitors', action: 'promotion-response', approved, id: from });
        }
        state.promotionRequests.delete(from);
        showPromotionNotification();
        if (state.screen === 'participants') renderParticipants();
    }

    // _handlePromotionNotification: one request can be answered from the
    // notification, several open the participants pane.
    function showPromotionNotification() {
        const box = $('notifications');
        const old = box.querySelector('[data-key="promotion"]');
        if (old) old.remove();
        const requests = [...state.promotionRequests];
        if (!requests.length || !isModerator()) return;
        if (requests.length === 1) {
            const [from, nick] = requests[0];
            showNotification({ key: 'promotion', title: nick, description: t('notify.participantWantsToJoin'), timeout: 600000,
                actions: [
                    { label: t('participantsPane.actions.admit'), onClick: () => answerPromotion(from, true) },
                    { label: t('participantsPane.actions.reject'), onClick: () => answerPromotion(from, false) }
                ] });
        } else {
            showNotification({ key: 'promotion', title: t('notify.waitingParticipants', { waitingParticipants: requests.length }),
                description: t('notify.participantsWantToJoin'), timeout: 600000,
                actions: [{ label: t('notify.viewVisitors'), onClick: () => openScreen('participants') }] });
        }
    }

    // The participants pane: visitors who raised the hand, with Admit and
    // Reject, and the number of visitors.
    function renderVisitors(container) {
        if (!isModerator()) return;
        if (state.visitorCount > 0) {
            container.appendChild(el('div', 'list-heading visitors-heading', t('participantsPane.headings.visitors', { count: state.visitorCount })
                + (state.promotionRequests.size ? t('participantsPane.headings.visitorRequests', { count: state.promotionRequests.size }) : '')));
        }
        state.promotionRequests.forEach((nick, from) => {
            const item = el('div', 'participant-item');
            item.appendChild(avatar({ name: nick }));
            const details = el('div', 'details');
            details.appendChild(el('div', 'name', nick));
            item.appendChild(details);
            const actions = el('div', 'lobby-actions');
            const reject = el('button', 'button secondary small', t('participantsPane.actions.reject'));
            reject.addEventListener('click', () => answerPromotion(from, false));
            const admit = el('button', 'button primary small', t('participantsPane.actions.admit'));
            admit.addEventListener('click', () => answerPromotion(from, true));
            actions.append(reject, admit);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    // ----------------------------------------------------------- live stream

    // react/features/recording, LiveStream: Jibri streams the meeting to
    // YouTube (or any RTMP server) with the stream key entered here.
    const JITSI_LIVE_STREAMING_HELP_LINK = 'https://jitsi.org/live';
    const YOUTUBE_TERMS_URL = 'https://www.youtube.com/t/terms';
    const GOOGLE_PRIVACY_POLICY = 'https://policies.google.com/privacy';
    const FOUR_GROUPS_DASH_SEPARATED = /^(?:[a-zA-Z0-9]{4}(?:-(?!$)|$)){4}/;
    const STREAM_KEY_OR_URL_REGEXP = /^(?:rtmps?:\/\/\S+|[a-z0-9_.~?=&/-]{6,})$/i;

    // getLiveStreaming of LiveStream/functions.ts.
    function liveStreamingConfig() {
        const config = state.serverConfig || {};
        const liveStreaming = config.liveStreaming || {};
        const hasGoogleApi = !!config.googleApiApplicationClientID;
        const isYouTubeTerms = liveStreaming.termsLink === YOUTUBE_TERMS_URL || (hasGoogleApi && !liveStreaming.termsLink);
        const isGooglePrivacy = liveStreaming.dataPrivacyLink === GOOGLE_PRIVACY_POLICY || (hasGoogleApi && !liveStreaming.dataPrivacyLink);
        let regexp = null;
        try { regexp = liveStreaming.validatorRegExpString && new RegExp(liveStreaming.validatorRegExpString); } catch (error) { regexp = null; }
        return {
            enabled: !!liveStreaming.enabled,
            helpURL: liveStreaming.helpLink || JITSI_LIVE_STREAMING_HELP_LINK,
            termsURL: liveStreaming.termsLink || (hasGoogleApi ? YOUTUBE_TERMS_URL : ''),
            dataPrivacyURL: liveStreaming.dataPrivacyLink || (hasGoogleApi ? GOOGLE_PRIVACY_POLICY : ''),
            termsLabelKey: isYouTubeTerms ? 'liveStreaming.youtubeTerms' : 'liveStreaming.terms',
            dataPrivacyLabelKey: isGooglePrivacy ? 'liveStreaming.googlePrivacyPolicy' : 'liveStreaming.privacyPolicy',
            streamKeyPlaceholderKey: hasGoogleApi ? 'liveStreaming.enterStreamKey' : 'liveStreaming.enterStreamKeyGeneric',
            streamLinkRegexp: regexp || (hasGoogleApi ? FOUR_GROUPS_DASH_SEPARATED : STREAM_KEY_OR_URL_REGEXP)
        };
    }

    // isLiveStreamingButtonVisible: enabled, a moderator, not in a breakout room.
    function liveStreamButtonVisible() {
        return liveStreamingConfig().enabled && isModerator() && !isInBreakoutRoom() && !state.iAmVisitor;
    }

    function liveStreamRunning() {
        return state.liveStream.status === 'on' || state.liveStream.status === 'pending';
    }

    function toggleLiveStream() {
        if (liveStreamRunning()) {
            // StopLiveStreamDialog
            confirmDialog({
                text: t('dialog.stopStreamingWarning'), confirmLabel: t('dialog.stopLiveStreaming'),
                onConfirm: () => {
                    const session = state.liveStream.session;
                    if (session && state.conference) state.conference.stopRecording(session.getID());
                }
            });
        } else openScreen('livestream');
    }

    // StartLiveStreamDialog.native + StreamKeyForm.native
    function renderLiveStreamScreen() {
        const config = liveStreamingConfig();
        const input = $('stream-key');
        input.placeholder = t(config.streamKeyPlaceholderKey);
        input.value = cfg.liveStreamKey || '';
        const error = $('stream-key-error');
        const validate = () => !input.value.trim() || config.streamLinkRegexp.test(input.value.trim());
        error.textContent = t('liveStreaming.invalidStreamKey');
        error.hidden = validate();
        input.oninput = () => { error.hidden = validate(); };
        const links = $('stream-links');
        links.textContent = '';
        [[config.helpURL, 'liveStreaming.streamIdHelp'], [config.termsURL, config.termsLabelKey],
            [config.dataPrivacyURL, config.dataPrivacyLabelKey]].forEach(([url, key]) => {
            if (!url) return;
            const link = el('button', 'button tertiary link', t(key));
            link.addEventListener('click', () => notify('openUrl', { url }));
            links.appendChild(link);
        });
    }

    function startLiveStream() {
        const key = $('stream-key').value.trim();
        if (!key || !state.conference) return;
        if (!liveStreamingConfig().streamLinkRegexp.test(key)) { $('stream-key-error').hidden = false; return; }
        cfg.liveStreamKey = key;
        notify('liveStreamKey', { key });
        closeScreen();
        state.liveStream = { status: 'pending', session: null };
        // showPendingRecordingNotification
        showNotification({ key: 'live-stream', title: t('dialog.liveStreaming'), description: t('liveStreaming.pending') });
        render();
        Promise.resolve(state.conference.startRecording({ mode: 'stream', streamId: key }))
            .catch(error => {
                log('live stream', recorderError(error));
                state.liveStream = { status: 'off', session: null };
                showLiveStreamError(recorderError(error));
                render();
            });
    }

    // _showRecordingErrorNotification for the stream mode.
    function showLiveStreamError(error) {
        const errors = JitsiMeetJS.constants.recording.error;
        let title = t('liveStreaming.failedToStart');
        let description = t('liveStreaming.error');
        if (error === errors.SERVICE_UNAVAILABLE) {
            title = t('liveStreaming.unavailableTitle');
            description = t('recording.unavailable', { serviceName: t('liveStreaming.serviceName') });
        } else if (error === errors.RESOURCE_CONSTRAINT) {
            title = t('liveStreaming.busyTitle');
            description = t('liveStreaming.busy');
        } else if (error === errors.UNEXPECTED_REQUEST) {
            title = t('liveStreaming.inProgress');
            description = t('liveStreaming.sessionAlreadyActive');
        } else if (error === errors.POLICY_VIOLATION) {
            description = t('liveStreaming.policyError');
        }
        showNotification({ key: 'live-stream', type: 'error', title, description, timeout: 10000 });
    }

    // A refused request comes as the XMPP error stanza of the server.
    function recorderError(error) {
        if (!error) return '';
        if (typeof error === 'string') return error;
        if (error.message) return error.message;
        if (error.querySelector) {
            const errors = JitsiMeetJS.constants.recording.error;
            const stanza = error.querySelector('error');
            const known = { 'service-unavailable': errors.SERVICE_UNAVAILABLE, 'resource-constraint': errors.RESOURCE_CONSTRAINT };
            for (const name of Object.keys(known)) { if (stanza && stanza.querySelector(name)) return known[name]; }
            return stanza && stanza.firstElementChild ? stanza.firstElementChild.tagName : 'error';
        }
        return String(error);
    }

    // getRecordButtonProps: file recording for a moderator of a server with
    // recordingService.enabled, not in a breakout room.
    function recordButtonVisible() {
        const config = (state.serverConfig || {}).recordingService || {};
        return !!config.enabled && isModerator() && !isInBreakoutRoom() && !state.iAmVisitor;
    }

    function recordingRunning() {
        return state.recording.status === 'on' || state.recording.status === 'pending';
    }

    function toggleRecording() {
        if (!recordingRunning() && liveStreamRunning()) {
            showNotification({ key: 'recording', title: t('dialog.recordingDisabledBecauseOfActiveLiveStreamingTooltip') });
            return;
        }
        if (recordingRunning()) {
            confirmDialog({
                title: t('dialog.recording'),
                text: t('dialog.stopRecordingWarning'),
                confirmLabel: t('dialog.Yes'),
                onConfirm: () => {
                    const session = state.recording.session;
                    if (session && state.conference) state.conference.stopRecording(session.getID());
                }
            });
            return;
        }
        confirmDialog({
            title: t('dialog.startRecording'),
            confirmLabel: t('dialog.startRecording'),
            onConfirm: startRecording
        });
    }

    function startRecording() {
        if (!state.conference) return;
        state.recording = { status: 'pending', session: null };
        showNotification({ key: 'recording', title: t('dialog.recording'), description: t('recording.pending') });
        render();
        Promise.resolve(state.conference.startRecording({
            mode: 'file',
            appData: JSON.stringify({ file_recording_metadata: { share: true } })
        })).catch(error => {
            log('recording', recorderError(error));
            state.recording = { status: 'off', session: null };
            showRecordingError(recorderError(error));
            render();
        });
    }

    // _showRecordingErrorNotification for the file mode.
    function showRecordingError(error) {
        const errors = JitsiMeetJS.constants.recording.error;
        let title = t('recording.failedToStart');
        let description = t('recording.error');
        if (error === errors.SERVICE_UNAVAILABLE) {
            title = t('recording.unavailableTitle');
            description = t('recording.unavailable', { serviceName: t('recording.serviceName') });
        } else if (error === errors.RESOURCE_CONSTRAINT) {
            title = t('recording.busyTitle');
            description = t('recording.busy');
        } else if (error === errors.UNEXPECTED_REQUEST) {
            title = t('recording.inProgress');
            description = t('recording.sessionAlreadyActive');
        }
        showNotification({ key: 'recording', type: 'error', title, description, timeout: 10000 });
    }

    function onFileRecordingChanged(session) {
        const status = session.getStatus();
        const previous = state.recording.status;
        state.recording = { status, session: status === 'off' ? null : session };
        const nameOf = who => {
            const id = who && (typeof who === 'string' ? who : who.getId && who.getId());
            const p = id && person(id);
            return p ? displayNameOf(p) : '';
        };
        if (status === 'on' && previous !== 'on') {
            const name = nameOf(session.getInitiator());
            showNotification({ key: 'recording', title: t('dialog.recording'),
                description: name ? t('recording.onBy', { name }) : t('recording.on') });
        } else if (status === 'off') {
            if (session.getError()) showRecordingError(session.getError());
            else if (previous === 'on') {
                const name = nameOf(session.getTerminator());
                showNotification({ key: 'recording', title: t('dialog.recording'),
                    description: name ? t('recording.offBy', { name }) : t('recording.off') });
            }
        }
        render();
    }

    // ---------------------------------------------------------- subtitles

    // features/subtitles: the transcriber sends the text to the participants
    // that asked for it; isCCTabEnabled shows it in a tab of the chat screen.
    const MAX_SUBTITLES = 300;

    function closedCaptionsEnabled() {
        const config = (state.serverConfig || {}).transcription || {};
        return !!config.enabled && !config.disableClosedCaptions && !isInBreakoutRoom();
    }

    function setSubtitlesRequested(enabled) {
        if (!state.conference) return;
        state.subtitlesRequested = enabled;
        state.conference.setLocalParticipantProperty('requestingTranscription', enabled);
        const statuses = JitsiMeetJS.constants.transcriptionStatus;
        if (enabled && statuses && state.conference.getTranscriptionStatus() === statuses.OFF && isModerator()) {
            Promise.resolve(state.conference.dial('jitsi_meet_transcribe')).catch(error => {
                log('transcriber', recorderError(error));
                state.conference.setLocalParticipantProperty('requestingTranscription', false);
                state.subtitlesRequested = false;
                showNotification({ key: 'subtitles', type: 'error', title: t('recording.failedToStart'), description: t('recording.error'), timeout: 10000 });
                renderSubtitles();
            });
        }
        renderSubtitles();
    }

    function onTranscriptionMessage(json) {
        if (!json || json.type !== 'transcription-result' || !closedCaptionsEnabled()) return;
        if (!Array.isArray(json.transcript) || !json.transcript[0]) return;
        const entry = {
            id: json.message_id,
            name: (json.participant && json.participant.name) || '',
            text: String(json.transcript[0].text || ''),
            interim: !!json.is_interim
        };
        const index = state.subtitles.findIndex(item => item.id === entry.id);
        if (index >= 0) state.subtitles[index] = entry;
        else state.subtitles.push(entry);
        if (state.subtitles.length > MAX_SUBTITLES) state.subtitles.shift();
        if (state.screen === 'chat' && state.chatTab === 'cc') renderSubtitles();
    }

    function renderSubtitles() {
        const list = $('cc-list');
        const toggle = $('cc-toggle');
        list.textContent = '';
        if (!state.subtitles.length) {
            const empty = el('div', 'cc-empty');
            empty.appendChild(icon('subtitles', 'large'));
            empty.appendChild(el('div', '', t('transcribing.subtitles')));
            list.appendChild(empty);
        }
        state.subtitles.forEach(item => {
            const row = el('div', `cc-message${item.interim ? ' interim' : ''}`);
            if (item.name) row.appendChild(el('div', 'cc-name', item.name));
            row.appendChild(el('div', 'cc-text', item.text));
            list.appendChild(row);
        });
        list.scrollTop = list.scrollHeight;
        toggle.textContent = t(state.subtitlesRequested ? 'transcribing.stop' : 'transcribing.start');
    }

    function onRecorderStateChanged(session) {
        if (session && session.getMode() === 'file') { onFileRecordingChanged(session); return; }
        if (!session || session.getMode() !== 'stream') return;
        const status = session.getStatus();
        const previous = state.liveStream.status;
        state.liveStream = { status, session: status === 'off' ? null : session };
        const nameOf = who => {
            const id = who && (typeof who === 'string' ? who : who.getId && who.getId());
            const p = id && person(id);
            return p ? displayNameOf(p) : '';
        };
        if (status === 'on' && previous !== 'on') {
            const name = nameOf(session.getInitiator());
            showNotification({ key: 'live-stream', title: t('dialog.liveStreaming'),
                description: name ? t('liveStreaming.onBy', { name }) : t('liveStreaming.on') });
        } else if (status === 'off') {
            if (session.getError()) showLiveStreamError(session.getError());
            else if (previous === 'on') {
                const name = nameOf(session.getTerminator());
                showNotification({ key: 'live-stream', title: t('dialog.liveStreaming'),
                    description: name ? t('liveStreaming.offBy', { name }) : t('liveStreaming.off') });
            }
        }
        render();
    }

    // ------------------------------------------------------------------ GIFs

    // features/gifs: a GIF is sent as the chat message "gif[<i.giphy.com url>]"
    // and shown on the sender's tile for giphy.tileTime (5 s by default).
    function giphyConfig() {
        return (state.serverConfig && state.serverConfig.giphy) || {};
    }

    function giphyEnabled() {
        return !!(giphyConfig().enabled && giphyConfig().sdkKey);
    }

    function gifDisplayMode() {
        return giphyConfig().displayMode || 'all';
    }

    function gifFromMessage(text) {
        const message = (text || '').trim();
        if (!message.toLowerCase().startsWith('gif[') || !message.endsWith(']')) return '';
        const url = message.substring(4, message.length - 1);
        try { return new URL(url).hostname === 'i.giphy.com' ? url : ''; } catch (error) { return ''; }
    }

    const gifs = new Map();

    function activeGif(id) {
        const gif = gifs.get(id === state.localId ? 'local' : id) || gifs.get(id);
        return gif ? gif.url : '';
    }

    // The tile uses GIPHY's 200 px rendition of the same GIF and counts its
    // time from the moment it has loaded: the full giphy.gif is several MB
    // and on a phone it would not arrive within the 5 s.
    function showGifOnTile(id, url) {
        const key = id === state.localId ? 'local' : id;
        const previous = gifs.get(key);
        if (previous) clearTimeout(previous.timer);
        gifs.delete(key);
        const small = url.replace(/\/giphy\.gif$/, '/200w.gif');
        const image = new Image();
        const show = source => {
            const timer = setTimeout(() => { gifs.delete(key); render(); }, giphyConfig().tileTime || 5000);
            gifs.set(key, { url: source, timer });
            render();
        };
        image.onload = () => show(small);
        image.onerror = () => show(url);
        image.src = small;
    }

    let gifRequest = 0;

    function openGifMenu() {
        const input = $('gif-search');
        input.value = '';
        input.placeholder = t('giphy.search');
        loadGifs('');
    }

    async function loadGifs(query) {
        const request = ++gifRequest;
        const grid = $('gif-grid');
        const params = new URLSearchParams({ api_key: giphyConfig().sdkKey, limit: '30', rating: giphyConfig().rating || 'g' });
        if (query) params.set('q', query);
        const endpoint = `https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}?${params}`;
        try {
            const response = await fetch(endpoint, { credentials: 'omit' });
            const body = await response.json();
            if (request !== gifRequest) return;
            grid.textContent = '';
            const items = body.data || [];
            if (!items.length) grid.appendChild(el('div', 'chat-empty', t('giphy.noResults')));
            items.forEach(item => {
                const images = item.images || {};
                const preview = (images.fixed_width_downsampled || images.fixed_width || images.downsized || {}).url;
                if (!preview) return;
                const button = el('button', 'gif-item');
                const image = el('img');
                image.src = preview;
                image.loading = 'lazy';
                button.appendChild(image);
                button.addEventListener('click', () => sendGif(item));
                grid.appendChild(button);
            });
        } catch (error) {
            log('giphy', error);
            if (request === gifRequest) { grid.textContent = ''; grid.appendChild(el('div', 'chat-empty', t('giphy.noResults'))); }
        }
    }

    // getGifUrl(): the media id is the last segment of embed_url.
    function sendGif(item) {
        const embed = item.embed_url || '';
        const id = embed.substring(embed.lastIndexOf('/') + 1) || item.id;
        closeScreen();
        if (!id || !state.conference || !state.joined) return;
        state.conference.sendTextMessage(`gif[https://i.giphy.com/media/${id}/giphy.gif]`);
    }

    // ------------------------------------------------------------------ polls

    // react/features/polls: the "Polls" tab of the chat screen. Polls travel
    // through the server's polls component (conference.getPolls()).
    const POLL_CHAR_LIMIT = 500;
    const POLL_ANSWERS_LIMIT = 255;

    function pollsHandler() {
        const conference = state.conference;
        const polls = conference && typeof conference.getPolls === 'function' ? conference.getPolls() : null;
        return polls && polls.isSupported() ? polls : null;
    }

    function sanitizePollAnswers(answers) {
        if (!Array.isArray(answers)) return [];
        return answers.slice(0, 32).map(answer => ({
            name: String(answer && answer.name !== undefined ? answer.name : ''),
            voters: Array.isArray(answer && answer.voters) ? answer.voters : []
        }));
    }

    function onPollReceived(data) {
        const { pollId, answers, senderId, question, history, singleAnswer } = data || {};
        if (!pollId) return;
        state.polls.set(pollId, {
            pollId, senderId, question: String(question || ''), answers: sanitizePollAnswers(answers),
            singleAnswer: singleAnswer === true, changingVote: false, showResults: false, lastVote: null, saved: false
        });
        if (!history) {
            const viewing = state.screen === 'chat' && state.chatTab === 'polls';
            if (!viewing) {
                state.pollsUnread++;
                playSound('message');
                showNotification({ title: t('polls.notification.title'), description: t('polls.notification.description'),
                    onClick: () => openScreen('chat', 'polls') });
            }
        }
        if (state.screen === 'chat') renderChatTabs();
        render();
    }

    function onPollAnswerReceived(data) {
        const { pollId, answers, senderId, senderName } = data || {};
        const poll = state.polls.get(pollId);
        if (!poll) return;
        const votes = Array.isArray(answers) ? answers.slice(0, 32).map(Boolean) : [];
        const voter = person(senderId);
        const name = voter ? voter.name : senderName;
        poll.answers.forEach((answer, index) => {
            const known = answer.voters.some(user => user.id === senderId);
            if (known && !votes[index]) answer.voters = answer.voters.filter(user => user.id !== senderId);
            else if (!known && votes[index]) answer.voters.push({ id: senderId, name });
        });
        if (state.screen === 'chat' && state.chatTab === 'polls') renderPolls();
    }

    function pollCreatorName(poll) {
        const creator = person(poll.senderId);
        return creator ? displayNameOf(creator) : '';
    }

    function renderPolls() {
        const list = $('polls-list');
        list.textContent = '';
        $('poll-create').hidden = !!state.pollDraft || !pollsHandler();
        if (state.pollDraft) { renderPollCreate(list); return; }
        if (!state.polls.size) {
            const empty = el('div', 'polls-empty');
            empty.appendChild(icon('message', 'huge'));
            empty.appendChild(el('div', '', t('polls.results.empty')));
            list.appendChild(empty);
            return;
        }
        state.polls.forEach(poll => {
            const item = el('div', 'poll-item');
            if (poll.showResults) renderPollResults(item, poll);
            else renderPollAnswer(item, poll);
            list.appendChild(item);
        });
        list.scrollTop = list.scrollHeight;
    }

    function pollHeader(item, poll) {
        item.appendChild(el('div', 'poll-question', poll.question));
        item.appendChild(el('div', 'poll-owner', t('polls.by', { name: pollCreatorName(poll) })));
    }

    // PollAnswer.native
    function renderPollAnswer(item, poll) {
        const checks = poll.lastVote ? poll.lastVote.slice() : poll.answers.map(() => false);
        const header = el('div', 'poll-header');
        const titles = el('div', '');
        header.appendChild(titles);
        item.appendChild(header);
        pollHeader(titles, poll);
        if (poll.singleAnswer) titles.appendChild(el('div', 'poll-owner', t('polls.answer.singleAnswerHint')));
        if (poll.saved) {
            const close = el('button', 'header-button');
            close.appendChild(icon('close-large'));
            close.setAttribute('aria-label', t('polls.closeButton'));
            close.addEventListener('click', () => { state.polls.delete(poll.pollId); renderPolls(); });
            header.appendChild(close);
        }
        const content = el('div', 'poll-answers');
        const switches = poll.answers.map((answer, index) => {
            const row = el('div', 'poll-switch-row');
            const toggle = el('button', 'switch' + (checks[index] ? ' on' : ''));
            toggle.disabled = poll.saved;
            toggle.addEventListener('click', () => {
                const value = !checks[index];
                if (poll.singleAnswer && value) checks.fill(false);
                checks[index] = value;
                switches.forEach((node, i) => node.classList.toggle('on', checks[i]));
                if (submit) submit.disabled = !checks.some(Boolean);
            });
            row.appendChild(toggle);
            row.appendChild(el('span', '', answer.name));
            content.appendChild(row);
            return toggle;
        });
        item.appendChild(content);
        const row = el('div', 'poll-buttons');
        let submit = null;
        const button = (label, type, onClick) => {
            const node = el('button', 'button ' + type, label);
            node.addEventListener('click', onClick);
            row.appendChild(node);
            return node;
        };
        if (poll.saved) {
            button(t('polls.answer.edit'), 'secondary', () => {
                state.pollDraft = { pollId: poll.pollId, question: poll.question,
                    answers: poll.answers.map(answer => answer.name), singleAnswer: poll.singleAnswer };
                renderPolls();
            });
            button(t('polls.answer.send'), 'primary', () => {
                const handler = pollsHandler();
                if (!handler) return;
                handler.createPoll(poll.pollId, poll.question, poll.answers.map(answer => ({ name: answer.name })),
                    { singleAnswer: poll.singleAnswer });
                state.polls.delete(poll.pollId);
                renderPolls();
            });
        } else {
            button(t('polls.answer.skip'), 'secondary', () => {
                if (poll.changingVote) { poll.changingVote = false; poll.showResults = true; }
                else { poll.lastVote = null; poll.showResults = true; }
                renderPolls();
            });
            submit = button(t('polls.answer.submit'), 'primary', () => {
                const handler = pollsHandler();
                if (handler) handler.answerPoll(poll.pollId, checks.slice());
                poll.lastVote = checks.slice();
                poll.changingVote = false;
                poll.showResults = true;
                renderPolls();
            });
            submit.disabled = !checks.some(Boolean);
        }
        item.appendChild(row);
    }

    // PollResults.native
    function renderPollResults(item, poll) {
        pollHeader(item, poll);
        const voters = new Set();
        poll.answers.forEach(answer => answer.voters.forEach(user => voters.add(user.id)));
        poll.answers.forEach(answer => {
            const count = answer.voters.length;
            const percentage = voters.size ? Math.round(count / voters.size * 100) : 0;
            const block = el('div', 'poll-result');
            const head = el('div', 'poll-result-header');
            head.appendChild(el('span', '', answer.name));
            head.appendChild(el('span', '', `(${count}) ${percentage}%`));
            block.appendChild(head);
            const bar = el('div', 'poll-bar');
            const fill = el('div', 'poll-bar-fill');
            fill.style.width = percentage + '%';
            bar.appendChild(fill);
            block.appendChild(bar);
            if (poll.showDetails && count) {
                const names = el('div', 'poll-voters');
                answer.voters.forEach(user => names.appendChild(el('div', '', user.name || '')));
                block.appendChild(names);
            }
            item.appendChild(block);
        });
        const links = el('div', 'poll-links');
        const details = el('button', 'button tertiary link',
            t(poll.showDetails ? 'polls.results.hideDetailedResults' : 'polls.results.showDetailedResults'));
        details.addEventListener('click', () => { poll.showDetails = !poll.showDetails; renderPolls(); });
        const vote = el('button', 'button tertiary link', t(poll.lastVote !== null ? 'polls.results.changeVote' : 'polls.results.vote'));
        vote.addEventListener('click', () => { poll.changingVote = true; poll.showResults = false; renderPolls(); });
        links.append(details, vote);
        item.appendChild(links);
    }

    // PollCreate.native: question, at least two options, Cancel / Save. A
    // saved poll is shown to its author first and sent with "Send".
    function renderPollCreate(list) {
        const draft = state.pollDraft;
        const form = el('div', 'poll-create');
        const fields = el('div', 'poll-create-fields');
        form.appendChild(fields);
        list.appendChild(form);
        let save = null;
        const valid = () => draft.question.trim().length > 0
            && draft.answers.filter(answer => answer.trim()).length >= 2
            && !draft.answers.some((answer, index) => answer.trim() && draft.answers.indexOf(answer) !== index);
        const update = () => { if (save) save.disabled = !valid(); };
        const field = (label, placeholder, value, onInput, errorText) => {
            const box = el('label', 'poll-field');
            box.appendChild(el('span', 'poll-field-label', label));
            const input = el('input', 'field');
            input.maxLength = POLL_CHAR_LIMIT;
            input.placeholder = placeholder;
            input.value = value;
            input.addEventListener('input', () => onInput(input.value));
            box.appendChild(input);
            if (errorText !== undefined) {
                const error = el('span', 'field-error', errorText);
                box.appendChild(error);
                box.error = error;
            }
            fields.appendChild(box);
            return { box, input };
        };
        const questionField = field(t('polls.create.pollQuestion'), t('polls.create.questionPlaceholder'), draft.question,
            value => { draft.question = value; update(); });
        fields.appendChild(el('div', 'poll-separator'));
        const options = [];
        const checkUnique = () => options.forEach((option, index) => {
            const value = draft.answers[index];
            const duplicate = value !== '' && draft.answers.slice(0, index).includes(value);
            option.input.classList.toggle('error', duplicate);
            option.box.error.textContent = duplicate ? t('polls.errors.notUniqueOption', { index: index + 1 }) : '';
        });
        draft.answers.forEach((answer, index) => {
            const option = field(t('polls.create.pollOption', { index: index + 1 }),
                t('polls.create.answerPlaceholder', { index: index + 1 }), answer,
                value => { draft.answers[index] = value; checkUnique(); update(); }, '');
            if (draft.answers.length > 2) {
                const remove = el('button', 'button tertiary link poll-remove', t('polls.create.removeOption'));
                remove.addEventListener('click', event => {
                    event.preventDefault();
                    draft.answers.splice(index, 1);
                    renderPolls();
                });
                option.box.appendChild(remove);
            }
            options.push(option);
        });
        checkUnique();
        const buttons = el('div', 'poll-create-buttons');
        if (state.serverConfig.showPollSingleAnswerSetting) {
            const row = el('div', 'poll-switch-row');
            const toggle = el('button', 'switch' + (draft.singleAnswer ? ' on' : ''));
            toggle.addEventListener('click', () => { draft.singleAnswer = !draft.singleAnswer; toggle.classList.toggle('on', draft.singleAnswer); });
            row.append(toggle, el('span', '', t('polls.create.singleAnswer')));
            buttons.appendChild(row);
        }
        const add = el('button', 'button secondary wide', t('polls.create.addOption'));
        add.disabled = draft.answers.length >= POLL_ANSWERS_LIMIT;
        add.addEventListener('click', () => {
            draft.answers.push('');
            renderPolls();
        });
        buttons.appendChild(add);
        const row = el('div', 'poll-buttons');
        const cancel = el('button', 'button secondary', t('polls.create.cancel'));
        cancel.addEventListener('click', () => { state.pollDraft = null; renderPolls(); });
        save = el('button', 'button primary', t('polls.create.save'));
        save.addEventListener('click', () => {
            if (!valid()) return;
            const answers = draft.answers.filter(answer => answer.trim()).map(name => ({ name, voters: [] }));
            const pollId = draft.pollId || Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
            // Editing keeps the draft in its place in the list.
            state.polls.set(pollId, { pollId, senderId: state.localId, question: draft.question, answers,
                singleAnswer: draft.singleAnswer, changingVote: false, showResults: false, lastVote: null, saved: true });
            state.pollDraft = null;
            renderPolls();
        });
        row.append(cancel, save);
        buttons.appendChild(row);
        form.appendChild(buttons);
        update();
    }

    function openPollCreate() {
        state.pollDraft = { pollId: '', question: '', answers: ['', ''], singleAnswer: false };
        renderPolls();
    }

    // Chat and Polls tabs (ChatAndPollsNavigator): shown when the server
    // has the polls component.
    function renderChatTabs() {
        const polls = !!pollsHandler() && !state.serverConfig.disablePolls;
        const captions = closedCaptionsEnabled();
        if ((!polls && state.chatTab === 'polls') || (!captions && state.chatTab === 'cc')) state.chatTab = 'chat';
        $('chat-tabs').hidden = !polls && !captions;
        $('chat-tabs').querySelector('[data-tab="polls"]').hidden = !polls;
        $('chat-tabs').querySelector('[data-tab="cc"]').hidden = !captions;
        $('chat-pane').hidden = state.chatTab !== 'chat';
        $('polls-pane').hidden = state.chatTab !== 'polls';
        $('cc-pane').hidden = state.chatTab !== 'cc';
        $('chat').querySelector('h1').textContent = t('chat.title');
        $('chat-tabs').querySelectorAll('[data-tab]').forEach(tab => {
            const active = tab.dataset.tab === state.chatTab;
            tab.classList.toggle('active', active);
            if (tab.dataset.tab === 'cc') { tab.textContent = t('transcribing.subtitles'); return; }
            const count = tab.dataset.tab === 'chat' ? state.unread : state.pollsUnread;
            tab.textContent = t(`chat.tabs.${tab.dataset.tab}`) + (count && !active ? ` (${count})` : '');
        });
        if (state.chatTab === 'cc') renderSubtitles();
        else if (state.chatTab === 'polls') { state.pollsUnread = 0; renderPolls(); }
        else { state.unread = 0; renderChat(); }
    }

    // ---------------------------------------------------------- shared video

    // features/shared-video: the owner broadcasts the "shared-video" command
    // (value = YouTube id or video URL, attributes from/state/time/muted);
    // the others follow it and correct their position when it drifts > 5 s.
    let player = null;
    let playerReady = false;
    let sharedVideoTimer = 0;

    function sharedVideoButtonVisible() {
        if (state.serverConfig && state.serverConfig.disableSharedVideo) return false;
        return !state.sharedVideo || isSharedVideoOwner();
    }

    function isSharedVideoOwner() {
        return !!state.sharedVideo && state.sharedVideo.ownerId === state.localId;
    }

    function youtubeId(url) {
        const match = url.match(/^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|(?:m\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))((\w|-){11})(?:\S+)?$/);
        return match ? match[1] : null;
    }

    function extractVideo(input) {
        const link = (input || '').trim();
        if (!link) return '';
        const id = youtubeId(link);
        if (id) return id;
        try { new URL(link); return link; } catch (error) { return ''; }
    }

    function toggleSharedVideo() {
        if (isSharedVideoOwner()) { stopSharedVideo(); return; }
        openDialog(dialog => {
            dialog.appendChild(el('div', 'dialog-title', t('dialog.shareVideoTitle')));
            const input = el('input', 'field');
            input.placeholder = t('dialog.sharedVideoLinkPlaceholder');
            dialog.appendChild(input);
            const error = el('div', 'field-error', t('dialog.sharedVideoDialogError'));
            error.hidden = true;
            dialog.appendChild(error);
            const row = dialogActions(dialog, [
                { label: t('dialog.Cancel'), onClick: closeDialog },
                { label: t('dialog.Ok'), type: 'primary', disabled: true, onClick: () => {
                    const video = extractVideo(input.value);
                    if (!video) { error.hidden = false; input.classList.add('error'); return; }
                    closeDialog();
                    startSharedVideo(video);
                } }
            ]);
            input.addEventListener('input', () => {
                row.lastChild.disabled = !input.value.trim();
                error.hidden = true;
                input.classList.remove('error');
            });
        });
    }

    function sendSharedVideoCommand(status, time) {
        const video = state.sharedVideo;
        if (!state.conference || !video) return;
        state.conference.sendCommandOnce('shared-video', {
            value: video.url,
            attributes: { from: state.localId, muted: false, state: status, time: Math.max(0, time || 0) }
        });
    }

    function startSharedVideo(url) {
        state.sharedVideo = { url, ownerId: state.localId, status: 'start', time: 0 };
        state.pinnedId = '';
        state.tileView = false;
        sendSharedVideoCommand('start', 0);
        clearInterval(sharedVideoTimer);
        // AbstractVideoManager: the owner reports its state every 5 seconds.
        sharedVideoTimer = setInterval(reportSharedVideo, 5000);
        render();
    }

    function reportSharedVideo() {
        if (!isSharedVideoOwner()) return;
        const time = playerTime();
        const status = playerPlaying() ? 'playing' : 'pause';
        state.sharedVideo.status = status;
        state.sharedVideo.time = time;
        sendSharedVideoCommand(status, time);
    }

    function stopSharedVideo() {
        if (isSharedVideoOwner()) sendSharedVideoCommand('stop', 0);
        resetSharedVideo();
    }

    function resetSharedVideo() {
        clearInterval(sharedVideoTimer);
        state.sharedVideo = null;
        destroyPlayer();
        render();
    }

    function onSharedVideoCommand(data, from) {
        const attributes = data.attributes || {};
        const status = attributes.state;
        const url = data.value;
        const current = state.sharedVideo;
        if (current && current.ownerId !== from) return;
        if (status === 'stop') {
            if (current && from !== state.localId) {
                showNotification({ type: 'warning', title: t('dialog.shareVideoLinkStopped', { name: displayNameOf(person(from)) }) });
                resetSharedVideo();
            }
            return;
        }
        if (!['start', 'playing', 'pause'].includes(status) || from === state.localId) return;
        if (current && current.url !== url) return;
        const time = Number(attributes.time) || 0;
        if (!current) {
            const accept = () => {
                state.sharedVideo = { url, ownerId: from, status, time };
                state.pinnedId = '';
                state.tileView = false;
                render();
            };
            // Only YouTube is trusted without asking (DEFAULT_ALLOWED_URL_DOMAINS).
            if (/^https?:/.test(url) && !/(^|\.)youtube\.com$/.test(hostOf(url))) {
                confirmDialog({ title: t('dialog.shareVideoConfirmPlayTitle', { name: displayNameOf(person(from)) }),
                    text: t('dialog.shareVideoConfirmPlay'), confirmLabel: t('dialog.Yes'), onConfirm: accept });
            } else accept();
            return;
        }
        current.status = status;
        current.time = time;
        followSharedVideo();
    }

    function hostOf(url) {
        try { return new URL(url).hostname; } catch (error) { return ''; }
    }

    function playerTime() {
        if (!player) return 0;
        if (player.tagName === 'VIDEO') return player.currentTime || 0;
        return playerReady && player.getCurrentTime ? player.getCurrentTime() || 0 : 0;
    }

    function playerPlaying() {
        if (!player) return false;
        if (player.tagName === 'VIDEO') return !player.paused;
        return playerReady && !!player.getPlayerState && player.getPlayerState() === 1;
    }

    function followSharedVideo() {
        const video = state.sharedVideo;
        if (!video || !player || isSharedVideoOwner()) return;
        if (player.tagName !== 'VIDEO' && !playerReady) return;
        if (Math.abs(playerTime() - video.time) > 5) {
            if (player.tagName === 'VIDEO') player.currentTime = video.time;
            else player.seekTo(video.time, true);
        }
        const play = video.status === 'playing' || video.status === 'start';
        if (play && !playerPlaying()) {
            if (player.tagName === 'VIDEO') player.play().catch(() => {});
            else player.playVideo();
        } else if (!play && playerPlaying()) {
            if (player.tagName === 'VIDEO') player.pause();
            else player.pauseVideo();
        }
    }

    function destroyPlayer() {
        if (player && player.destroy) { try { player.destroy(); } catch (error) { /* already gone */ } }
        player = null;
        playerReady = false;
        const holder = $('shared-video');
        holder.textContent = '';
        holder.dataset.url = '';
    }

    let youtubeApi = null;

    function loadYoutubeApi() {
        if (!youtubeApi) {
            youtubeApi = new Promise(resolve => {
                window.onYouTubeIframeAPIReady = () => resolve(window.YT);
                loadScript('https://www.youtube.com/iframe_api').catch(error => { log('youtube api', error); youtubeApi = null; });
            });
        }
        return youtubeApi;
    }

    function renderSharedVideo(visible) {
        const holder = $('shared-video');
        holder.hidden = !visible;
        const video = state.sharedVideo;
        if (!video) { if (player || holder.dataset.url) destroyPlayer(); return; }
        if (holder.dataset.url === video.url) return;
        destroyPlayer();
        holder.dataset.url = video.url;
        const owner = isSharedVideoOwner();
        if (/^https?:/.test(video.url)) {
            const element = el('video');
            element.src = video.url;
            element.playsInline = true;
            element.controls = owner;
            element.autoplay = true;
            if (!owner) element.currentTime = video.time;
            element.addEventListener('play', () => { if (owner) reportSharedVideo(); });
            element.addEventListener('pause', () => { if (owner) reportSharedVideo(); });
            holder.appendChild(element);
            player = element;
            return;
        }
        const target = el('div');
        holder.appendChild(target);
        loadYoutubeApi().then(YT => {
            if (holder.dataset.url !== video.url) return;
            player = new YT.Player(target, {
                videoId: video.url,
                width: '100%',
                height: '100%',
                playerVars: { autoplay: 1, controls: owner ? 1 : 0, playsinline: 1, rel: 0, start: Math.floor(video.time || 0) },
                events: {
                    onReady: () => { playerReady = true; if (owner) reportSharedVideo(); else followSharedVideo(); },
                    onStateChange: () => { if (owner) reportSharedVideo(); }
                }
            });
        });
    }

    // ------------------------------------------------------- speaker stats

    let statsTimer = 0;

    // createLocalizedTime() of speaker-stats: "1ч 2м 3с".
    function speakerTime(ms) {
        const total = Math.floor(ms / 1000);
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor(total / 60) % 60;
        const seconds = total % 60;
        const parts = [];
        if (hours) parts.push(t('speakerStats.hours', { count: hours }));
        if (hours || minutes) parts.push(t('speakerStats.minutes', { count: minutes }));
        parts.push(t('speakerStats.seconds', { count: seconds }));
        return parts.join(' ');
    }

    function renderSpeakerStats() {
        clearInterval(statsTimer);
        const input = $('stats-search');
        input.placeholder = t('speakerStats.searchHint');
        const draw = () => {
            if (state.screen !== 'stats') { clearInterval(statsTimer); return; }
            const list = $('stats-list');
            list.textContent = '';
            const stats = state.conference && state.conference.getSpeakerStats ? state.conference.getSpeakerStats() : {};
            const filter = input.value.trim().toLowerCase();
            Object.entries(stats)
                .filter(([, item]) => !item.hasLeft || !item.hasLeft())
                .map(([id, item]) => {
                    const p = person(id) || { name: item.getDisplayName && item.getDisplayName() };
                    return { p, time: item.getTotalDominantSpeakerTime(), dominant: item.isDominantSpeaker(), local: id === state.localId };
                })
                .filter(entry => !filter || displayNameOf(entry.p).toLowerCase().includes(filter))
                .sort((a, b) => b.time - a.time)
                .forEach(entry => {
                    const item = el('div', 'participant-item' + (entry.dominant ? ' dominant-speaker' : ''));
                    item.appendChild(avatar(entry.p));
                    const details = el('div', 'details');
                    details.appendChild(el('div', 'name', displayNameOf(entry.p) + (entry.local ? ` (${t('chat.you')})` : '')));
                    item.appendChild(details);
                    item.appendChild(el('div', 'stats-time', speakerTime(entry.time)));
                    list.appendChild(item);
                });
        };
        draw();
        statsTimer = setInterval(draw, 1000);
    }

    // ------------------------------------------------------- breakout rooms

    function breakoutApi() {
        const api = state.conference && state.conference.getBreakoutRooms && state.conference.getBreakoutRooms();
        return api && api.isSupported() ? api : null;
    }

    function isInBreakoutRoom() {
        const api = breakoutApi();
        return !!(api && api.isBreakoutRoom());
    }

    function mainRoom() {
        return Object.values(state.breakoutRooms).find(room => room.isMainRoom);
    }

    // getCurrentRoomId(): rooms are keyed by the room node, not the full JID.
    function currentRoomId() {
        if (isInBreakoutRoom()) return state.conference.getName();
        const main = mainRoom();
        return main ? main.id : (state.conference ? state.conference.getName() : '');
    }

    function currentBreakoutRoom() {
        if (!isInBreakoutRoom()) return null;
        return state.breakoutRooms[currentRoomId()] || null;
    }

    function breakoutRoomsVisible() {
        if (!breakoutApi()) return false;
        const others = Object.values(state.breakoutRooms).filter(room => !room.isMainRoom);
        return isModerator() || others.length > 0;
    }

    // The focus component is listed among the room members but is not a person.
    function roomParticipants(room) {
        return Object.entries(room.participants || {})
            .filter(([key, p]) => !key.endsWith('/focus') && !(p.jid || '').startsWith('focus@'))
            // The MUC JID is kept: sendParticipantToRoom finds the participant by it.
            .map(([key, p]) => Object.assign({ key }, p));
    }

    function createBreakoutRoom() {
        const api = breakoutApi();
        if (!api) return;
        state.roomCounter++;
        api.createBreakoutRoom(t('breakoutRooms.defaultName', { index: state.roomCounter }));
    }

    // _findParticipantJid() of breakout-rooms/actions.ts: the rooms list is
    // keyed by the MUC JID and carries the connection JID the server needs.
    function participantJid(id) {
        let roomJid = id;
        if (!id.includes('@')) {
            const participant = state.conference && state.conference.getParticipantById(id);
            roomJid = participant ? participant.getJid() : '';
        }
        if (!roomJid) return '';
        for (const room of Object.values(state.breakoutRooms)) {
            const participants = room.participants || {};
            const entry = participants[roomJid] || Object.values(participants).find(item => item.jid === roomJid);
            if (entry) return entry.jid;
        }
        return '';
    }

    function sendParticipantToRoom(id, roomId) {
        const api = breakoutApi();
        const room = state.breakoutRooms[roomId];
        const jid = participantJid(id);
        if (!api || !room || !jid) { log('send to room: unknown participant or room', id, roomId); return; }
        api.sendParticipantToRoom(jid, room.jid);
    }

    function closeBreakoutRoom(room) {
        const main = mainRoom();
        if (!main) return;
        roomParticipants(room).forEach(p => {
            const api = breakoutApi();
            if (api) api.sendParticipantToRoom(p.jid, main.jid);
        });
    }

    function removeBreakoutRoom(room) {
        if (roomParticipants(room).length) closeBreakoutRoom(room);
        const api = breakoutApi();
        if (api) api.removeBreakoutRoom(room.jid);
    }

    function autoAssignToBreakoutRooms() {
        const rooms = Object.values(state.breakoutRooms).filter(room => !room.isMainRoom);
        if (!rooms.length) return;
        const ids = [...state.remotes.keys()];
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        const size = Math.ceil(ids.length / rooms.length);
        ids.forEach((id, index) => sendParticipantToRoom(id, rooms[Math.floor(index / size)].id));
    }

    function renameBreakoutRoom(room) {
        openDialog(dialog => {
            dialog.appendChild(el('div', 'dialog-title', t('dialog.renameBreakoutRoomTitle')));
            const input = el('input', 'field');
            input.value = room.name || '';
            dialog.appendChild(input);
            dialogActions(dialog, [
                { label: t('dialog.Cancel'), onClick: closeDialog },
                { label: t('dialog.Ok'), type: 'primary', onClick: () => {
                    const name = input.value.trim();
                    closeDialog();
                    const api = breakoutApi();
                    if (name && api) api.renameBreakoutRoom(room.jid, name);
                } }
            ]);
        });
    }

    // moveToRoom() of breakout-rooms/actions.ts, mobile branch: leave the
    // current conference and join the target room on the same connection.
    async function moveToRoom(roomId) {
        const requested = roomId || (mainRoom() && mainRoom().jid) || '';
        // The server sends a full JID; the rooms list is keyed by its node.
        const room = state.breakoutRooms[requested]
            || Object.values(state.breakoutRooms).find(item => item.jid === requested || item.id === requested.split('@')[0]);
        if (!room || !state.connection) { log('move to room: unknown room', requested); return; }
        const target = room.jid || room.id;
        const [node, ...domain] = target.split('@');
        // eslint-disable-next-line no-new-wrappers
        const roomName = new String(node);
        roomName.domain = domain.join('@');
        state.switchingRoom = true;
        closeScreen();
        if (state.whiteboardOpen) closeWhiteboard();
        state.collabDetails = null;
        showConnecting(t('connectingOverlay.joiningRoom'));
        const conference = state.conference;
        state.conference = null;
        state.joined = false;
        try { await conference.leave('switch_room'); } catch (error) { log('leave for room switch', error); }
        state.remotes.forEach(p => { if (p.tracks.audio && p.tracks.audio._sink) p.tracks.audio._sink.remove(); });
        state.remotes.clear();
        state.dominantId = '';
        state.pinnedId = '';
        state.knocking.clear();
        if (state.sharedVideo) resetSharedVideo();
        state.switchingRoom = false;
        joinConference(undefined, roomName);
        showNotification({
            title: t('breakoutRooms.notifications.joinedTitle'),
            description: room.isMainRoom ? t('breakoutRooms.notifications.joinedMainRoom')
                : t('breakoutRooms.notifications.joined', { name: room.name })
        });
    }

    function openBreakoutRoomMenu(room) {
        const moderator = isModerator();
        const inRoom = room.id === currentRoomId();
        openSheet(sheet => {
            sheet.appendChild(el('div', 'sheet-title', room.isMainRoom ? t('breakoutRooms.mainRoom') : room.name));
            if (!inRoom) sheetItem(sheet, null, t('breakoutRooms.actions.join'), () => moveToRoom(room.id));
            if (moderator && !room.isMainRoom) {
                sheetItem(sheet, null, t('breakoutRooms.actions.rename'), () => renameBreakoutRoom(room));
                if (roomParticipants(room).length) sheetItem(sheet, null, t('breakoutRooms.actions.close'), () => closeBreakoutRoom(room));
                else sheetItem(sheet, null, t('breakoutRooms.actions.remove'), () => removeBreakoutRoom(room), 'danger');
            }
        });
    }

    // The participant menu of the breakout rooms list (jitsi-meet:
    // RoomParticipantContextMenu): a moderator sends the participant to
    // another room; for oneself it is joining that room.
    function openBreakoutParticipantMenu(p, currentRoom) {
        const others = Object.values(state.breakoutRooms).filter(room => room.id !== currentRoom.id);
        if (!others.length) return;
        const resource = (p.key || '').split('/')[1] || '';
        const self = !!state.conference && resource === state.conference.myUserId();
        openSheet(sheet => {
            sheet.appendChild(el('div', 'sheet-title', p.displayName || t('notify.somebody')));
            sheet.appendChild(el('div', 'sheet-subtitle', t(self ? 'breakoutRooms.actions.join' : 'breakoutRooms.actions.sendToBreakoutRoom')));
            others.forEach(room => {
                const label = room.isMainRoom ? t('breakoutRooms.mainRoom') : room.name;
                sheetItem(sheet, null, label, () => (self ? moveToRoom(room.id) : sendParticipantToRoom(p.key, room.id)));
            });
        });
    }

    function renderBreakoutRooms() {
        const list = $('breakout-list');
        list.textContent = '';
        const rooms = Object.values(state.breakoutRooms).sort((a, b) => (b.isMainRoom ? 1 : 0) - (a.isMainRoom ? 1 : 0));
        rooms.forEach(room => {
            const participants = roomParticipants(room);
            const title = (room.isMainRoom ? t('breakoutRooms.mainRoom') : room.name) + ` (${participants.length})`;
            const header = el('button', 'breakout-room');
            header.appendChild(icon(room.collapsed ? 'arrow-down' : 'arrow-up', 'medium'));
            header.appendChild(el('span', '', title));
            header.addEventListener('click', () => { room.collapsed = !room.collapsed; renderBreakoutRooms(); });
            header.addEventListener('contextmenu', event => { event.preventDefault(); openBreakoutRoomMenu(room); });
            let pressTimer = 0;
            header.addEventListener('pointerdown', () => { pressTimer = setTimeout(() => { pressTimer = -1; openBreakoutRoomMenu(room); }, 500); });
            header.addEventListener('pointerup', event => { if (pressTimer === -1) event.preventDefault(); clearTimeout(pressTimer); });
            list.appendChild(header);
            if (!room.collapsed) {
                participants.forEach(p => {
                    const movable = isModerator() && Object.keys(state.breakoutRooms).length > 1;
                    const item = el(movable ? 'button' : 'div', 'participant-item breakout-participant');
                    if (movable) item.addEventListener('click', () => openBreakoutParticipantMenu(p, room));
                    item.appendChild(avatar({ name: p.displayName }));
                    const details = el('div', 'details');
                    details.appendChild(el('div', 'name', p.displayName || t('notify.somebody')));
                    if (p.role === 'moderator') details.appendChild(el('div', 'role', t('videothumbnail.moderator')));
                    item.appendChild(details);
                    if (movable) { const go = icon('arrow-back', 'medium'); go.classList.add('go'); item.appendChild(go); }
                    list.appendChild(item);
                });
            }
        });
        const footer = $('breakout-footer');
        footer.textContent = '';
        if (isModerator()) {
            const add = el('button', 'button secondary wide', t('breakoutRooms.actions.add'));
            add.addEventListener('click', createBreakoutRoom);
            footer.appendChild(add);
            if (rooms.some(room => !room.isMainRoom) && state.remotes.size) {
                const assign = el('button', 'button secondary wide', t('breakoutRooms.actions.autoAssign'));
                assign.addEventListener('click', autoAssignToBreakoutRooms);
                footer.appendChild(assign);
            }
        }
        if (isInBreakoutRoom()) {
            const leaveRoom = el('button', 'button danger wide', t('breakoutRooms.actions.leaveBreakoutRoom'));
            leaveRoom.addEventListener('click', () => moveToRoom());
            footer.appendChild(leaveRoom);
        }
    }

    // RFC 1321 MD5, used for the whiteboard collaboration room name exactly
    // as jitsi-meet does (js-md5).
    function md5(text) {
        const bytes = new TextEncoder().encode(text);
        const words = [];
        for (let i = 0; i < bytes.length; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
        const bitLength = bytes.length * 8;
        words[bitLength >> 5] |= 0x80 << (bitLength % 32);
        words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;
        const K = [];
        for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0;
        const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
        let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
        for (let chunk = 0; chunk < words.length; chunk += 16) {
            let a = a0, b = b0, c = c0, d = d0;
            for (let i = 0; i < 64; i++) {
                let f, g;
                if (i < 16) { f = (b & c) | (~b & d); g = i; }
                else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
                else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
                else { f = c ^ (b | ~d); g = (7 * i) % 16; }
                const s = S[(i >> 4) * 4 + (i % 4)];
                const sum = (a + f + K[i] + (words[chunk + g] | 0)) | 0;
                a = d; d = c; c = b;
                b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
            }
            a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
        }
        return [a0, b0, c0, d0].map(n => {
            let hex = '';
            for (let i = 0; i < 4; i++) hex += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
            return hex;
        }).join('');
    }

    function invite() {
        notify('invite', { url: cfg.inviteUrl });
    }

    // ------------------------------------------------------------- connection

    function appendRoom(url) {
        if (!url) return url;
        const room = cfg.room.normalize('NFKC').toLowerCase();
        return url + (url.includes('?') ? '&' : '?') + 'room=' + encodeURIComponent(room);
    }

    // config.js often uses protocol-relative ("//host/http-bind") or relative
    // addresses meant for a page served by the Jitsi server itself.
    function absolute(url, websocket) {
        if (!url || typeof url !== 'string') return url;
        const server = new URL(cfg.server);
        const resolved = new URL(url, server.origin + '/');
        if (url.startsWith('//') && websocket) resolved.protocol = server.protocol === 'https:' ? 'wss:' : 'ws:';
        return resolved.toString();
    }

    // Same as constructOptions() in jitsi-meet base/connection/actions.any.ts.
    function connectionOptions() {
        const options = JSON.parse(JSON.stringify(state.serverConfig));
        options.bosh = absolute(options.bosh);
        options.websocket = absolute(options.websocket, true);
        options.websocketKeepAliveUrl = absolute(options.websocketKeepAliveUrl);
        options.conferenceRequestUrl = absolute(options.conferenceRequestUrl);
        const websocket = options.preferBosh ? undefined : options.websocket;
        options.serviceUrl = appendRoom(websocket || options.bosh);
        options.websocketKeepAliveUrl = appendRoom(options.websocketKeepAliveUrl);
        options.conferenceRequestUrl = appendRoom(options.conferenceRequestUrl);
        if (!options.flags || typeof options.flags.ssrcRewritingEnabled === 'undefined') {
            options.flags = Object.assign({}, options.flags, { ssrcRewritingEnabled: true });
        }
        // Gecko 78 creates the SCTP data channel to the bridge but it never
        // opens, so endpoint messages (reactions and others) are lost; the
        // bridge's WebSocket is used instead.
        if (gecko) options.bridgeChannel = Object.assign({}, options.bridgeChannel, { preferSctp: false });
        return options;
    }

    let reconnectTimer = 0;

    // PageReloadDialog of jitsi-meet: "Something went wrong", a 10-30 s
    // countdown to the next attempt, Cancel (leave) and Rejoin now. retry
    // defaults to opening the XMPP connection again.
    function scheduleReconnect(retry) {
        state.retries++;
        clearInterval(reconnectTimer);
        hideConnecting();
        showNotification({ key: 'connection-failed', type: 'error', title: t('notify.connectionFailed'), timeout: 10000 });
        let seconds = 10 + Math.floor(Math.random() * 21);
        let text = null;
        const rejoin = async () => {
            clearInterval(reconnectTimer);
            reconnectTimer = 0;
            closeDialog();
            showConnecting(t('connectingOverlay.joiningRoom'));
            if (retry) { retry(); return; }
            await disconnect(true);
            if (!state.leaving) connect();
        };
        openDialog(dialog => {
            dialog.appendChild(el('div', 'dialog-title', t('dialog.conferenceReloadTitle')));
            text = el('div', 'dialog-text', t('dialog.conferenceReloadMsg', { seconds }));
            dialog.appendChild(text);
            dialogActions(dialog, [
                { label: t('dialog.Cancel'), onClick: () => { clearInterval(reconnectTimer); reconnectTimer = 0; closeDialog(); leave('cancel'); } },
                { label: t('dialog.rejoinNow'), type: 'primary', onClick: rejoin }
            ]);
        });
        reconnectTimer = setInterval(() => {
            seconds--;
            if (seconds > 0) { text.textContent = t('dialog.conferenceReloadMsg', { seconds }); return; }
            rejoin();
        }, 1000);
    }

    function showConnecting(text) {
        $('connecting').hidden = false;
        $('connecting-text').textContent = text || '';
    }

    function hideConnecting() { $('connecting').hidden = true; }

    // Credentials the server accepted are saved for the next meetings;
    // saved: true marks those already in the secure storage.
    function rememberCredentials() {
        const credentials = state.credentials;
        if (!credentials || credentials.saved) return;
        credentials.saved = true;
        notify('credentials', { username: credentials.username, password: credentials.password });
    }

    function forgetCredentials() {
        notify('credentials', { username: '', password: '' });
    }

    function connect() {
        const E = JitsiMeetJS.events.connection;
        if (!state.credentials && state.savedLogin && !state.iAmVisitor) {
            const login = state.savedLogin;
            state.savedLogin = null;
            state.credentials = { id: toJid(login.username), username: login.username, password: login.password, saved: true };
        }
        const connection = new JitsiMeetJS.JitsiConnection(null, state.jwt || null, connectionOptions());
        state.connection = connection;
        connection.addEventListener(E.CONNECTION_ESTABLISHED, () => {
            if (state.connection !== connection) return;
            if (state.credentials && !state.iAmVisitor) rememberCredentials();
            joinConference();
        });
        connection.addEventListener(E.CONNECTION_FAILED, (error, message, credentials, details) => {
            if (state.connection !== connection || state.leaving) return;
            const errors = JitsiMeetJS.errors.connection;
            log('connection failed', error, message, details || '', 'jwt:', !!state.jwt, 'joined:', state.joined);
            if (error === errors.PASSWORD_REQUIRED) {
                // The server drops this connection right after; that is not
                // a network failure to reconnect from.
                state.connection = null;
                hideConnecting();
                if (state.credentials) {
                    // LoginDialog: the credentials the user typed were refused;
                    // refused saved ones are removed from the storage.
                    const username = state.credentials.username;
                    if (state.credentials.saved) forgetCredentials();
                    state.credentials = null;
                    loginDialog({ username, message: t('dialog.incorrectPassword') });
                } else if (state.jwt) {
                    // The server refused the token: forget it and offer the sign-in again.
                    state.jwt = '';
                    notify('token', { jwt: '' });
                    confirmDialog({ title: t('dialog.tokenAuthFailedTitle'), text: t('dialog.tokenAuthFailed'), cancelLabel: null,
                        onConfirm: showWaitForOwner });
                } else login();
                return;
            }
            // A dropped XMPP connection is retried, like jitsi-meet's reload
            // overlay does, before giving up.
            scheduleReconnect();
        });
        connection.addEventListener(E.CONNECTION_REDIRECTED, (vnode, focusJid, username) => {
            if (state.connection === connection && !state.leaving) onRedirected(vnode, focusJid, username);
        });
        connection.addEventListener(E.CONNECTION_DISCONNECTED, () => {
            if (state.connection === connection && !state.leaving) log('connection closed');
        });
        // A visitor node takes anonymous visitors only.
        const credentials = state.credentials && !state.iAmVisitor ? state.credentials : null;
        connection.connect(credentials ? { id: credentials.id, password: credentials.password } : undefined);
    }

    function joinConference(password, roomOverride) {
        const config = state.serverConfig;
        if (roomOverride !== undefined) state.roomName = roomOverride;
        const C = JitsiMeetJS.events.conference;
        const options = Object.assign({}, config, {
            confID: `${new URL(cfg.server).host}/${backendSafeRoomName(cfg.room)}`,
            statisticsDisplayName: cfg.displayName
        });
        if (prefs.disableP2p) options.p2p = Object.assign({}, config.p2p, { enabled: false });
        // Gecko 78 (Aurora OS 5.1) describes simulcast video in a way Jicofo
        // refuses (offerAnswerFailed, bad-request): one video layer there.
        if (gecko) options.disableSimulcast = true;
        // Gecko 78 (Aurora OS 5.1) decodes VP8 only: it has no H264 decoder
        // (Firefox gets it from the OpenH264 plugin) and does not take VP9 or
        // AV1 here. The codec list it announces is VP8 alone, so the others
        // send VP8 to it, a screen of the Jitsi mobile app included (shown
        // black otherwise).
        if (gecko) {
            // The adaptive mode of lib-jitsi-meet takes the camera picture,
            // kept small on purpose (nativeCameraTrack), for an overloaded
            // processor and cuts the received video down to 180-270 lines;
            // the camera adapts itself here.
            const vp8 = { codecPreferenceOrder: ['VP8', 'VP9'], mobileCodecPreferenceOrder: ['VP8', 'VP9'],
                screenshareCodec: 'VP8', mobileScreenshareCodec: 'VP8', enableAdaptiveMode: false };
            options.videoQuality = Object.assign({}, config.videoQuality, vp8);
            options.p2p = Object.assign({}, options.p2p || config.p2p, vp8);
        }
        state.polls = new Map();
        state.pollsUnread = 0;
        state.pollDraft = null;
        const conference = state.connection.initJitsiConference(state.roomName || backendSafeRoomName(cfg.room), options);
        state.conference = conference;
        // Events of a conference left for a breakout room are ignored.
        const on = (event, handler) => conference.on(event, (...args) => { if (state.conference === conference) handler(...args); });

        on(C.CONFERENCE_JOINED, onConferenceJoined);
        on(C.CONFERENCE_FAILED, onConferenceFailed);
        on(C.CONFERENCE_ERROR, error => log('conference error', error));
        // After a failure (FOCUS_LEFT and the like) the library leaves the
        // room by itself; that is not the user leaving while the reload
        // dialog waits to rejoin.
        on(C.CONFERENCE_LEFT, () => { if (!state.leaving && !reconnectTimer) leave('left'); });
        on(C.KICKED, (actor, reason) => {
            const name = actor && actor.getDisplayName ? actor.getDisplayName() : '';
            state.leaving = true;
            // conference/actions.native: an AlertDialog with the kick title
            // alone; the reason the server sends is not shown.
            log('kicked', reason || '');
            confirmDialog({ title: actor ? t('dialog.kickTitle', { participantDisplayName: name || t('notify.somebody') })
                : t('dialog.kickSystemTitle'),
                cancelLabel: null, onConfirm: () => finish('kicked') });
        });
        on(C.USER_JOINED, (id, participant) => {
            // commonUserJoinedHandling: hidden participants (the recorder or
            // the live streaming bot) are not participants of the meeting.
            if (participant.isHidden()) return;
            const p = {
                id, name: participant.getDisplayName(), role: participant.getRole(), tracks: {},
                raisedHand: isRaised(participant.getProperty && participant.getProperty('raisedHand')), avatarURL: ''
            };
            state.remotes.set(id, p);
            if (state.joined) {
                showNotification({ key: 'joined', title: t('notify.connectedOneMember', { name: displayNameOf(p) }) });
                playSound('joined');
            }
            render();
        });
        on(C.USER_LEFT, id => {
            const p = state.remotes.get(id);
            if (!p) return;
            state.remotes.delete(id);
            if (state.pinnedId === id) state.pinnedId = '';
            if (state.dominantId === id) state.dominantId = '';
            if (state.sharedVideo && state.sharedVideo.ownerId === id) resetSharedVideo();
            if (p.tracks.audio && p.tracks.audio._sink) p.tracks.audio._sink.remove();
            showNotification({ key: 'left', title: t('notify.leftOneMember', { name: displayNameOf(p) }) });
            playSound('left');
            render();
        });
        on(C.DISPLAY_NAME_CHANGED, (id, name) => {
            const p = person(id);
            if (p && !p.local) { p.name = name; render(); }
        });
        on(C.USER_ROLE_CHANGED, (id, role) => {
            if (id === state.localId) {
                const was = state.local.role;
                state.local.role = role;
                if (role === 'moderator' && was !== 'moderator' && state.joined) showNotification({ title: t('notify.moderator') });
                moderationChanged();
            } else if (state.remotes.has(id)) state.remotes.get(id).role = role;
            render();
        });
        on(C.DOMINANT_SPEAKER_CHANGED, id => {
            state.dominantId = id;
            render();
        });
        on(C.TRACK_ADDED, onTrackAdded);
        on(C.TRACK_REMOVED, onTrackRemoved);
        on(C.TRACK_MUTE_CHANGED, (track, actor) => {
            if (track.isLocal()) {
                if (track.getType() === 'audio') state.audioMuted = track.isMuted();
                else if (track.getType() === 'video') state.videoMuted = track.isMuted();
                if (actor && track.isMuted()) {
                    const name = actor.getDisplayName ? actor.getDisplayName() : '';
                    showNotification({ type: 'warning', title: t(track.getType() === 'audio' ? 'notify.mutedRemotelyTitle' : 'notify.videoMutedRemotelyTitle',
                        { participantDisplayName: name || t('notify.somebody') }) });
                }
            }
            render();
        });
        if (C.POLL_RECEIVED) on(C.POLL_RECEIVED, onPollReceived);
        if (C.POLL_ANSWER_RECEIVED) on(C.POLL_ANSWER_RECEIVED, onPollAnswerReceived);
        on(C.MESSAGE_RECEIVED, (id, text, ts, nick) => {
            const local = id === state.localId;
            const p = person(id);
            // A time stamp comes with the room history sent on joining.
            addMessage({ local, from: id, name: local ? displayNameOf(state.local) : (p ? displayNameOf(p) : (nick || t('notify.somebody'))),
                text, ts: ts ? new Date(ts).getTime() || Date.now() : Date.now(), history: !!ts });
        });
        on(C.PRIVATE_MESSAGE_RECEIVED, (id, text, ts) => {
            const p = person(id);
            addMessage({ local: false, from: id, name: p ? displayNameOf(p) : t('notify.somebody'), text,
                ts: ts ? new Date(ts).getTime() || Date.now() : Date.now(), privateFrom: id, history: !!ts });
        });
        on(C.PARTICIPANT_PROPERTY_CHANGED, (participant, name, oldValue, value) => {
            if (name !== 'raisedHand') return;
            const p = state.remotes.get(participant.getId());
            if (!p) return;
            const raised = isRaised(value);
            if (raised && !p.raisedHand) {
                showNotification({ key: 'hand', title: displayNameOf(p), description: t('notify.raisedHand'), timeout: 8000 });
                playSound('raiseHand');
            }
            p.raisedHand = raised;
            render();
        });
        bridgeChannelOpen = false;
        if (C.DATA_CHANNEL_OPENED) on(C.DATA_CHANNEL_OPENED, () => { bridgeChannelOpen = true; if (gecko) log('bridge channel open'); });
        if (C.DATA_CHANNEL_CLOSED) on(C.DATA_CHANNEL_CLOSED, () => { bridgeChannelOpen = false; if (gecko) log('bridge channel closed'); });
        on(C.ENDPOINT_MESSAGE_RECEIVED, (participant, payload) => {
            if (participant && participant.isHidden && participant.isHidden()) onTranscriptionMessage(payload);
            if (payload && payload.name === 'endpoint-reaction' && Array.isArray(payload.reactions)) {
                payload.reactions.forEach(showReaction);
            }
            if (payload && payload.name === ASK_UNMUTE_MESSAGE && participant && participant.isModerator && participant.isModerator()
                    && state.audioMuted) {
                showAskedToUnmute();
            }
            if (payload && payload.name === LOWER_HAND_MESSAGE && participant && participant.isModerator && participant.isModerator()
                    && state.local.raisedHand && !(state.serverConfig && state.serverConfig.disableLowerHandByModerator)) {
                toggleRaiseHand();
            }
            // Another moderator answered a promotion request.
            if (payload && payload.action === 'promotion-response' && payload.approved && state.promotionRequests.has(payload.id)) {
                state.promotionRequests.delete(payload.id);
                showPromotionNotification();
                if (state.screen === 'participants') renderParticipants();
            }
        });
        on(C.CONFERENCE_CREATED_TIMESTAMP, ts => {
            state.startedAt = ts || Date.now();
            render();
        });
        on(C.LOCK_STATE_CHANGED, locked => {
            if (locked && !state.locked && state.joined && !state.roomPassword) showNotification({ title: t('notify.passwordSetRemotely') });
            state.locked = locked;
            if (!locked) state.roomPassword = '';
        });
        on(C.MEMBERS_ONLY_CHANGED, enabled => { state.lobbyEnabled = enabled; });
        on(C.LOBBY_USER_JOINED, (id, name) => {
            state.knocking.set(id, { id, name, tracks: {}, role: 'none' });
            if (isModerator()) {
                playSound('knock');
                showNotification({ key: 'knock-' + id, title: t('lobby.knockTitle'), description: name, timeout: 15000, actions: [
                    { label: t('participantsPane.actions.reject'), onClick: () => rejectKnocking(id) },
                    { label: t('participantsPane.actions.admit'), onClick: () => admitKnocking(id) }
                ] });
            }
            if (state.screen === 'participants') renderParticipants();
        });
        on(C.LOBBY_USER_UPDATED, (id, participant) => {
            const knocker = state.knocking.get(id);
            if (knocker && participant && participant.name) knocker.name = participant.name;
        });
        on(C.LOBBY_USER_LEFT, id => {
            state.knocking.delete(id);
            if (state.screen === 'participants') renderParticipants();
        });
        on(C.BREAKOUT_ROOMS_UPDATED, ({ rooms, roomCounter }) => {
            const collapsed = {};
            Object.values(state.breakoutRooms).forEach(room => { collapsed[room.id] = room.collapsed; });
            state.breakoutRooms = rooms || {};
            Object.values(state.breakoutRooms).forEach(room => { room.collapsed = collapsed[room.id]; });
            if (typeof roomCounter === 'number') state.roomCounter = Math.max(state.roomCounter, roomCounter);
            if (state.screen === 'breakout') renderBreakoutRooms();
            if (state.screen === 'participants') renderParticipants();
            render();
        });
        on(C.BREAKOUT_ROOMS_MOVE_TO_ROOM, roomId => moveToRoom(roomId));
        const Q = JitsiMeetJS.events.connectionQuality;
        on(Q.LOCAL_STATS_UPDATED, stats => { state.localStats = stats; onConnectionStats(state.localId, stats); });
        on(Q.REMOTE_STATS_UPDATED, (id, stats) => { state.remoteStats.set(id, stats); onConnectionStats(id, stats); });
        on(C.METADATA_UPDATED, metadata => {
            onMetadataUpdated(metadata);
            if (state.screen === 'chat') updateChatInput();
            moderationChanged();
        });
        on(C.START_MUTED_POLICY_CHANGED, onStartMutedPolicy);
        on(C.RECORDER_STATE_CHANGED, onRecorderStateChanged);
        on(C.TRACK_AUDIO_LEVEL_CHANGED, onAudioLevel);
        if (C.NON_PARTICIPANT_MESSAGE_RECEIVED) {
            on(C.NON_PARTICIPANT_MESSAGE_RECEIVED, (id, json) => { if (id === 'transcriber') onTranscriptionMessage(json); });
        }
        if (C.TRANSCRIPTION_STATUS_CHANGED) {
            on(C.TRANSCRIPTION_STATUS_CHANGED, status => {
                const statuses = JitsiMeetJS.constants.transcriptionStatus;
                state.transcribing = !!statuses && status === statuses.ON;
                render();
            });
        }
        if (C.VISITORS_MESSAGE) on(C.VISITORS_MESSAGE, onVisitorsMessage);
        if (C.VISITORS_REJECTION) on(C.VISITORS_REJECTION, () => { if (state.local.raisedHand) toggleRaiseHand(); });
        if (C.PROPERTIES_CHANGED) on(C.PROPERTIES_CHANGED, properties => {
            const count = Number(properties && properties['visitor-count']);
            if (!isNaN(count) && count !== state.visitorCount) {
                state.visitorCount = count;
                render();
                if (state.screen === 'participants') renderParticipants();
            }
        });
        on(C.AV_MODERATION_APPROVED, ({ mediaType }) => {
            if (mediaType === 'audio' && state.audioMuted) showAskedToUnmute();
        });
        on(C.AV_MODERATION_CHANGED, ({ enabled, mediaType }) => {
            if (mediaType === 'audio' || mediaType === 'video') state.avModeration[mediaType] = !!enabled;
        });
        on(C.CONNECTION_INTERRUPTED, () => showNotification({ key: 'connection', type: 'warning',
            title: t('dialog.conferenceDisconnectTitle'), description: t('notify.disconnected'), timeout: 10000 }));
        on(C.CONNECTION_RESTORED, () => {
            const node = document.querySelector('[data-key="connection"]');
            if (node) node.remove();
        });
        conference.addCommandListener(FOLLOW_ME_COMMAND, (data, id) => {
            if (state.conference === conference) onFollowMeCommand(data && data.attributes, id);
        });
        conference.addCommandListener(MUTE_REACTIONS_COMMAND, (data, id) => {
            if (state.conference === conference) onMuteReactionsCommand(data && data.attributes, id);
        });
        conference.addCommandListener('avatar-url', (data, id) => {
            const p = state.remotes.get(id);
            if (p && data.value !== p.avatarURL) { p.avatarURL = data.value; p.explicitAvatar = !!data.value; render(); }
        });
        conference.addCommandListener('shared-video', (data, from) => { if (state.conference === conference) onSharedVideoCommand(data, from); });
        conference.addCommandListener('email', (data, id) => {
            const p = state.remotes.get(id);
            if (!p || p.explicitAvatar) return;
            gravatarUrl(data.value).then(url => { if (!p.explicitAvatar && url !== p.avatarURL) { p.avatarURL = url; render(); } });
        });

        conference.setDisplayName(cfg.displayName || '');
        if (cfg.avatarURL) conference.sendCommand('avatar-url', { value: cfg.avatarURL });
        if (cfg.email) conference.sendCommand('email', { value: cfg.email });
        if (state.local.raisedHand) conference.setLocalParticipantProperty('raisedHand', Date.now());
        ['audio', 'video', 'desktop'].forEach(type => {
            if (state.local.tracks[type]) conference.addTrack(state.local.tracks[type]).catch(error => log('addTrack', error));
        });
        showConnecting(t('connectingOverlay.joiningRoom'));
        conference.join(password);
    }

    function onConferenceJoined() {
        const conference = state.conference;
        state.joined = true;
        state.joinedAt = Date.now();
        state.followMeModerator = '';
        if (conference.getStartMutedPolicy && !state.iAmVisitor) applyStartMuted(conference.getStartMutedPolicy());
        if (state.iAmVisitor) setTimeout(onVisitorJoined, 0);
        state.localId = conference.myUserId();
        state.local.id = state.localId;
        state.local.role = conference.isModerator() ? 'moderator' : 'participant';
        state.lobbyEnabled = conference.isMembersOnly ? conference.isMembersOnly() : false;
        state.waiting = null;
        stopWaitForOwner();
        $('waiting').hidden = true;
        hideConnecting();
        closeDialog();
        if (!state.startedAt) state.startedAt = Date.now();
        state.retries = 0;
        const metadata = conference.getMetadataHandler && conference.getMetadataHandler();
        if (metadata && metadata.isSupported()) {
            const whiteboard = (metadata.getMetadata() || {}).whiteboard;
            state.collabDetails = whiteboard && whiteboard.collabDetails || null;
        }
        if (typeof conference.isAVModerationEnabled === 'function') {
            state.avModeration = { audio: !!conference.isAVModerationEnabled('audio'), video: !!conference.isAVModerationEnabled('video') };
        }
        if (state.audioOnly) showExpandedLabel('audio-only');
        notify('joined', { id: state.localId });
        render();
    }

    function onConferenceFailed(error, ...params) {
        const E = JitsiMeetJS.errors.conference;
        log('conference failed', error, params);
        hideConnecting();
        switch (error) {
        case E.MEMBERS_ONLY_ERROR: {
            const waitingForHost = !!params[1];
            showWaiting(waitingForHost);
            state.conference.joinLobby(cfg.displayName || '', cfg.email || '');
            break;
        }
        case E.PASSWORD_REQUIRED:
            passwordDialog({
                title: t('dialog.passwordRequired'),
                text: t('dialog.passwordLabel'),
                error: state.roomPassword ? t('dialog.incorrectRoomLockPassword') : '',
                onSubmit: value => { state.roomPassword = value; showConnecting(t('lobby.joinWithPasswordMessage')); state.conference.join(value); },
                onCancel: () => leave('cancel')
            });
            break;
        case E.AUTHENTICATION_REQUIRED:
            waitForOwner();
            break;
        case E.CONFERENCE_ACCESS_DENIED:
            fatal(t('lobby.joinRejectedTitle'), t('lobby.joinRejectedMessage'));
            break;
        case E.CONFERENCE_DESTROYED:
            fatal(t('dialog.sessTerminated'), params[0] || t('dialog.conferenceReloadTitle'));
            break;
        case E.CONFERENCE_MAX_USERS:
            fatal(t('dialog.maxUsersLimitReachedTitle'), t('dialog.maxUsersLimitReached'));
            break;
        case E.CONNECTION_ERROR:
        case E.FOCUS_DISCONNECTED:
        case E.FOCUS_LEFT:
        case E.ICE_FAILED:
        case E.VIDEOBRIDGE_NOT_AVAILABLE:
            scheduleReconnect();
            break;
        default:
            fatal(t('dialog.conferenceReloadTitle'), String(error));
        }
    }

    function showWaiting(waitingForHost) {
        state.waiting = waitingForHost ? 'host' : 'lobby';
        $('waiting').hidden = false;
        $('waiting-room').textContent = cfg.room;
        const holder = $('waiting-avatar');
        holder.textContent = '';
        holder.appendChild(avatar(state.local));
        $('waiting-title').textContent = waitingForHost ? t('dialog.WaitingForHostTitle') : t('lobby.joiningTitle');
        $('waiting-message').textContent = waitingForHost
            ? (state.serverConfig.tokenAuthUrl ? t('lobby.waitForModerator') : t('dialog.WaitForHostNoAuthMsg'))
            : t('lobby.joiningMessage');
        const panel = document.querySelector('.waiting-panel');
        panel.querySelectorAll('.button').forEach(node => node.remove());
        if (waitingForHost) {
            const iAmHost = el('button', 'button primary wide', t('dialog.IamHost'));
            iAmHost.addEventListener('click', login);
            panel.appendChild(iAmHost);
        }
        if (!waitingForHost) {
            const passwordButton = el('button', 'button secondary wide', t('lobby.enterPasswordButton'));
            passwordButton.addEventListener('click', () => passwordDialog({
                title: t('lobby.enterPasswordTitle'), confirmLabel: t('lobby.passwordJoinButton'),
                onSubmit: value => { state.roomPassword = value; state.conference.join(value); }
            }));
            panel.appendChild(passwordButton);
        }
        const leaveButton = el('button', 'button tertiary wide', t('toolbar.leaveConference'));
        leaveButton.addEventListener('click', () => leave('cancel'));
        panel.appendChild(leaveButton);
    }

    // WAIT_FOR_OWNER of authentication/middleware.any.ts: the join is retried
    // every 5 s (checkIfCanJoin) and WaitForOwnerDialog stays over the
    // conference unless the LoginDialog is open.
    function waitForOwner() {
        clearTimeout(state.waitForOwnerTimer);
        state.waitForOwnerTimer = setTimeout(() => {
            state.waitForOwnerTimer = 0;
            if (state.conference && !state.joined && !state.leaving && !state.upgradeProcess) {
                state.conference.join(state.roomPassword || undefined);
            }
        }, 5000);
        const kind = $('dialog').hidden ? '' : $('dialog').dataset.kind;
        if (kind !== 'login' && kind !== 'waitForOwner') showWaitForOwner();
    }

    function stopWaitForOwner() {
        clearTimeout(state.waitForOwnerTimer);
        state.waitForOwnerTimer = 0;
    }

    // WaitForOwnerDialog.native: Cancel leaves the meeting, "I am the host"
    // opens the sign-in.
    function showWaitForOwner() {
        confirmDialog({
            kind: 'waitForOwner',
            text: t('lobby.waitForModerator'),
            confirmLabel: t('dialog.IamHost'),
            cancelLabel: t('dialog.Cancel'),
            onConfirm: login,
            onCancel: () => { stopWaitForOwner(); leave('cancel'); }
        });
    }

    // _handleLogin: the server's sign-in page when token authentication is
    // configured, otherwise the username/password LoginDialog.
    function login() {
        if (state.serverConfig.tokenAuthUrl) startTokenAuth();
        else loginDialog();
    }

    // toJid of base/connection/functions.ts.
    function toJid(id) {
        const hosts = state.serverConfig.hosts || {};
        return id.indexOf('@') < 0 ? `${id}@${hosts.authdomain || hosts.domain}` : id;
    }

    // LoginDialog.native: username and password; with a conference the role
    // is upgraded (authenticateAndUpgradeRole), otherwise the XMPP
    // connection is opened again with the credentials.
    function loginDialog(options = {}) {
        openDialog(dialog => {
            dialog.dataset.kind = 'login';
            dialog.appendChild(el('div', 'dialog-title', t('dialog.login')));
            const username = el('input', 'field');
            username.type = 'text';
            // Latin layout with @ on the on-screen keyboard.
            username.inputMode = 'email';
            username.autocapitalize = 'none';
            username.autocomplete = 'username';
            username.spellcheck = false;
            username.placeholder = 'user@domain.com';
            username.value = options.username || '';
            const password = el('input', 'field');
            password.type = 'password';
            password.autocomplete = 'current-password';
            password.placeholder = t('dialog.userPassword');
            const message = el('div', 'dialog-text', options.message || '');
            dialog.append(username, password, message);
            const row = dialogActions(dialog, [
                { label: t('dialog.Cancel'), onClick: () => { closeDialog(); cancelLogin(); } },
                { label: t('dialog.Ok'), type: 'primary', onClick: () => submit() }
            ]);
            const ok = row.lastChild;
            password.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });

            function submit() {
                const name = username.value.trim();
                if (!name || ok.disabled) return;
                const id = toJid(name);
                if (!state.conference) {
                    closeDialog();
                    state.credentials = { id, username: name, password: password.value };
                    showConnecting(t('connection.CONNECTING'));
                    connect();
                    return;
                }
                ok.disabled = true;
                message.textContent = t('connection.CONNECTING');
                const process = state.conference.authenticateAndUpgradeRole({
                    id,
                    password: password.value,
                    onLoginSuccessful: () => { message.textContent = t('connection.FETCH_SESSION_ID'); }
                });
                state.upgradeProcess = process;
                process.then(() => {
                    if (state.upgradeProcess !== process) return;
                    state.upgradeProcess = null;
                    state.credentials = { id, username: name, password: password.value };
                    rememberCredentials();
                    if (dialog.dataset.kind === 'login') closeDialog();
                }, error => {
                    if (state.upgradeProcess !== process) return;
                    state.upgradeProcess = null;
                    // The lack of an error signals a cancellation.
                    if (!error) return;
                    log('authenticateAndUpgradeRole failed', JSON.stringify(error));
                    ok.disabled = false;
                    message.textContent = error.authenticationError
                        ? t('dialog.incorrectPassword')
                        : t('dialog.connectErrorWithMsg', { msg: String(error.connectionError || error.message || error.error || '') });
                });
            }
        });
    }

    // CANCEL_LOGIN: back to WaitForOwnerDialog while waiting for the host,
    // out of the meeting when the connection itself needed the login.
    function cancelLogin() {
        const process = state.upgradeProcess;
        state.upgradeProcess = null;
        if (process && process.cancel) process.cancel();
        if (state.waitForOwnerTimer) showWaitForOwner();
        else if (!state.conference && !state.joined) leave('cancel');
    }

    function tokenAuthUrl() {
        const url = state.serverConfig.tokenAuthUrl;
        const room = cfg.room;
        const authState = { room, roomSafe: backendSafeRoomName(room), tenant: '' };
        if (state.audioMuted) authState['config.startWithAudioMuted'] = true;
        if (state.videoMuted) authState['config.startWithVideoMuted'] = true;
        authState['config.prejoinConfig.enabled'] = false;
        return url.replace('{state}', encodeURIComponent(JSON.stringify(authState))).replace('{room}', room);
    }

    function startTokenAuth() {
        closeDialog();
        notify('authRequired', { url: tokenAuthUrl() });
    }

    // Called by QML once the sign-in page has redirected back with #jwt=.
    async function setToken(jwt) {
        if (!jwt) return;
        state.jwt = jwt;
        notify('token', { jwt });
        showConnecting(t('connectingOverlay.joiningRoom'));
        await disconnect(true);
        connect();
    }

    async function disconnect(keepTracks) {
        const conference = state.conference;
        const connection = state.connection;
        state.conference = null;
        state.connection = null;
        state.joined = false;
        if (conference) {
            try { await conference.leave(); } catch (error) { /* already gone */ }
        }
        if (connection) {
            try { connection.disconnect(); } catch (error) { /* already gone */ }
        }
        state.remotes.forEach(p => { if (p.tracks.audio && p.tracks.audio._sink) p.tracks.audio._sink.remove(); });
        state.remotes.clear();
        if (!keepTracks) {
            Object.values(state.local.tracks).forEach(track => track && track.dispose());
            state.local.tracks = {};
        }
    }

    function onTrackAdded(track) {
        if (track.isLocal()) return;
        const id = track.getParticipantId();
        const p = state.remotes.get(id);
        if (!p) return;
        const type = track.getType();
        if (type === 'video' && p.tracks.video && p.tracks.video !== track && track.getVideoType && track.getVideoType() !== 'desktop'
            && p.tracks.video.getVideoType && p.tracks.video.getVideoType() === 'desktop') {
            // Keep a running screen share on stage; the camera joins later.
            p.cameraTrack = track;
        } else {
            p.tracks[type] = track;
        }
        if (type === 'audio') {
            const sink = el('audio');
            sink.autoplay = true;
            track.attach(sink);
            track._sink = sink;
            if (state.volumes.has(p.id)) sink.volume = state.volumes.get(p.id);
            $('audio-sink').appendChild(sink);
            sink.play().catch(() => {});
        }
        render();
    }

    function onTrackRemoved(track) {
        if (track.isLocal()) return;
        const p = state.remotes.get(track.getParticipantId());
        if (!p) return;
        const type = track.getType();
        if (track._sink) { track.detach(track._sink); track._sink.remove(); }
        if (p.tracks[type] === track) {
            p.tracks[type] = p.cameraTrack && type === 'video' ? p.cameraTrack : undefined;
            p.cameraTrack = undefined;
        } else if (p.cameraTrack === track) p.cameraTrack = undefined;
        render();
    }

    async function leave(reason) {
        if (state.leaving && reason !== 'kicked') { finish(reason); return; }
        state.leaving = true;
        showConnecting('');
        await disconnect(false);
        finish(reason);
    }

    function finish(reason) {
        notify('left', { reason });
    }

    function endForAll() {
        if (state.conference && typeof state.conference.end === 'function') state.conference.end();
        leave('hangup');
    }

    function fatal(title, text) {
        hideConnecting();
        state.leaving = true;
        confirmDialog({ title, text, cancelLabel: null, onConfirm: () => leave('error') });
    }

    // ------------------------------------------------------------------ boot

    function bindStatic() {
        $('tb-camera').addEventListener('click', switchCamera);
        $('tb-participants').addEventListener('click', () => openScreen('participants'));
        $('sheet-backdrop').addEventListener('click', closeSheet);
        $('chat-tabs').querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
            state.chatTab = tab.dataset.tab;
            $('chat-input').blur();
            renderChatTabs();
            render();
        }));
        $('poll-create').addEventListener('click', openPollCreate);
        $('insecure-label').addEventListener('click', event => { event.stopPropagation(); showExpandedLabel('insecure'); });
        $('audio-only-label').addEventListener('click', event => { event.stopPropagation(); showExpandedLabel('audio-only'); });
        $('live-label').addEventListener('click', event => { event.stopPropagation(); showExpandedLabel('live'); });
        $('rec-label').addEventListener('click', event => { event.stopPropagation(); showExpandedLabel('recording'); });
        $('tr-label').addEventListener('click', event => { event.stopPropagation(); showExpandedLabel('transcribing'); });
        $('cc-toggle').addEventListener('click', () => setSubtitlesRequested(!state.subtitlesRequested));
        $('stream-start').addEventListener('click', startLiveStream);
        $('expanded-label').addEventListener('click', event => { if (event.target.tagName !== 'A') $('expanded-label').hidden = true; });
        document.addEventListener('click', event => {
            const target = event.target.closest('[data-action]');
            if (!target) return;
            switch (target.dataset.action) {
            case 'close-screen': closeScreen(); break;
            case 'invite': invite(); break;
            case 'clear-recipient': state.privateRecipient = null; renderChat(); break;
            case 'mute-all': muteAll(); break;
            case 'moderation-menu': openModerationMenu(); break;
            case 'breakout-rooms': openScreen('breakout'); break;
            }
        });
        let gifTimer = 0;
        $('gif-search').addEventListener('input', event => {
            clearTimeout(gifTimer);
            gifTimer = setTimeout(() => loadGifs(event.target.value.trim()), 400);
        });
        const search = $('participants-search');
        search.placeholder = t('participantsPane.search');
        search.addEventListener('input', () => { state.participantFilter = search.value; renderParticipants(); });
        const input = $('chat-input');
        input.placeholder = t('chat.fieldPlaceHolder');
        // The smileys panel of jitsi-meet (chat/smileys.ts): a tap puts the
        // emoji where the cursor is; the panel stays open.
        const SMILEYS = ['🙂', '🙁', '😄', '👍', '😛', '👋', '😊', '😂', '😲', '😘', '👎', '🔎', '❤️', '😳',
            '😠', '😇', '🤒', '😢', '💣', '⏰', '😎', '😕', '😉', '🍺', '🍰', '🎉', '👏', '🙏', '🔥', '✅'];
        const smileys = $('chat-smileys');
        SMILEYS.forEach(emoji => {
            const button = el('button', 'smiley', emoji);
            button.type = 'button';
            button.addEventListener('click', () => {
                const start = input.selectionStart != null ? input.selectionStart : input.value.length;
                const end = input.selectionEnd != null ? input.selectionEnd : start;
                input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
                input.selectionStart = input.selectionEnd = start + emoji.length;
                $('chat-send').disabled = !input.value.trim();
            });
            smileys.appendChild(button);
        });
        $('chat-smiley').addEventListener('click', () => {
            smileys.hidden = !smileys.hidden;
            $('chat-smiley').classList.toggle('active', !smileys.hidden);
            if (!smileys.hidden) input.blur();
        });
        const chatSearch = $('chat-search');
        chatSearch.placeholder = t('speakerStats.search');
        chatSearch.addEventListener('input', () => { state.chatFilter = chatSearch.value; renderChat(); });
        $('chat-to').addEventListener('click', openRecipientPicker);
        input.addEventListener('input', () => { $('chat-send').disabled = !input.value.trim(); });
        $('chat-form').addEventListener('submit', event => {
            event.preventDefault();
            sendChat(input.value);
            input.value = '';
            $('chat-smileys').hidden = true;
            $('chat-smiley').classList.remove('active');
            $('chat-send').disabled = true;
        });
        // The meeting is opened from QML, so the page may start without a user
        // gesture and Chromium can hold back remote audio until the first touch.
        document.addEventListener('pointerdown', () => {
            document.querySelectorAll('#audio-sink audio').forEach(sink => { if (sink.paused) sink.play().catch(() => {}); });
        }, true);
        window.addEventListener('resize', render);
        window.addEventListener('pagehide', () => { if (!state.leaving) disconnect(false); });
        setInterval(tick, 1000);
    }

    async function boot() {
        await loadStrings();
        translateStatic(document);
        setupIcons(document);
        bindStatic();
        render();
        loadServer();
    }

    // config.js and lib-jitsi-meet come from the Jitsi server; when it cannot
    // be reached the reload dialog counts down to the next attempt.
    async function loadServer() {
        showConnecting(t('connectingOverlay.joiningRoom'));
        try {
            await loadScript(cfg.server + '/config.js');
            state.serverConfig = Object.assign({}, window.config || {});
            // The deployment as configured, before any visitor redirect.
            state.baseConfig = JSON.parse(JSON.stringify(state.serverConfig));
            if (!window.JitsiMeetJS) await loadScript(cfg.server + '/libs/lib-jitsi-meet.min.js', 60000);
        } catch (error) {
            log('server unavailable', error.message);
            if (!state.leaving) scheduleReconnect(loadServer);
            return;
        }
        if (state.leaving) return;
        JitsiMeetJS.init(Object.assign({}, state.serverConfig, { enableAnalyticsLogging: false, disableThirdPartyRequests: true }));
        JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.WARN);
        const wanted = [];
        if (!state.audioMuted) wanted.push('audio');
        if (!state.videoMuted && !state.audioOnly) wanted.push('video');
        else state.videoMuted = true;
        for (const type of wanted) {
            try {
                // Gecko 78 (Aurora OS 5.1) can leave the request unanswered;
                // the meeting is joined without the device then.
                state.local.tracks[type] = await Promise.race([
                    createTrack(type),
                    new Promise((resolve, reject) => setTimeout(() => reject(new Error('no answer in 30 s')), 30000))
                ]);
            } catch (error) {
                log('local track', type, error);
                if (type === 'audio') state.audioMuted = true;
                else state.videoMuted = true;
            }
        }
        render();
        connect();
    }

    window.auroraCall = {
        setToken,
        setModeration,
        hangup: () => leave('hangup'),
        toggleAudio: () => { if (!state.iAmVisitor) toggleAudio(); },
        whiteboardClosed: () => { state.whiteboardOpen = false; },
        back: () => {
            if (!$('dialog').hidden) { closeDialog(); return true; }
            if (!$('sheet').hidden) { closeSheet(); return true; }
            if (state.screen) { closeScreen(); return true; }
            return false;
        }
    };

    boot();
}());
