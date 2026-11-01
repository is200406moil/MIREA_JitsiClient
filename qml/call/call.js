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

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load ' + src));
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
        audioOnly: !!prefs.lowBandwidth,
        facingMode: 'user',
        audioMuted: !!cfg.audioMuted,
        videoMuted: !!cfg.videoMuted,
        startedAt: 0,
        messages: [],
        unread: 0,
        privateRecipient: null,
        knocking: new Map(),
        lobbyEnabled: false,
        locked: false,
        roomPassword: '',
        screen: '',
        waiting: null
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
        if (!track || track.isMuted() || (state.audioOnly && !p.local)) return null;
        return track;
    }

    // A view is the DOM of one participant inside one container (stage,
    // filmstrip or tile grid). It keeps its <video> and re-attaches only when
    // the participant's track actually changes.
    function updateView(view, p, options) {
        view.dataset.id = p.id;
        const track = videoTrackOf(p);
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
            video.classList.toggle('mirror', p.local && state.facingMode === 'user' && track.getVideoType() !== 'desktop');
        } else if (video) {
            if (video._track) video._track.detach(video);
            video.remove();
        }
        let holder = view.querySelector('.avatar-holder');
        if (!track) {
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
            reconcile($('stage'), [stageParticipant()], 'participant', { onClick: toggleToolbox });
            const thumbs = state.remotes.size ? [...state.remotes.values()] : [];
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
        try { conference.setReceiverConstraints(value); } catch (error) { console.warn('receiver constraints', error); }
    }

    function renderTitlebar() {
        $('titlebar').classList.toggle('hidden', !state.toolboxVisible);
        $('room-name').textContent = cfg.room;
        $('room-timer').hidden = !state.startedAt;
        $('insecure-label').hidden = !cfg.insecureRoomName;
        const count = state.remotes.size + 1;
        $('participants-count').hidden = !state.joined;
        $('participants-count').textContent = count;
        $('tb-camera').hidden = state.videoMuted || !state.local.tracks.video;
    }

    function tick() {
        if (state.startedAt) $('room-timer').textContent = formatDuration(Date.now() - state.startedAt);
    }

    // NATIVE_THRESHOLDS from react/features/toolbox/constants.ts, without the
    // screen sharing button which Aurora does not provide.
    function mainButtons() {
        const width = window.innerWidth;
        if (width >= 500) return ['microphone', 'camera', 'chat', 'raisehand', 'tileview', 'overflowmenu', 'hangup'];
        if (width >= 440) return ['microphone', 'camera', 'chat', 'raisehand', 'overflowmenu', 'hangup'];
        if (width >= 380) return ['microphone', 'camera', 'chat', 'overflowmenu', 'hangup'];
        return ['microphone', 'camera', 'overflowmenu', 'hangup'];
    }

    const buttons = {
        microphone: () => ({ icon: state.audioMuted ? 'mic-slash' : 'mic', label: t('toolbar.mute'), action: toggleAudio }),
        camera: () => ({ icon: state.videoMuted ? 'video-off' : 'video', label: t('toolbar.videomute'), action: toggleVideo }),
        chat: () => ({ icon: 'message', label: t('toolbar.chat'), action: () => openScreen('chat'), dot: state.unread > 0 }),
        raisehand: () => ({ icon: 'raise-hand', label: t(state.local.raisedHand ? 'toolbar.lowerYourHand' : 'toolbar.raiseYourHand'),
            action: toggleRaiseHand, toggled: state.local.raisedHand }),
        tileview: () => ({ icon: 'tile-view', label: t('toolbar.tileViewToggle'), action: toggleTileView, toggled: state.tileView }),
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

    function togglePin(id) {
        if (id === state.localId || id === 'local') return;
        state.pinnedId = state.pinnedId === id ? '' : id;
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

    const REACTIONS = {
        like: '👍', clap: '👏', laugh: '😀', surprised: '😮', boo: '🙁', silence: '😶'
    };

    function openOverflowMenu() {
        const main = mainButtons();
        openSheet(sheet => {
            sheetItem(sheet, 'performance', t(state.audioOnly ? 'toolbar.lowBandwidthModeOff' : 'lowBandwidthMode.lowBandwidthMode'), toggleAudioOnly);
            sheetItem(sheet, state.locked || state.lobbyEnabled ? 'security-on' : 'security-off', t('toolbar.security'), openSecurityDialog);
            sheet.appendChild(el('div', 'sheet-divider'));
            if (!main.includes('chat')) sheetItem(sheet, 'message', t('chat.title'), () => openScreen('chat'));
            sheetItem(sheet, 'users', t('toolbar.participants'), () => openScreen('participants'));
            if (!main.includes('tileview')) sheetItem(sheet, 'tile-view', t('toolbar.tileViewToggle'), toggleTileView);
            sheetItem(sheet, 'share', t('toolbar.shareRoom'), invite);
            // Reaction menu footer, as in the mobile overflow menu.
            sheet.appendChild(el('div', 'sheet-divider'));
            const row = el('div', 'reactions-row');
            Object.keys(REACTIONS).forEach(key => {
                const button = el('button', 'reaction-button', REACTIONS[key]);
                button.addEventListener('click', () => sendReaction(key));
                row.appendChild(button);
            });
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

    function openScreen(name) {
        closeSheet();
        state.screen = name;
        $('chat').hidden = name !== 'chat';
        $('participants').hidden = name !== 'participants';
        if (name === 'chat') {
            state.unread = 0;
            renderChat();
            render();
        }
        if (name === 'participants') renderParticipants();
    }

    function closeScreen() {
        state.screen = '';
        $('chat').hidden = true;
        $('participants').hidden = true;
        $('chat-input').blur();
        render();
    }

    // ------------------------------------------------------------------- chat

    function renderChat() {
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
            bubble.appendChild(document.createTextNode(message.text));
            stack.appendChild(bubble);
            stack.appendChild(el('div', 'message-time', formatTime(message.ts)));
        });
        list.scrollTop = list.scrollHeight;
        const recipient = state.privateRecipient && person(state.privateRecipient);
        $('chat-recipient').hidden = !recipient;
        if (recipient) $('chat-recipient-text').textContent = t('chat.messageTo', { recipient: displayNameOf(recipient) });
    }

    function addMessage(message) {
        state.messages.push(message);
        if (state.screen === 'chat') renderChat();
        else if (!message.local) {
            state.unread++;
            if (prefs.chatNotifications !== false) {
                showNotification({ title: message.name, description: message.text, onClick: () => openScreen('chat') });
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
        details.appendChild(el('div', 'name', displayNameOf(p) + (p.local ? ` (${t('localRecording.me')})` : '')));
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
        const sorted = [state.local, ...[...state.remotes.values()].sort((a, b) =>
            (isRaised(b.raisedHand) - isRaised(a.raisedHand)) || displayNameOf(a).localeCompare(displayNameOf(b)))];
        sorted.forEach(p => list.appendChild(participantItem(p, {})));
        $('participants-footer').hidden = !isModerator();
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
            sheetItem(sheet, state.pinnedId === p.id ? 'pinned' : 'pin', t(state.pinnedId === p.id ? 'videothumbnail.unpinFromStage' : 'videothumbnail.pinToStage'), () => {
                state.pinnedId = state.pinnedId === p.id ? '' : p.id;
                if (state.tileView) state.tileView = false;
                closeScreen();
                render();
            });
        });
    }

    function openModerationMenu() {
        openSheet(sheet => {
            sheetItem(sheet, 'video-off', t('participantsPane.actions.stopEveryonesVideo'), () => state.conference.muteParticipant
                && [...state.remotes.keys()].forEach(id => state.conference.muteParticipant(id, 'video')));
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
                }).catch(error => console.warn('lobby toggle', error));
            });
            lobbyRow.appendChild(lobbySwitch);
            dialog.appendChild(lobbyRow);
            dialog.appendChild(el('div', 'sheet-divider'));
            dialog.appendChild(el('div', 'dialog-text', t('security.about')));
            if (state.locked) {
                const row = el('div', 'switch-row');
                row.appendChild(el('span', '', `${t('lockRoomPasswordUppercase')}: ${state.roomPassword || '••••'}`));
                if (moderator) {
                    const remove = el('button', 'button tertiary small', t('dialog.removePassword'));
                    remove.addEventListener('click', () => { state.conference.lock('').then(() => { state.locked = false; state.roomPassword = ''; openSecurityDialog(); }); });
                    row.appendChild(remove);
                }
                dialog.appendChild(row);
            } else if (moderator) {
                const input = el('input', 'field');
                input.placeholder = t('lockRoomPasswordUppercase');
                dialog.appendChild(input);
                const add = el('button', 'button primary wide', t('dialog.Ok'));
                add.disabled = true;
                input.addEventListener('input', () => { add.disabled = !input.value; });
                add.addEventListener('click', () => {
                    const value = input.value;
                    state.conference.lock(value).then(() => {
                        state.locked = true;
                        state.roomPassword = value;
                        openSecurityDialog();
                    }).catch(() => showNotification({ type: 'error', title: t('dialog.lockTitle'), description: t('dialog.lockMessage') }));
                });
                dialog.appendChild(add);
            }
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
        if (enabled && !state.videoMuted && state.local.tracks.video) {
            state.local.tracks.video.mute();
            state.videoMuted = true;
        }
        render();
    }

    function toggleAudioOnly() { setAudioOnly(!state.audioOnly); }

    function toggleTileView() {
        state.tileView = !state.tileView;
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

    function showReaction(key) {
        const emoji = REACTIONS[key];
        if (!emoji) return;
        const node = el('div', 'flying-reaction', emoji);
        node.style.left = (20 + Math.random() * 60) + '%';
        $('reactions-layer').appendChild(node);
        setTimeout(() => node.remove(), 4000);
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
            if (state.connection !== connection) return;
            console.warn('connection failed', error, message);
            if (error === JitsiMeetJS.errors.connection.PASSWORD_REQUIRED) {
                showWaitForOwner(true);
                return;
            }
            fatal(t('dialog.conferenceReloadTitle'), message || error);
        });
        connection.addEventListener(E.CONNECTION_DISCONNECTED, () => {
            if (state.connection === connection && !state.leaving) console.info('connection closed');
        });
        connection.connect();
    }

    function joinConference(password) {
        const config = state.serverConfig;
        const C = JitsiMeetJS.events.conference;
        const options = Object.assign({}, config, {
            confID: `${new URL(cfg.server).host}/${backendSafeRoomName(cfg.room)}`,
            statisticsDisplayName: cfg.displayName
        });
        if (prefs.disableP2p) options.p2p = Object.assign({}, config.p2p, { enabled: false });
        const conference = state.connection.initJitsiConference(backendSafeRoomName(cfg.room), options);
        state.conference = conference;

        conference.on(C.CONFERENCE_JOINED, onConferenceJoined);
        conference.on(C.CONFERENCE_FAILED, onConferenceFailed);
        conference.on(C.CONFERENCE_ERROR, error => console.warn('conference error', error));
        conference.on(C.CONFERENCE_LEFT, () => { if (!state.leaving) leave('left'); });
        conference.on(C.KICKED, (actor, reason) => {
            const name = actor && actor.getDisplayName ? actor.getDisplayName() : '';
            state.leaving = true;
            confirmDialog({ title: t('dialog.kickTitle', { participantDisplayName: name || t('notify.somebody') }),
                text: reason || t('dialog.kickMessage', { participantDisplayName: name || t('notify.somebody') }),
                cancelLabel: null, onConfirm: () => finish('kicked') });
        });
        conference.on(C.USER_JOINED, (id, participant) => {
            const p = {
                id, name: participant.getDisplayName(), role: participant.getRole(), tracks: {},
                raisedHand: isRaised(participant.getProperty && participant.getProperty('raisedHand')), avatarURL: ''
            };
            state.remotes.set(id, p);
            if (state.joined && !participant.isHidden()) {
                showNotification({ key: 'joined', title: t('notify.connectedOneMember', { name: displayNameOf(p) }) });
            }
            render();
        });
        conference.on(C.USER_LEFT, id => {
            const p = state.remotes.get(id);
            if (!p) return;
            state.remotes.delete(id);
            if (state.pinnedId === id) state.pinnedId = '';
            if (state.dominantId === id) state.dominantId = '';
            if (p.tracks.audio && p.tracks.audio._sink) p.tracks.audio._sink.remove();
            showNotification({ key: 'left', title: t('notify.leftOneMember', { name: displayNameOf(p) }) });
            render();
        });
        conference.on(C.DISPLAY_NAME_CHANGED, (id, name) => {
            const p = person(id);
            if (p && !p.local) { p.name = name; render(); }
        });
        conference.on(C.USER_ROLE_CHANGED, (id, role) => {
            if (id === state.localId) {
                const was = state.local.role;
                state.local.role = role;
                if (role === 'moderator' && was !== 'moderator' && state.joined) showNotification({ title: t('notify.moderator') });
            } else if (state.remotes.has(id)) state.remotes.get(id).role = role;
            render();
        });
        conference.on(C.DOMINANT_SPEAKER_CHANGED, id => {
            state.dominantId = id;
            render();
        });
        conference.on(C.TRACK_ADDED, onTrackAdded);
        conference.on(C.TRACK_REMOVED, onTrackRemoved);
        conference.on(C.TRACK_MUTE_CHANGED, (track, actor) => {
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
        conference.on(C.MESSAGE_RECEIVED, (id, text, ts, nick) => {
            const local = id === state.localId;
            const p = person(id);
            addMessage({ local, from: id, name: local ? displayNameOf(state.local) : (p ? displayNameOf(p) : (nick || t('notify.somebody'))),
                text, ts: ts ? new Date(ts).getTime() || Date.now() : Date.now() });
        });
        conference.on(C.PRIVATE_MESSAGE_RECEIVED, (id, text, ts) => {
            const p = person(id);
            addMessage({ local: false, from: id, name: p ? displayNameOf(p) : t('notify.somebody'), text,
                ts: ts ? new Date(ts).getTime() || Date.now() : Date.now(), privateFrom: id });
        });
        conference.on(C.PARTICIPANT_PROPERTY_CHANGED, (participant, name, oldValue, value) => {
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
        conference.on(C.ENDPOINT_MESSAGE_RECEIVED, (participant, payload) => {
            if (payload && payload.name === 'endpoint-reaction' && Array.isArray(payload.reactions)) {
                payload.reactions.forEach(showReaction);
            }
        });
        conference.on(C.CONFERENCE_CREATED_TIMESTAMP, ts => {
            state.startedAt = ts || Date.now();
            render();
        });
        conference.on(C.LOCK_STATE_CHANGED, locked => {
            if (locked && !state.locked && state.joined && !state.roomPassword) showNotification({ title: t('notify.passwordSetRemotely') });
            state.locked = locked;
            if (!locked) state.roomPassword = '';
        });
        conference.on(C.MEMBERS_ONLY_CHANGED, enabled => { state.lobbyEnabled = enabled; });
        conference.on(C.LOBBY_USER_JOINED, (id, name) => {
            state.knocking.set(id, { id, name, tracks: {}, role: 'none' });
            if (isModerator()) {
                showNotification({ key: 'knock-' + id, title: t('lobby.knockTitle'), description: name, timeout: 15000, actions: [
                    { label: t('participantsPane.actions.reject'), onClick: () => rejectKnocking(id) },
                    { label: t('participantsPane.actions.admit'), onClick: () => admitKnocking(id) }
                ] });
            }
            if (state.screen === 'participants') renderParticipants();
        });
        conference.on(C.LOBBY_USER_UPDATED, (id, participant) => {
            const knocker = state.knocking.get(id);
            if (knocker && participant && participant.name) knocker.name = participant.name;
        });
        conference.on(C.LOBBY_USER_LEFT, id => {
            state.knocking.delete(id);
            if (state.screen === 'participants') renderParticipants();
        });
        conference.on(C.CONNECTION_INTERRUPTED, () => showNotification({ key: 'connection', type: 'warning',
            title: t('dialog.conferenceDisconnectTitle'), description: t('notify.disconnected'), timeout: 10000 }));
        conference.on(C.CONNECTION_RESTORED, () => {
            const node = document.querySelector('[data-key="connection"]');
            if (node) node.remove();
        });
        conference.addCommandListener('avatar-url', (data, id) => {
            const p = state.remotes.get(id);
            if (p && data.value !== p.avatarURL) { p.avatarURL = data.value; p.explicitAvatar = !!data.value; render(); }
        });
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
            if (state.local.tracks[type]) conference.addTrack(state.local.tracks[type]).catch(error => console.warn('addTrack', error));
        });
        showConnecting(t('connectingOverlay.joiningRoom'));
        conference.join(password);
    }

    function onConferenceJoined() {
        const conference = state.conference;
        state.joined = true;
        state.localId = conference.myUserId();
        state.local.id = state.localId;
        state.local.role = conference.isModerator() ? 'moderator' : 'participant';
        state.lobbyEnabled = conference.isMembersOnly ? conference.isMembersOnly() : false;
        state.waiting = null;
        $('waiting').hidden = true;
        hideConnecting();
        closeDialog();
        if (!state.startedAt) state.startedAt = Date.now();
        notify('joined', { id: state.localId });
        render();
    }

    function onConferenceFailed(error, ...params) {
        const E = JitsiMeetJS.errors.conference;
        console.warn('conference failed', error, params);
        hideConnecting();
        switch (error) {
        case E.MEMBERS_ONLY_ERROR: {
            const waitingForHost = !!params[1];
            showWaiting(waitingForHost);
            if (waitingForHost && state.serverConfig.tokenAuthUrl && !state.jwt) showWaitForOwner(false);
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
            showWaiting(true);
            showWaitForOwner(false);
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
        if (waitingForHost && state.serverConfig.tokenAuthUrl) {
            const login = el('button', 'button primary wide', t('dialog.IamHost'));
            login.addEventListener('click', startTokenAuth);
            panel.appendChild(login);
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

    // Mirrors WaitForOwnerDialog.native: "I am the host" or keep waiting.
    function showWaitForOwner(connectionLevel) {
        if (!state.serverConfig.tokenAuthUrl) {
            if (connectionLevel) fatal(t('dialog.conferenceReloadTitle'), t('dialog.WaitForHostNoAuthMsg'));
            return;
        }
        if (connectionLevel) showWaiting(true);
        confirmDialog({
            title: t('dialog.WaitingForHostTitle'),
            text: t('lobby.waitForModerator'),
            confirmLabel: t('dialog.IamHost'),
            cancelLabel: t('dialog.WaitingForHostButton'),
            onConfirm: startTokenAuth
        });
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
        $('insecure-label').addEventListener('click', event => {
            event.stopPropagation();
            const label = $('expanded-label');
            if (!label.hidden) { label.hidden = true; return; }
            label.textContent = '';
            // getUnsafeRoomText(): the web string carries the localized "here" link.
            const text = t('security.insecureRoomNameWarningWeb', { recommendAction: t('security.unsafeRoomActions.meeting') });
            const match = text.match(/^([\s\S]*?)<a[^>]*>([\s\S]*?)<\/a>([\s\S]*)$/);
            label.appendChild(document.createTextNode(match ? match[1] : text));
            const link = el('a', '', match ? match[2] : '');
            link.href = '#';
            link.addEventListener('click', e => { e.preventDefault(); notify('openUrl', { url: cfg.securityHelpUrl }); });
            label.appendChild(link);
            if (match) label.appendChild(document.createTextNode(match[3]));
            label.hidden = false;
        });
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
            }
        });
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
        showConnecting(t('connectingOverlay.joiningRoom'));
        render();
        try {
            await loadScript(cfg.server + '/config.js');
            state.serverConfig = Object.assign({}, window.config || {});
            await loadScript(cfg.server + '/libs/lib-jitsi-meet.min.js');
        } catch (error) {
            fatal(t('dialog.serviceUnavailable'), t('dialog.conferenceReloadTitle'));
            return;
        }
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
                console.warn('local track', type, error);
                if (type === 'audio') state.audioMuted = true;
                else state.videoMuted = true;
            }
        }
        render();
        connect();
    }

    window.auroraCall = {
        setToken,
        hangup: () => leave('hangup'),
        back: () => {
            if (!$('dialog').hidden) { closeDialog(); return true; }
            if (!$('sheet').hidden) { closeSheet(); return true; }
            if (state.screen) { closeScreen(); return true; }
            return false;
        }
    };

    boot();
}());
