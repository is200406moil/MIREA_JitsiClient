import QtQuick 2.6
import Sailfish.Silica 1.0
import "."
import "../lib/RoomName.js" as RoomName

Column {
    id: form
    property string error
    property string generatedRoomName: RoomName.generateRoomWithoutSeparator()
    readonly property bool expanded: room.fieldActiveFocus || room.text.length > 0
    readonly property bool unsafeName: room.text.trim().length > 0 && room.text.trim().length <= 8
    signal submitted(string input)
    width: parent.width
    spacing: 12
    Timer {
        interval: 10000
        repeat: true
        running: true
        onTriggered: form.generatedRoomName = RoomName.generateRoomWithoutSeparator()
    }

    Item { width: 1; height: 8 }
    Label {
        x: 16
        width: parent.width - 32
        text: qsTr("Укажите название комнаты")
        color: AppStyle.text
        font.pixelSize: 14
        wrapMode: Text.Wrap
    }
    JitsiField {
        id: room
        x: 16
        width: parent.width - 32
        placeholderText: form.generatedRoomName
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
        onAccepted: form.submitted(text.trim() || form.generatedRoomName)
    }
    Rectangle {
        x: 16
        width: parent.width - 32
        visible: form.expanded && form.unsafeName
        height: visible ? unsafeText.height + 20 : 0
        radius: 4
        color: AppStyle.field
        Icon { x: 6; anchors.verticalCenter: parent.verticalCenter; width: 20; height: 20; source: Qt.resolvedUrl("../icons/warning.svg"); color: "#FFCB00" }
        Label {
            id: unsafeText
            x: 32; y: 10; width: parent.width - 44
            text: qsTr("Название комнаты небезопасно. Нежелательные участники могут присоединиться к вашей встрече. Рассмотрите возможность использования более уникального имени встречи или выберите одно из предложений. Узнайте больше о защите вашей встречи <a href=\"https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi\">here</a>.")
            textFormat: Text.RichText
            onLinkActivated: pageStack.push(Qt.resolvedUrl("../pages/SecurityHelpPage.qml"), {address: link})
            color: AppStyle.text; font.pixelSize: 12; wrapMode: Text.Wrap
        }
    }
    Rectangle {
        x: 16; width: parent.width - 32
        visible: form.expanded
        height: visible ? explanation.height + 70 : 0
        radius: 4; color: AppStyle.field
        Label {
            id: explanation
            x: 12; y: 12; width: parent.width - 24
            text: qsTr("Укажите название комнаты или ее адрес. Можете сами создать название и передать его будущим участникам встречи, чтобы они использовали именно его.")
            color: AppStyle.text; font.pixelSize: 12; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter
        }
        AppButton {
            anchors { horizontalCenter: parent.horizontalCenter; top: explanation.bottom; topMargin: 16 }
            width: Math.min(parent.width - 24, 240)
            height: 40
            text: qsTr("СОЗДАТЬ / ПРИСОЕДИНИТЬСЯ")
            onClicked: form.submitted(room.text.trim() || form.generatedRoomName)
        }
    }
    Label {
        visible: form.error.length > 0
        x: 16
        width: parent.width - 32
        text: form.error
        color: AppStyle.text
        wrapMode: Text.Wrap
        font.pixelSize: 14
    }
    Item { width: 1; height: 4 }
}
