import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// FormRow with a Switch (settings/components/native): at least 64 dp high,
// 16 dp label on the left, switch on the right with the colours of
// base/ui Switch: action01 track when on, ui05 when off, icon01 thumb.
// Without preferenceKey the owner sets checked and handles toggled().
BackgroundItem {
    id: toggle
    property string text
    property string preferenceKey
    property bool checked: appState.preferences[preferenceKey] === true
    signal toggled(bool value)

    width: parent.width
    height: Math.max(64, labelText.height + 16)
    highlightedColor: "transparent"
    Accessible.role: Accessible.CheckBox
    Accessible.name: text
    Accessible.checked: checked
    opacity: enabled ? 1 : 0.5
    onClicked: {
        if (preferenceKey) appState.setPreference(preferenceKey, !checked)
        else toggled(!checked)
    }

    Label {
        id: labelText
        x: 24
        anchors.verticalCenter: parent.verticalCenter
        width: toggle.width - x - track.width - 40
        text: toggle.text
        wrapMode: Text.Wrap
        color: AppStyle.text
        font.pixelSize: AppStyle.bodyShortLarge
    }
    Rectangle {
        id: track
        anchors { right: parent.right; rightMargin: 24; verticalCenter: parent.verticalCenter }
        width: 34
        height: 14
        radius: 7
        color: toggle.checked ? AppStyle.accent : AppStyle.separator
    }
    Rectangle {
        width: 20
        height: 20
        radius: 10
        anchors.verticalCenter: track.verticalCenter
        x: toggle.checked ? track.x + track.width - width + 3 : track.x - 3
        Behavior on x { NumberAnimation { duration: 120 } }
        color: AppStyle.text
    }
}
