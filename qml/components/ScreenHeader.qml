import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// Screen header of the Android client (React Navigation): 56 dp, ui01,
// 20 dp medium title, white back arrow or close icon on the left.
Item {
    id: header
    property string title
    property string subtitle
    property bool showBack: false
    property bool closeIcon: false
    signal backClicked()
    width: parent.width
    height: 56

    Rectangle { anchors.fill: parent; color: AppStyle.surface }

    BackgroundItem {
        id: backButton
        visible: header.showBack
        width: 56
        height: 56
        Accessible.role: Accessible.Button
        Accessible.name: appState.t(header.closeIcon ? "dialog.close" : "dialog.Back")
        Icon {
            anchors.centerIn: parent
            width: 24
            height: 24
            source: Qt.resolvedUrl("../icons/" + (header.closeIcon ? "close-large" : "arrow-back") + ".svg")
            color: AppStyle.text
        }
        onClicked: header.backClicked()
    }

    Column {
        anchors.verticalCenter: parent.verticalCenter
        x: header.showBack ? 72 : 16
        width: header.width - x - 16
        Label {
            width: parent.width
            text: header.title
            color: AppStyle.text
            font.pixelSize: 20
            font.weight: Font.Medium
            truncationMode: TruncationMode.Fade
        }
        Label {
            visible: header.subtitle.length > 0
            width: parent.width
            text: header.subtitle
            color: AppStyle.muted
            font.pixelSize: AppStyle.label
            truncationMode: TruncationMode.Fade
        }
    }
}
