import QtQuick 2.6
import ru.auroraos.WebView 1.0

// A web page inside the application (Aurora OS 5.2 and later: the Chromium
// based Aurora WebView).
WebView {
    id: view

    // The page to open (see webview/gecko/AppWebView.qml).
    property string startUrl
    // Used by the Gecko variant only; Chromium runs the pages as they are.
    property bool modernCodePatch: false

    TouchInput { enabled: true }
    KeyboardInput { enabled: true }
    Component.onCompleted: if (view.startUrl) view.url = view.startUrl
}
