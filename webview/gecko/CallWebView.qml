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

    // The meeting goes on with the application in the background.
    active: true

    Component.onCompleted: view.addMessageListener("embed:webrtcrequest")

    onRecvAsyncMessage: {
        if (message !== "embed:webrtcrequest") return
        var request = typeof data === "string" ? JSON.parse(data) : data
        var trusted = request.origin === "127.0.0.1"
        var choices = {}
        for (var type in request.devices) choices[type] = 0
        appState.appendCallLog("media access " + JSON.stringify(request.devices) + (trusted ? " accepted" : " denied"))
        view.sendAsyncMessage("embedui:webrtcresponse", {
            "id": request.id,
            "allow": trusted,
            "checkedDontAsk": false,
            "choices": choices
        })
    }
}
