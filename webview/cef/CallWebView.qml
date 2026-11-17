import QtQuick 2.6
import ru.auroraos.WebView 1.0
import ru.auroraos.WebView.Global 1.0

// The meeting page (Aurora OS 5.2 and later: the Chromium based Aurora
// WebView). Camera and microphone are given only to the meeting page served
// by AppState; other pages opened inside the application get nothing.
WebView {
    id: view

    signal loadFailed()

    // Used by the Gecko variant only (see webview/gecko/CallWebView.qml).
    property bool shown: true
    property string cameraFacing: "user"

    function runJs(code) {
        view.runJavaScript(code, function(result) {}, function(error) {})
    }

    TouchInput { enabled: true }
    KeyboardInput { enabled: true }
    onLoadError: {
        if (errorCode !== -3) view.loadFailed()
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
}
