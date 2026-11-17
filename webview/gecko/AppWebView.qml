import QtQuick 2.6
import Sailfish.WebView 1.0

// A web page inside the application (Aurora OS 5.1: the Gecko based
// Sailfish WebView).
WebView {
    id: view

    // The page to open; set here instead of url so that the scripts below
    // are in place before it loads.
    property string startUrl
    // Pages made for newer browsers (the Jitsi whiteboard): newer built-in
    // functions are added and script chunks the Firefox 78 engine cannot
    // parse are rewritten (qml/call/legacy), by a frame script that runs
    // when the page's window is created.
    property bool modernCodePatch: false

    function readText(path, done) {
        var request = new XMLHttpRequest()
        request.onreadystatechange = function() {
            if (request.readyState === XMLHttpRequest.DONE) done(request.responseText || "")
        }
        request.open("GET", Qt.resolvedUrl(path))
        request.send()
    }

    function openStartUrl() {
        if (view.startUrl && String(view.url) !== view.startUrl) view.url = view.startUrl
    }

    onViewInitialized: {
        if (!view.modernCodePatch) {
            view.openStartUrl()
            return
        }
        var files = ["../call/legacy/acorn.js", "../call/legacy/downgrade.js", "../call/legacy/modern-code.js"]
        var texts = []
        var next = function() {
            if (texts.length < files.length) {
                view.readText(files[texts.length], function(text) {
                    texts.push(text)
                    next()
                })
                return
            }
            var payload = texts.join("\n;\n")
            // The page opens when the frame script answers, so that it is in
            // place before the page's window is created.
            var lines = [
                "var auroraPayload = " + JSON.stringify(payload) + ";",
                "function auroraAdd(event) {",
                "  var doc = event.target;",
                "  if (!doc || !doc.documentElement || !doc.defaultView) return;",
                "  var win = doc.defaultView;",
                "  if (win.top !== win || String(win.location).indexOf('http') !== 0) return;",
                "  if (doc.documentElement.hasAttribute('data-aurora-modern-code')) return;",
                "  doc.documentElement.setAttribute('data-aurora-modern-code', '1');",
                "  try {",
                "    var script = doc.createElement('script');",
                "    script.textContent = auroraPayload;",
                "    (doc.head || doc.documentElement).insertBefore(script, (doc.head || doc.documentElement).firstChild);",
                "    sendAsyncMessage('aurora:modernCode', { text: event.type + ': added to ' + String(win.location).split('#')[0] });",
                "  } catch (error) {",
                "    sendAsyncMessage('aurora:modernCode', { text: event.type + ': failed: ' + error });",
                "  }",
                "}",
                // The page's own listener of DOMContentLoaded opens the
                // editor; this one (capturing, above the page) runs first.
                "addEventListener('DOMContentLoaded', auroraAdd, true);",
                "sendAsyncMessage('aurora:modernCode', { ready: true, text: 'frame script loaded' });"
            ]
            view.addMessageListener("aurora:modernCode")
            view.loadFrameScript("data:application/javascript;charset=utf-8," + encodeURIComponent(lines.join("\n")))
            // Opened anyway if no answer comes.
            fallbackOpen.start()
        }
        next()
    }

    Timer {
        id: fallbackOpen
        interval: 3000
        onTriggered: {
            appState.appendCallLog("modern code: no answer from the frame script")
            view.openStartUrl()
        }
    }

    onRecvAsyncMessage: {
        if (message !== "aurora:modernCode") return
        appState.appendCallLog("modern code: " + (data && data.text))
        if (data && data.ready && fallbackOpen.running) {
            fallbackOpen.stop()
            view.openStartUrl()
        }
    }
}
