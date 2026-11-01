import QtQuick 2.6
import Sailfish.Silica 1.0
import Sailfish.Share 1.0
import ru.auroraos.WebView 1.0
import ru.auroraos.WebView.Global 1.0
import "../components"

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
        if (page.returnPage) pageStack.pop(page.returnPage)
        else pageStack.pop()
    }

    function callJs(code) {
        webView.runJavaScript("window.auroraCall && " + code, function(result) {}, function(error) {})
    }

    Component.onDestruction: {
        appState.finishMeeting()
        if (previousPage) previousPage.resetPreview()
    }

    Connections {
        target: PermissionHandler
        onMediaAccessRequested: {
            var trusted = appState.isTrustedOrigin(mediaAccessRequest.requestingOrigin)
            // Kept in the call log to see what the WebView asks for screen capture.
            appState.appendCallLog("media access " + JSON.stringify(mediaAccessRequest.requestedPermissions)
                                   + (trusted ? " accepted" : " denied"))
            if (trusted) mediaAccessRequest.accept()
            else mediaAccessRequest.deny()
        }
        onPermissionsRequested: {
            var allowed = appState.isTrustedOrigin(permissionRequest.requestingOrigin)
            var permissions = permissionRequest.requestedPermissions
            for (var i = 0; i < permissions.length; i++) {
                if (permissions[i] !== Permissions.CEF_PERMISSION_TYPE_CAMERA_STREAM
                        && permissions[i] !== Permissions.CEF_PERMISSION_TYPE_MIC_STREAM) allowed = false
            }
            if (allowed) permissionRequest.accept()
            else permissionRequest.deny()
        }
    }

    Connections {
        target: appState
        onConferenceEvent: {
            switch (name) {
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
                pageStack.push(Qt.resolvedUrl("OrganizerLoginPage.qml"), {
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
            case "moderation":
                page.moderation = data.state || null
                break
            case "reactionsMuted":
                page.reactionsMuted = data.value
                break
            case "preference":
                appState.setPreference(data.key, data.value)
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

    WebView {
        id: webView
        anchors.fill: parent
        url: appState.meetingUrl
        TouchInput { enabled: true }
        KeyboardInput { enabled: true }
        onLoadError: {
            if (errorCode !== -3) page.close()
        }
    }
}
