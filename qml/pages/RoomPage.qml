import QtQuick 2.6
import Sailfish.Silica 1.0
import Sailfish.Share 1.0
import Nemo.KeepAlive 1.2
import "../components"
import "../webview"

// Hosts the call screen (qml/call), which is a lib-jitsi-meet client served
// by AppState on 127.0.0.1. This page only provides system integration:
// media permissions, sharing, organizer sign-in and leaving the meeting.
Page {
    id: page
    objectName: "roomPage"
    allowedOrientations: Orientation.All
    backNavigation: false
    property string roomName
    property string serverAddress
    property bool initialAudioMuted: false
    property bool initialVideoMuted: false
    property bool leaving: false
    property var previousPage
    property var returnPage
    // ModeratorSection state from the call page, null when not a moderator.
    property var moderation: null
    // The moderator muted the reaction sounds for everyone.
    property bool reactionsMuted: false
    // From the call page: the microphone and the meeting start, shown on the
    // application cover and controlled from it and from the notification.
    property bool callAudioMuted: initialAudioMuted
    property bool callCanUnmute: true
    property double callStartedAt: 0
    property string inviteLink: page.serverAddress.replace(/\/$/, "") + "/" + encodeURIComponent(page.roomName)

    ShareAction {
        id: inviteAction
        mimeType: "text/plain"
        title: appState.t("toolbar.invite")
        resources: [{"data": page.inviteLink, "name": "Jitsi Meet"}]
    }

    function close() {
        if (leaving) return
        leaving = true
        if (__silica_applicationwindow_instance.activeMeeting === page)
            __silica_applicationwindow_instance.activeMeeting = null
        removeNotifications()
        if (page.returnPage) pageStack.pop(page.returnPage)
        else pageStack.pop()
    }

    // The meeting goes on with the screen locked or the application in the
    // background: the system is kept from suspending while the page exists,
    // and an ongoing notification (CallControl) stays in the notification
    // area until the meeting ends. Tapping it brings the meeting back, its
    // buttons switch the microphone and leave.
    KeepAlive {
        enabled: !page.leaving
    }

    Connections {
        target: callControl
        onActivateRequested: __silica_applicationwindow_instance.activate()
        onToggleAudioRequested: page.toggleAudio()
        onHangupRequested: page.hangup()
    }

    Component.onCompleted: {
        __silica_applicationwindow_instance.activeMeeting = page
        callControl.showNotification(appState.t("calendarSync.ongoingMeeting"), notificationBody(),
                                     notificationMuteLabel(), appState.t("toolbar.hangup"))
    }

    // AudioMuteButton of the mobile client: "Unmute microphone" while muted,
    // "Mute microphone" otherwise; the text under the room also says the
    // microphone is off.
    function notificationMuteLabel() {
        return appState.t(page.callAudioMuted ? "toolbar.unmute" : "toolbar.mute")
    }

    function notificationBody() {
        return page.callAudioMuted ? page.roomName + "
" + appState.t("videothumbnail.muted") : page.roomName
    }

    onCallAudioMutedChanged: if (!page.leaving) callControl.updateNotification(notificationBody(), notificationMuteLabel())

    function removeNotifications() {
        callControl.hideNotification()
    }

    function toggleAudio() {
        if (callCanUnmute) callJs("window.auroraCall.toggleAudio()")
    }

    function hangup() {
        callJs("window.auroraCall.hangup()")
    }

    function callJs(code) {
        webView.runJs("window.auroraCall && " + code)
    }

    Component.onDestruction: {
        if (__silica_applicationwindow_instance.activeMeeting === page)
            __silica_applicationwindow_instance.activeMeeting = null
        leaving = true
        removeNotifications()
        appState.finishMeeting()
        if (typeof nativeCamera !== "undefined") nativeCamera.stop()
        if (previousPage) previousPage.resetPreview()
    }

    Connections {
        target: appState
        onConferenceEvent: {
            switch (name) {
            case "cameraFacing":
                webView.cameraFacing = data.facing
                break
            case "nativeCamera":
                if (typeof nativeCamera === "undefined") break
                if (!data.active) {
                    nativeCamera.stop()
                    break
                }
                // Another camera: the Camera is made again for it.
                if (nativeCamera.active && nativeCamera.facing !== data.facing) nativeCamera.stop()
                nativeCamera.facing = data.facing
                if (data.maxHeight) nativeCamera.maxHeight = data.maxHeight
                nativeCamera.start()
                break
            case "invite":
                appState.copyText(page.inviteLink)
                inviteAction.trigger()
                break
            case "copy":
                appState.copyText(data.text)
                break
            case "openUrl":
                pageStack.push(Qt.resolvedUrl("SecurityHelpPage.qml"), {address: data.url})
                break
            case "authRequired":
                pageStack.push(Qt.resolvedUrl("../webview/OrganizerLoginPage.qml"), {
                    address: data.url, serverAddress: page.serverAddress, roomPage: page
                })
                break
            case "openWhiteboard":
                if (!page.whiteboardPage) {
                    page.whiteboardPage = pageStack.push(Qt.resolvedUrl("WhiteboardPage.qml"), {
                        address: data.url, title: data.title, closeLabel: data.closeLabel, roomPage: page
                    })
                }
                break
            case "openSettings":
                page.moderation = data.moderation || null
                pageStack.push(Qt.resolvedUrl("MeetingSettingsPage.qml"), {title: data.title, roomPage: page})
                break
            case "callState":
                page.callAudioMuted = !!data.audioMuted
                page.callCanUnmute = !!data.canUnmute
                page.callStartedAt = data.startedAt || 0
                break
            case "moderation":
                page.moderation = data.state || null
                break
            case "reactionsMuted":
                page.reactionsMuted = data.value
                break
            case "preference":
                appState.setPreference(data.key, data.value)
                break
            case "screenShare":
                if (!data.active) {
                    if (page.screenShareAlert) page.screenShareAlert.destroy()
                    page.screenShareAlert = null
                } else if (appState.screenShareWaiting() && !page.screenShareAlert) {
                    page.screenShareAlert = screenShareAlertComponent.createObject(alertRoot, {
                        title: appState.screenShareTitle(), text: appState.screenShareText()
                    })
                }
                break
            case "closeWhiteboard":
                if (page.whiteboardPage) pageStack.pop(page)
                break
            case "left":
                page.close()
                break
            }
        }
    }

    property var whiteboardPage: null
    property var screenShareAlert: null

    // The sizes of AlertDialog are in the units of the other screens.
    Item {
        id: alertRoot
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        z: 1000
    }

    Component {
        id: screenShareAlertComponent
        AlertDialog {
            onAccepted: {
                page.screenShareAlert = null
                appState.answerScreenShare(true)
            }
            onDismissed: {
                page.screenShareAlert = null
                appState.answerScreenShare(false)
            }
        }
    }

    // Called by WhiteboardPage when it is closed.
    function whiteboardClosed() {
        whiteboardPage = null
        callJs("window.auroraCall.whiteboardClosed()")
    }

    // Called by OrganizerLoginPage when the sign-in page returns a token.
    function setModeration(key, value) {
        callJs("window.auroraCall.setModeration(" + JSON.stringify(key) + "," + (value ? "true" : "false") + ")")
    }

    function setToken(jwt) {
        callJs("window.auroraCall.setToken(" + JSON.stringify(jwt) + ")")
    }

    Rectangle { anchors.fill: parent; color: "#040404" }

    // The camera of the meeting on Aurora OS 5.1, under the meeting view.
    Loader {
        active: typeof nativeCamera !== "undefined" && nativeCamera.active
        sourceComponent: NativeCameraSource { pageOrientation: page.orientation }
    }

    CallWebView {
        id: webView
        anchors.fill: parent
        url: appState.meetingUrl
        shown: page.status === PageStatus.Active || page.status === PageStatus.Activating
        onLoadFailed: page.close()
    }
}
