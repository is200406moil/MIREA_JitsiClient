import QtQuick 2.0
import Sailfish.Silica 1.0

ApplicationWindow {
    objectName: "applicationWindow"
    initialPage: Qt.resolvedUrl("pages/MainPage.qml")
    cover: Qt.resolvedUrl("cover/DefaultCoverPage.qml")
    allowedOrientations: defaultAllowedOrientations
    Connections {
        target: appState
        onInterfaceLanguageChanged: languageRefresh.restart()
    }
    // The strings of the pages are bound once, so the pages are created again
    // in the new language. The language page is still being popped when the
    // language changes; a busy page stack ignores the replacement.
    Timer {
        id: languageRefresh
        interval: 50
        onTriggered: {
            if (pageStack.busy) {
                restart()
                return
            }
            pageStack.replaceAbove(null, Qt.resolvedUrl("pages/MainPage.qml"), {selectedTab: 2}, PageStackAction.Immediate)
        }
    }
}
