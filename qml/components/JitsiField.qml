import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// Input of base/ui/components/native: optional label above, 56 dp field on
// ui03 with a 2 dp border that turns focus01 when focused, 16 dp text.
Column {
    id: field
    property alias text: editor.text
    property alias inputMethodHints: editor.inputMethodHints
    property alias echoMode: editor.echoMode
    property string label
    property string placeholderText
    property bool centered: false
    property bool error: false
    readonly property bool fieldActiveFocus: editor.activeFocus
    signal accepted()
    function focusEditor() { editor.forceActiveFocus() }
    function blurEditor() { editor.focus = false; Qt.inputMethod.hide() }
    width: parent ? parent.width : 240
    spacing: 8

    Label {
        visible: field.label.length > 0
        width: parent.width
        text: field.label
        color: AppStyle.text
        font.pixelSize: AppStyle.bodyShortLarge
        wrapMode: Text.Wrap
    }

    Rectangle {
        width: parent.width
        height: 56
        radius: 6
        color: AppStyle.field
        border.width: 2
        border.color: field.error ? AppStyle.error : editor.activeFocus ? AppStyle.focus : AppStyle.field

        TextInput {
            id: editor
            anchors { fill: parent; leftMargin: 24; rightMargin: 24 }
            verticalAlignment: TextInput.AlignVCenter
            horizontalAlignment: field.centered ? TextInput.AlignHCenter : TextInput.AlignLeft
            color: AppStyle.text
            selectionColor: AppStyle.accent
            selectedTextColor: AppStyle.text
            font.pixelSize: AppStyle.bodyShortLarge
            clip: true
            selectByMouse: true
            onAccepted: field.accepted()
        }
        Label {
            anchors { fill: parent; leftMargin: 24; rightMargin: 24 }
            verticalAlignment: Text.AlignVCenter
            horizontalAlignment: field.centered ? Text.AlignHCenter : Text.AlignLeft
            text: field.placeholderText
            color: AppStyle.inactive
            font.pixelSize: AppStyle.bodyShortLarge
            elide: Text.ElideRight
            visible: editor.text.length === 0
        }
    }
}
