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
    // An emoji button at the right of the field (EmojiPickerPage); the system
    // keyboard of Aurora OS has no emoji.
    property bool emoji: false
    readonly property bool fieldActiveFocus: editor.activeFocus
    signal accepted()
    function focusEditor() { editor.forceActiveFocus() }
    function blurEditor() { editor.focus = false; Qt.inputMethod.hide() }
    function insertText(value) {
        var at = editor.cursorPosition
        editor.insert(at, value)
        editor.cursorPosition = at + value.length
    }
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
            anchors { fill: parent; leftMargin: 24; rightMargin: field.emoji ? 56 : 24 }
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
        BackgroundItem {
            visible: field.emoji
            anchors { right: parent.right; verticalCenter: parent.verticalCenter; rightMargin: 4 }
            width: 48
            height: 48
            Icon {
                // Drawn at the final size; the screen is scaled up by AppStyle.dp.
                sourceSize: Qt.size(Math.ceil(width * AppStyle.dp), Math.ceil(height * AppStyle.dp))
                anchors.centerIn: parent
                width: 24
                height: 24
                source: Qt.resolvedUrl("../icons/face-smile.svg")
                color: AppStyle.text
            }
            onClicked: {
                field.blurEditor()
                pageStack.push(Qt.resolvedUrl("EmojiPickerPage.qml"), { field: field })
            }
        }
        Label {
            anchors { fill: parent; leftMargin: 24; rightMargin: field.emoji ? 56 : 24 }
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
