import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Item {
    id: header
    property string title
    property string subtitle
    property bool showBack: false
    signal backClicked()
    width: parent.width
    height: Math.max(56, titles.height + 20)
    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    BackgroundItem {
        id: backButton
        visible: header.showBack
        width: 56
        height: parent.height
        Accessible.role: Accessible.Button
        Accessible.name: qsTr("Назад")
        Icon {
            anchors.centerIn: parent
            width: 24
            height: width
            source: Qt.resolvedUrl("../icons/arrow-back.svg")
            color: AppStyle.accent
        }
        onClicked: header.backClicked()
    }
    Column {
        id: titles
        anchors.verticalCenter: parent.verticalCenter
        x: header.showBack ? backButton.width : 16
        width: header.width - 2 * x
        spacing: 2
        Label {
            width: parent.width
            text: header.title
            color: AppStyle.text
            font.pixelSize: 18
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
        }
        Label {
            visible: header.subtitle.length > 0
            width: parent.width
            text: header.subtitle
            color: AppStyle.muted
            font.pixelSize: 12
            horizontalAlignment: Text.AlignHCenter
            truncationMode: TruncationMode.Fade
        }
    }
}
