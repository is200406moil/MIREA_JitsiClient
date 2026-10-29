import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Rectangle {
    id: field
    property alias text: editor.text
    property alias inputMethodHints: editor.inputMethodHints
    property string placeholderText
    property bool centered: false
    readonly property bool fieldActiveFocus: editor.activeFocus
    signal accepted()
    function focusEditor() { editor.forceActiveFocus() }

    width: parent ? parent.width : 240
    height: 48
    radius: 6
    color: AppStyle.field
    border.width: editor.activeFocus ? 2 : 0
    border.color: AppStyle.muted

    TextInput {
        id: editor
        anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
        verticalAlignment: TextInput.AlignVCenter
        horizontalAlignment: field.centered ? TextInput.AlignHCenter : TextInput.AlignLeft
        color: AppStyle.text
        selectionColor: AppStyle.accent
        selectedTextColor: AppStyle.text
        font.pixelSize: 16
        clip: true
        selectByMouse: true
        onAccepted: field.accepted()
    }
    Label {
        anchors { fill: parent; leftMargin: 16; rightMargin: 16 }
        verticalAlignment: Text.AlignVCenter
        horizontalAlignment: field.centered ? Text.AlignHCenter : Text.AlignLeft
        text: field.placeholderText
        color: AppStyle.muted
        font.pixelSize: 16
        elide: Text.ElideRight
        visible: editor.text.length === 0 && !editor.activeFocus
    }
}
