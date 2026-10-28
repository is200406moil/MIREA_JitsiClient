import QtQuick 2.6
import Sailfish.Silica 1.0

BackgroundItem {
    id: toggle
    property string text
    property string description
    property string preferenceKey
    property bool locked: false
    property bool checked: locked || appState.preferences[preferenceKey] === true

    width: parent.width
    height: Math.max(Theme.itemSizeMedium, labels.height + 2 * Theme.paddingMedium)
    enabled: !locked
    Accessible.role: Accessible.Button
    Accessible.name: text
    onClicked: appState.setPreference(preferenceKey, !checked)

    Column {
        id: labels
        x: Theme.horizontalPageMargin
        width: toggle.width - x - switchTrack.width - 2 * Theme.paddingLarge
        anchors.verticalCenter: parent.verticalCenter
        spacing: Theme.paddingSmall
        Label {
            width: parent.width
            text: toggle.text
            wrapMode: Text.Wrap
            color: toggle.enabled ? Theme.primaryColor : Theme.secondaryColor
        }
        Label {
            visible: toggle.description.length > 0
            width: parent.width
            text: toggle.description
            wrapMode: Text.Wrap
            font.pixelSize: Theme.fontSizeExtraSmall
            color: Theme.secondaryColor
        }
    }
    Rectangle {
        id: switchTrack
        anchors { right: parent.right; rightMargin: Theme.horizontalPageMargin; verticalCenter: parent.verticalCenter }
        width: Theme.itemSizeSmall + Theme.paddingMedium
        height: Theme.iconSizeMedium
        radius: height / 2
        color: toggle.checked ? Theme.highlightBackgroundColor : Theme.rgba(Theme.secondaryColor, 0.55)
        opacity: toggle.enabled ? 1 : 0.45
        Rectangle {
            width: parent.height - 2 * Theme.paddingSmall
            height: width
            radius: width / 2
            anchors.verticalCenter: parent.verticalCenter
            x: toggle.checked ? parent.width - width - Theme.paddingSmall : Theme.paddingSmall
            color: Theme.primaryColor
        }
    }
}
