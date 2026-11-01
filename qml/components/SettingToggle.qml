import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

BackgroundItem {
    id: toggle
    property string text
    property string description
    property string preferenceKey
    property bool locked: false
    property bool checked: locked || appState.preferences[preferenceKey] === true

    width: parent.width
    height: Math.max(48, labels.height + 16)
    enabled: !locked
    Accessible.role: Accessible.Button
    Accessible.name: text
    onClicked: appState.setPreference(preferenceKey, !checked)

    Column {
        id: labels
        x: 16
        width: toggle.width - x - switchTrack.width - 32
        anchors.verticalCenter: parent.verticalCenter
        spacing: 4
        Label {
            width: parent.width
            text: toggle.text
            wrapMode: Text.Wrap
            color: toggle.enabled ? AppStyle.text : AppStyle.muted
            font.pixelSize: 14
        }
        Label {
            visible: toggle.description.length > 0
            width: parent.width
            text: toggle.description
            wrapMode: Text.Wrap
            font.pixelSize: 12
            color: AppStyle.muted
        }
    }
    Rectangle {
        id: switchTrack
        anchors { right: parent.right; rightMargin: 16; verticalCenter: parent.verticalCenter }
        width: 32
        height: 14
        radius: height / 2
        color: toggle.checked ? "#719BDE" : "#666666"
        opacity: toggle.enabled ? 1 : 0.7
        Rectangle {
            width: 20
            height: width
            radius: width / 2
            anchors.verticalCenter: parent.verticalCenter
            x: toggle.checked ? parent.width - width : 0
            Behavior on x { NumberAnimation { duration: 120 } }
            color: AppStyle.text
        }
    }
}
