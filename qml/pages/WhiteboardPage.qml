import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"
import "../webview"

// The Jitsi whiteboard: the server's static/whiteboard.html opened with the
// collaboration session of the meeting, as the mobile client does.
Page {
    id: page
    allowedOrientations: Orientation.All
    property string address
    property string title
    property string closeLabel
    property var roomPage

    Component.onDestruction: if (roomPage) roomPage.whiteboardClosed()

    Rectangle { anchors.fill: parent; color: AppStyle.background }

    PageHeader {
        id: header
        title: page.title
        closeIcon: true
        onBackClicked: pageStack.pop()
    }

    AppWebView {
        anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
        url: page.address
    }
}
