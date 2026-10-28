import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Column {
    id: form
    property string error
    signal submitted(string input)
    width: parent.width
    spacing: Theme.paddingSmall
    Label {
        x: Theme.horizontalPageMargin
        width: parent.width-2*x
        text: qsTr("Укажите название комнаты")
        wrapMode: Text.Wrap
    }
    TextField {
        id: room
        width: parent.width
        label: qsTr("Комната или ссылка")
        placeholderText: qsTr("Название комнаты или ссылка")
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
        rightItem: IconButton {
            icon.source: "image://theme/icon-m-enter-accept"
            enabled: room.text.trim().length > 0
            Accessible.name: qsTr("Присоединиться к встрече")
            onClicked: form.submitted(room.text)
        }
        EnterKey.iconSource: "image://theme/icon-m-enter-accept"
        EnterKey.onClicked: form.submitted(text)
    }
    Label {
        visible: form.error.length > 0
        x: Theme.horizontalPageMargin
        width: parent.width - 2*x
        text: form.error
        color: AppStyle.text
        wrapMode: Text.Wrap
        font.pixelSize: Theme.fontSizeSmall
    }
}
