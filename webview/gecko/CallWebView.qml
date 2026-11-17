import QtQuick 2.6
import Sailfish.WebView 1.0

// The meeting page (Aurora OS 5.1: the Gecko based Sailfish WebView).
// RawWebView, not WebView: WebView answers camera and microphone requests with
// its own dialog, the meeting page gets them from the application instead.
// Gecko asks with the embed:webrtcrequest message (EmbedLiteWebrtcUI); the
// answer goes back as embedui:webrtcresponse. Only the meeting page served by
// AppState on 127.0.0.1 gets the camera and the microphone.
RawWebView {
    id: view

    signal loadFailed()

    function runJs(code) {
        view.runJavaScript(code)
    }

    // False while another page (organizer sign-in, whiteboard, help) is on
    // top: Gecko draws only the active view. The meeting goes on either way,
    // also with the application in the background.
    property bool shown: true
    active: shown

    // "user" or "environment", told by the meeting page before it asks for
    // the camera (cameraFacing event).
    property string cameraFacing: "user"

    // Gecko offers the screen as a camera too ("Screen primary"); the first
    // device is not the camera then. The front or the rear camera is chosen
    // by its name, the screen never.
    function deviceChoice(type, names) {
        if (type !== "camera") return 0
        var wanted = view.cameraFacing === "environment" ? /rear|back|main/i : /front|selfie/i
        var fallback = -1
        for (var i = 0; i < names.length; i++) {
            if (/screen/i.test(names[i])) continue
            if (wanted.test(names[i])) return i
            if (fallback < 0) fallback = i
        }
        return fallback
    }

    Component.onCompleted: view.addMessageListener("embed:webrtcrequest")

    onRecvAsyncMessage: {
        if (message !== "embed:webrtcrequest") return
        var request = typeof data === "string" ? JSON.parse(data) : data
        var trusted = request.origin === "127.0.0.1"
        var choices = {}
        for (var type in request.devices) choices[type] = view.deviceChoice(type, request.devices[type])
        appState.appendCallLog("media access " + JSON.stringify(request.devices) + " " + JSON.stringify(choices)
                               + (trusted ? " accepted" : " denied"))
        view.sendAsyncMessage("embedui:webrtcresponse", {
            "id": request.id,
            "allow": trusted,
            "checkedDontAsk": false,
            "choices": choices
        })
    }
}
