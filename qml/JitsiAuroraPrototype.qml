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
    Timer {
        id: languageRefresh
        interval: 0
        onTriggered: pageStack.replace(Qt.resolvedUrl("pages/MainPage.qml"), {selectedTab:2}, PageStackAction.Immediate)
    }
}
