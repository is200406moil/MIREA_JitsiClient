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
        cameraTrackBeforeShare: null,
        avModeration: { audio: false, video: false },
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
        return id === state.localId || id === 'local' ? state.local : state.remotes.get(id);
    }

    // ------------------------------------------------------------- rendering

    let renderQueued = false;

    function render() {
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
                fillAvatar(node, p);
            }
        } else if (holder) {
            holder.remove();
        }
        if (options.indicators) {
            view.querySelectorAll('.indicators, .top-indicators, .name').forEach(node => node.remove());
            const bottom = el('div', 'indicators');
            const audio = p.tracks.audio;
            if (!audio || audio.isMuted()) {
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
            if (p.raisedHand) {
                const top = el('div', 'top-indicators');
                const hand = el('div', 'indicator hand');
                hand.appendChild(icon('raise-hand', 'small'));
                top.appendChild(hand);
                view.appendChild(top);
            }
            if (options.name) view.appendChild(el('div', 'name', displayNameOf(p)));
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
            layoutTiles(people.length);
            reconcile($('tiles'), people, 'tile participant', { indicators: true, name: true, onClick: toggleToolbox });
        } else {
            reconcile($('tiles'), [], 'tile', {});
            const videoOnStage = !!state.sharedVideo && !state.pinnedId;
            reconcile($('stage'), videoOnStage ? [] : [stageParticipant()], 'participant', { onClick: toggleToolbox });
            const thumbs = state.remotes.size || state.sharedVideo ? [...state.remotes.values()] : [];
            if (thumbs.length && showSelf) thumbs.push(state.local);
            reconcile($('filmstrip'), thumbs, 'thumbnail participant', { indicators: true, onClick: togglePin });
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
                constraints[onStage[0]] = { maxHeight: 720 };
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
        const count = state.remotes.size + 1;
        $('participants-count').hidden = !state.joined;
        $('participants-count').textContent = count;
        $('tb-camera').hidden = state.videoMuted || !state.local.tracks.video;
    }

    function tick() {
        if (state.startedAt) $('room-timer').textContent = formatDuration(Date.now() - state.startedAt);
    }

    // NATIVE_THRESHOLDS from react/features/toolbox/constants.ts. The screen
    // sharing button is shown only where the WebView can capture the screen.
    function mainButtons() {
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
        }
        label.hidden = false;
        expandedTimer = setTimeout(() => { label.hidden = true; }, 5000);
    }

    function togglePin(id) {
        if (id === state.localId || id === 'local') return;
        state.pinnedId = state.pinnedId === id ? '' : id;
        sendFollowMe();
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
        const input = dialog.querySelector('input');
        if (input) setTimeout(() => input.focus(), 50);
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
        let group = null;
        let lastKey = '';
        state.messages.forEach(message => {
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
        if (recipient) $('chat-recipient-text').textContent = t('chat.messageTo', { recipient: displayNameOf(recipient) });
    }

    function addMessage(message) {
        const gifUrl = gifFromMessage(message.text);
        if (gifUrl && !message.privateTo && !message.privateFrom && gifDisplayMode() !== 'chat') showGifOnTile(message.from, gifUrl);
        if (gifUrl && gifDisplayMode() === 'tile') return;
        state.messages.push(message);
        if (!message.local) playSound('message');
        if (state.screen === 'chat' && state.chatTab === 'chat') renderChat();
        else if (!message.local) {
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
        if (!p.local) item.addEventListener('click', () => openParticipantMenu(p.id));
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
        const people = everyone();
        $('participants-heading').textContent = t('participantsPane.headings.participantsList', { count: people.length });
        const list = $('participants-list');
        list.textContent = '';
        const filter = state.participantFilter.trim().toLowerCase();
        const sorted = [state.local, ...[...state.remotes.values()].sort((a, b) =>
            (isRaised(b.raisedHand) - isRaised(a.raisedHand)) || displayNameOf(a).localeCompare(displayNameOf(b)))];
        sorted.filter(p => !filter || displayNameOf(p).toLowerCase().includes(filter))
            .forEach(p => list.appendChild(participantItem(p, {})));
        $('participants-footer').hidden = !isModerator();
        $('breakout-button').hidden = !breakoutRoomsVisible();
    }

    function openParticipantMenu(id) {
        const p = person(id);
        if (!p) return;
        const moderator = isModerator();
        openSheet(sheet => {
            const title = el('div', 'sheet-title');
            title.appendChild(avatar(p));
            title.lastChild.style.cssText = 'width:32px;height:32px;font-size:13px';
            title.appendChild(el('span', '', displayNameOf(p)));
            sheet.appendChild(title);
            if (moderator && p.tracks.audio && !p.tracks.audio.isMuted()) {
                sheetItem(sheet, 'mic-slash', t('participantsPane.actions.mute'), () => state.conference.muteParticipant(p.id, 'audio'));
            }
            if (moderator && p.tracks.video && !p.tracks.video.isMuted()) {
                sheetItem(sheet, 'video-off', t('participantsPane.actions.stopVideo'), () => state.conference.muteParticipant(p.id, 'video'));
            }
            if (moderator) {
                sheetItem(sheet, 'user-deleted', t('videothumbnail.kick'), () => confirmDialog({
                    title: t('dialog.kickParticipantTitle'), confirmLabel: t('dialog.kickParticipantButton'), danger: true,
                    onConfirm: () => state.conference.kickParticipant(p.id)
                }), 'danger');
            }
            sheetItem(sheet, 'message', t('toolbar.privateMessage'), () => startPrivateChat(p.id));
            const rooms = Object.values(state.breakoutRooms);
            if (moderator && rooms.length > 1) {
                sheet.appendChild(el('div', 'sheet-divider'));
                sheet.appendChild(el('div', 'sheet-title', t('breakoutRooms.actions.sendToBreakoutRoom')));
                rooms.filter(room => room.id !== currentRoomId()).forEach(room => {
                    sheetItem(sheet, null, room.isMainRoom ? t('breakoutRooms.mainRoom') : room.name, () => sendParticipantToRoom(p.id, room.id));
                });
            }
            sheetItem(sheet, state.pinnedId === p.id ? 'pinned' : 'pin', t(state.pinnedId === p.id ? 'videothumbnail.unpinFromStage' : 'videothumbnail.pinToStage'), () => {
                state.pinnedId = state.pinnedId === p.id ? '' : p.id;
                if (state.tileView) state.tileView = false;
                sendFollowMe();
                closeScreen();
                render();
            });
        });
    }

    // ContextMenuMore.native: stop everyone's video and, where the server
    // supports it, whether non-moderators may unmute themselves.
    function openModerationMenu() {
        const conference = state.conference;
        openSheet(sheet => {
            sheetItem(sheet, 'video-off', t('participantsPane.actions.stopEveryonesVideo'),
                () => [...state.remotes.keys()].forEach(id => conference.muteParticipant(id, 'video')));
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

    function muteAll() {
        confirmDialog({
            title: t('dialog.muteEveryoneTitle'), text: t('dialog.muteEveryoneDialog'), confirmLabel: t('dialog.muteParticipantButton'),
            onConfirm: () => [...state.remotes.keys()].forEach(id => state.conference.muteParticipant(id, 'audio'))
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
                setTimeout(() => input.focus(), 50);
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

    async function createTrack(type) {
        const options = { devices: [type] };
        if (type === 'video') {
            options.facingMode = state.facingMode;
            options.constraints = { video: { height: { ideal: 720, max: 720, min: 180 }, width: { ideal: 1280, max: 1280, min: 320 } } };
        }
        const tracks = await JitsiMeetJS.createLocalTracks(options);
        return tracks.find(track => track.getType() === type) || null;
    }

    async function setLocalTrack(type, track) {
        const old = state.local.tracks[type];
        if (state.conference) {
            if (old) await state.conference.replaceTrack(old, track);
            else if (track) await state.conference.addTrack(track);
        }
        if (old && old !== track) old.dispose();
        state.local.tracks[type] = track || undefined;
        render();
    }

    let mediaBusy = false;

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

    function toggleRaiseHand() {
        state.local.raisedHand = !state.local.raisedHand;
        if (state.conference) state.conference.setLocalParticipantProperty('raisedHand', state.local.raisedHand ? Date.now() : 0);
        render();
    }

    function sendReaction(key) {
        closeSheet();
        showReaction(key);
        if (state.conference && state.joined) {
            state.conference.sendEndpointMessage('', { name: 'endpoint-reaction', reactions: [key], timestamp: Date.now() });
        }
    }

    const SOUNDS = {
        joined: ['joined', 'soundJoined'], left: ['left', 'soundLeft'],
        message: ['incomingMessage', 'soundMessage'], knock: ['knock', 'soundLobby'],
        like: ['reactions-thumbs-up', 'soundReactions'], clap: ['reactions-applause', 'soundReactions'],
        laugh: ['reactions-laughter', 'soundReactions'], surprised: ['reactions-surprise', 'soundReactions'],
        boo: ['reactions-boo', 'soundReactions'], silence: ['reactions-crickets', 'soundReactions'],
        love: ['reactions-love', 'soundReactions']
    };
    const soundCache = new Map();

    function playSound(key) {
        const sound = SOUNDS[key];
        if (!sound || prefs[sound[1]] === false) return;
        let audio = soundCache.get(key);
        if (!audio) {
            audio = new Audio(`${new URL(cfg.server).origin}/sounds/${sound[0]}.mp3`);
            soundCache.set(key, audio);
        }
        audio.currentTime = 0;
        audio.play().catch(() => {});
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
        return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
    }

    async function toggleScreenShare() {
        if (mediaBusy || !state.conference) return;
        mediaBusy = true;
        try {
            if (state.screenSharing) {
                await stopScreenShare();
            } else {
                let tracks;
                try {
                    tracks = await JitsiMeetJS.createLocalTracks({ devices: ['desktop'] });
                } catch (error) {
                    log('screen share with audio', error);
                    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                    tracks = await Promise.resolve(JitsiMeetJS.createLocalTracksFromMediaStreams([{
                        stream, sourceType: 'screen', mediaType: 'video', videoType: 'desktop'
                    }]));
                }
                const desktop = tracks.find(track => track.getType() === 'video');
                tracks.filter(track => track !== desktop).forEach(track => track.dispose());
                if (!desktop) throw new Error('No screen track');
                const camera = state.local.tracks.video;
                state.cameraTrackBeforeShare = camera && !camera.isMuted() ? 'on' : 'off';
                desktop.on(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED, () => { if (state.screenSharing) stopScreenShare(); });
                await setLocalTrack('video', desktop);
                state.screenSharing = true;
                state.videoMuted = false;
            }
        } catch (error) {
            log('screen share', error);
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
        let camera = null;
        if (state.cameraTrackBeforeShare === 'on' && !state.audioOnly) {
            try { camera = await createTrack('video'); } catch (error) { log('camera after share', error); }
        }
        await setLocalTrack('video', camera);
        state.videoMuted = !camera;
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

    function roomPermissions() {
        const handler = roomMetadata();
        return (handler && handler.getMetadata().permissions) || {};
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
            showChat: !!handler && !!config.showChatPermissionsModeratorSetting && !handler.getMetadata().allownersEnabled
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
            const inputs = $('polls-list').querySelectorAll('.poll-create-fields input');
            const last = inputs[inputs.length - 1];
            if (last) last.focus();
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
        if (!draft.question) setTimeout(() => questionField.input.focus(), 50);
    }

    function openPollCreate() {
        state.pollDraft = { pollId: '', question: '', answers: ['', ''], singleAnswer: false };
        renderPolls();
    }

    // Chat and Polls tabs (ChatAndPollsNavigator): shown when the server
    // has the polls component.
    function renderChatTabs() {
        const polls = !!pollsHandler() && !state.serverConfig.disablePolls;
        if (!polls) state.chatTab = 'chat';
        $('chat-tabs').hidden = !polls;
        $('chat-pane').hidden = state.chatTab !== 'chat';
        $('polls-pane').hidden = state.chatTab !== 'polls';
        $('chat').querySelector('h1').textContent = t('chat.title');
        $('chat-tabs').querySelectorAll('[data-tab]').forEach(tab => {
            const active = tab.dataset.tab === state.chatTab;
            tab.classList.toggle('active', active);
            const count = tab.dataset.tab === 'chat' ? state.unread : state.pollsUnread;
            tab.textContent = t(`chat.tabs.${tab.dataset.tab}`) + (count && !active ? ` (${count})` : '');
        });
        if (state.chatTab === 'polls') { state.pollsUnread = 0; renderPolls(); }
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
            .map(([, p]) => p);
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
                    const item = el('div', 'participant-item breakout-participant');
                    item.appendChild(avatar({ name: p.displayName }));
                    const details = el('div', 'details');
                    details.appendChild(el('div', 'name', p.displayName || t('notify.somebody')));
                    if (p.role === 'moderator') details.appendChild(el('div', 'role', t('videothumbnail.moderator')));
                    item.appendChild(details);
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
                { label: t('dialog.Cancel'), onClick: () => { clearInterval(reconnectTimer); closeDialog(); leave('cancel'); } },
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

    function connect() {
        const E = JitsiMeetJS.events.connection;
        const connection = new JitsiMeetJS.JitsiConnection(null, state.jwt || null, connectionOptions());
        state.connection = connection;
        connection.addEventListener(E.CONNECTION_ESTABLISHED, () => {
            if (state.connection === connection) joinConference();
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
                    // LoginDialog: the credentials the user typed were refused.
                    const username = state.credentials.username;
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
        connection.addEventListener(E.CONNECTION_DISCONNECTED, () => {
            if (state.connection === connection && !state.leaving) log('connection closed');
        });
        connection.connect(state.credentials ? { id: state.credentials.id, password: state.credentials.password } : undefined);
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
        on(C.CONFERENCE_LEFT, () => { if (!state.leaving) leave('left'); });
        on(C.KICKED, (actor, reason) => {
            const name = actor && actor.getDisplayName ? actor.getDisplayName() : '';
            state.leaving = true;
            confirmDialog({ title: t('dialog.kickTitle', { participantDisplayName: name || t('notify.somebody') }),
                text: reason || t('dialog.kickMessage', { participantDisplayName: name || t('notify.somebody') }),
                cancelLabel: null, onConfirm: () => finish('kicked') });
        });
        on(C.USER_JOINED, (id, participant) => {
            const p = {
                id, name: participant.getDisplayName(), role: participant.getRole(), tracks: {},
                raisedHand: isRaised(participant.getProperty && participant.getProperty('raisedHand')), avatarURL: ''
            };
            state.remotes.set(id, p);
            if (state.joined && !participant.isHidden()) {
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
            addMessage({ local, from: id, name: local ? displayNameOf(state.local) : (p ? displayNameOf(p) : (nick || t('notify.somebody'))),
                text, ts: ts ? new Date(ts).getTime() || Date.now() : Date.now() });
        });
        on(C.PRIVATE_MESSAGE_RECEIVED, (id, text, ts) => {
            const p = person(id);
            addMessage({ local: false, from: id, name: p ? displayNameOf(p) : t('notify.somebody'), text,
                ts: ts ? new Date(ts).getTime() || Date.now() : Date.now(), privateFrom: id });
        });
        on(C.PARTICIPANT_PROPERTY_CHANGED, (participant, name, oldValue, value) => {
            if (name !== 'raisedHand') return;
            const p = state.remotes.get(participant.getId());
            if (!p) return;
            const raised = isRaised(value);
            if (raised && !p.raisedHand) {
                showNotification({ key: 'hand', title: displayNameOf(p), description: t('notify.raisedHand'), timeout: 8000 });
            }
            p.raisedHand = raised;
            render();
        });
        on(C.ENDPOINT_MESSAGE_RECEIVED, (participant, payload) => {
            if (payload && payload.name === 'endpoint-reaction' && Array.isArray(payload.reactions)) {
                payload.reactions.forEach(showReaction);
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
        on(C.METADATA_UPDATED, metadata => {
            onMetadataUpdated(metadata);
            if (state.screen === 'chat') updateChatInput();
            moderationChanged();
        });
        on(C.START_MUTED_POLICY_CHANGED, onStartMutedPolicy);
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
        ['audio', 'video'].forEach(type => {
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
        if (conference.getStartMutedPolicy) applyStartMuted(conference.getStartMutedPolicy());
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
            username.addEventListener('keydown', event => { if (event.key === 'Enter') password.focus(); });

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
        input.addEventListener('input', () => { $('chat-send').disabled = !input.value.trim(); });
        $('chat-form').addEventListener('submit', event => {
            event.preventDefault();
            sendChat(input.value);
            input.value = '';
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
                state.local.tracks[type] = await createTrack(type);
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
