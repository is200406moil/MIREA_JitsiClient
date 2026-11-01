import QtQuick 2.6
import Sailfish.Silica 1.0
import ru.auroraos.WebView 1.0
import "../components"

// DialInSummary.native: the server's static/dialInInfo.html for the room in
// a web view; tel: links go to the phone application.
Page {
    id: page
    allowedOrientations: Orientation.All
    property var room
    readonly property string address: room
        ? room.server.replace(/\/$/, "") + "/static/dialInInfo.html?room=" + encodeURIComponent(room.name) : ""

    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    PageHeader {
        id: header
        title: appState.t("dialIn.screenTitle")
        closeIcon: true
        onBackClicked: pageStack.pop()
    }
    WebView {
        anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
        url: page.address
        TouchInput { enabled: true }
        onUrlChanged: {
            var target = String(url)
            if (target.indexOf("tel:") === 0) {
                Qt.openUrlExternally(target)
                url = page.address
            }
        }
    }
}
