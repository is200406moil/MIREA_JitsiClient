const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(require('node:path').join(__dirname, '../qml/web/conference.html'), 'utf8');
const config = { server: 'https://meet.example.org', room: 'Team meeting', displayName: 'Алексей', email: '', avatarURL: '', audioMuted: true, videoMuted: false,
    preferences: {language: 'en', hideSelfView: true, lowBandwidth: true, disableP2p: true, chatNotifications: false,
        soundReactions: false, soundMessage: false, soundJoined: false, soundLeft: false, soundTalkMuted: false, soundLobby: false} };
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('__MEETING_CONFIG__', JSON.stringify(config));
const events = [], commands = [], commandArguments = [], listeners = {};
const status = { style: {}, textContent: '' };
const meetingClasses = new Set();
const meeting = { classList: { add: value => meetingClasses.add(value), remove: value => meetingClasses.delete(value) } };
let script, options, disposed = false;
function API(domain, opts) {
    assert.equal(domain, 'meet.example.org');
    options = opts;
    this.addListener = (name, fn) => { listeners[name] = fn; };
    this.executeCommand = (name, ...args) => { commands.push(name); commandArguments.push(args); };
    this.getAvailableDevices = () => Promise.resolve({ audioInput: [{}, {}], videoInput: [] });
    this.dispose = () => { disposed = true; };
}
const context = {
    URL, Set, console, JitsiMeetExternalAPI: API,
    fetch: (_, request) => { events.push(JSON.parse(request.body)); return Promise.resolve(); },
    document: { getElementById: id => id === 'status' ? status : meeting, createElement: () => ({}), head: { appendChild: el => { script = el; } } },
    window: { addEventListener: (name, callback) => { if (name === 'pagehide') context.onHide = callback; } }
};
vm.runInNewContext(source, context);
assert.equal(script.src, 'https://meet.example.org/external_api.js');
script.onload();
options.onload();
assert.equal(options.userInfo.displayName, 'Алексей');
assert.equal(options.configOverwrite.disableDeepLinking, true);
assert.equal(options.configOverwrite.prejoinConfig.enabled, false);
assert.equal(options.configOverwrite.startWithAudioMuted, true);
assert.equal(options.configOverwrite.toolbarButtons.length, 0);
assert.equal(options.lang, 'en');
assert.equal(options.configOverwrite.disableSelfView, true);
assert.equal(options.configOverwrite.p2p.enabled, false);
assert.equal(options.configOverwrite.analytics.disabled, true);
assert.deepEqual(Array.from(options.configOverwrite.disabledSounds).sort(), ['INCOMING_MSG_SOUND', 'KNOCKING_PARTICIPANT_SOUND', 'PARTICIPANT_JOINED_SOUND', 'PARTICIPANT_LEFT_SOUND', 'REACTION_SOUND', 'TALK_WHILE_MUTED_SOUND']);
assert.deepEqual(Array.from(options.configOverwrite.disabledNotifications), ['notify.chatMessages']);
assert.equal(events[0].name, 'apiReady');
listeners.videoConferenceJoined({ id: 'self', roomName: 'Team meeting' });
assert.equal(commands[0], 'setLowBandwidthMode');
assert.deepEqual(commandArguments[0], [true]);
listeners.participantJoined({ id: 'other' });
assert.equal(events.at(-1).name, 'participantJoined');
assert.equal(events.filter(event => event.name === 'participantCount').at(-1).data.count, 2);
listeners.participantLeft({ id: 'other' });
assert.equal(events.at(-1).name, 'participantLeft');
assert.equal(events.filter(event => event.name === 'participantCount').at(-1).data.count, 1);
listeners.incomingMessage({ nick: 'Другой', message: 'Привет' });
assert.equal(events.at(-1).data.message, 'Привет');
assert.equal(context.window.auroraMeeting.sendChatMessage('Ответ'), true);
assert.equal(commands.at(-1), 'sendChatMessage');
assert.deepEqual(commandArguments.at(-1), ['Ответ']);
listeners.outgoingMessage({ message: 'Ответ' });
assert.equal(events.at(-1).name, 'outgoingMessage');
listeners.audioMuteStatusChanged({ muted: false });
assert.equal(events.at(-1).data.muted, false);
assert.equal(context.window.auroraMeeting.command('toggleAudio'), true);
assert.equal(context.window.auroraMeeting.command('unsupported'), false);
assert.deepEqual(commands, ['setLowBandwidthMode', 'sendChatMessage', 'toggleAudio']);
assert.equal(context.window.auroraMeeting.command('toggleParticipantsPane'), true);
assert.deepEqual(commandArguments.at(-1), [true]);
assert.equal(context.window.auroraMeeting.command('toggleParticipantsPane'), true);
assert.deepEqual(commandArguments.at(-1), [false]);
assert.equal(context.window.auroraMeeting.openWhiteboard(), true);
assert.equal(meetingClasses.has('whiteboard'), true);
assert.deepEqual(commands.slice(-2), ['toggleFilmStrip', 'toggleWhiteboard']);
assert.deepEqual(commandArguments.at(-1), [true]);
listeners.whiteboardStatusChanged({ status: 'SHOWN' });
assert.equal(events.at(-1).name, 'whiteboardStatusChanged');
assert.equal(context.window.auroraMeeting.closeWhiteboard(), true);
assert.equal(meetingClasses.has('whiteboard'), false);
assert.deepEqual(commands.slice(-2), ['toggleWhiteboard', 'toggleFilmStrip']);
assert.deepEqual(commandArguments.at(-2), [false]);
listeners.filmstripDisplayChanged({ visible: false });
assert.equal(context.window.auroraMeeting.openWhiteboard(), true);
assert.equal(commands.at(-1), 'toggleWhiteboard', 'already hidden filmstrip stays hidden');
assert.equal(context.window.auroraMeeting.closeWhiteboard(), true);
assert.equal(commands.at(-1), 'toggleWhiteboard', 'user-hidden filmstrip stays hidden after closing');
listeners.videoConferenceLeft();
assert.equal(events.at(-1).data.count, 0);
context.onHide();
assert.equal(disposed, true);
delete config.preferences;
vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('__MEETING_CONFIG__', JSON.stringify(config)), context);
script.onload();
assert.equal(options.lang, 'ru');
assert.equal(options.configOverwrite.p2p, undefined, 'retain server P2P policy by default');
assert.equal(options.configOverwrite.disabledSounds.length, 0);
Promise.resolve().then(() => {
    const inventory = events.find(event => event.name === 'deviceInventory');
    assert.equal(inventory.data.audioInput, 2);
    assert.equal(inventory.data.videoInput, 0);
    assert.deepEqual(Object.keys(inventory.data).sort(), ['audioInput', 'videoInput']);
    console.log('PASS: Jitsi configuration, native bridge events, device inventory, participant count, commands, disposal');
});
