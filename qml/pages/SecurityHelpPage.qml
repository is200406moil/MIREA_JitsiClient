import QtQuick 2.6
import Sailfish.Silica 1.0
import ru.auroraos.WebView 1.0
import "../components"

// A Jitsi web page (security recommendations, help, terms, privacy) opened
// inside the application, since Aurora may have no browser installed.
Page {
    id: page
    allowedOrientations: Orientation.All
    property string address: "https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi"
    property string title: appState.t("security.title")

    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    PageHeader {
        id: header
        title: page.title
        closeIcon: true
        onBackClicked: pageStack.pop()
    }
    WebView {
        anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
        url: page.address
        TouchInput { enabled: true }
        KeyboardInput { enabled: true }
    }
}
