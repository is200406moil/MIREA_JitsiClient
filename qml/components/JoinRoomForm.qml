import QtQuick 2.6
import Sailfish.Silica 1.0
import "."
import "../lib/RoomName.js" as RoomName

Column {
    id: form
    property string error
    property string generatedRoomName: RoomName.generateRoomWithoutSeparator()
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
        font.pixelSize: 18
        wrapMode: Text.Wrap
    }
    JitsiField {
        id: room
        x: 16
        width: parent.width - 32
        centered: true
        placeholderText: form.generatedRoomName
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
        onAccepted: if (text.trim().length > 0) form.submitted(text)
    }
    AppButton {
        x: 16
        width: parent.width - 32
        visible: room.text.trim().length > 0
        text: qsTr("Присоединиться к встрече")
        onClicked: form.submitted(room.text)
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
