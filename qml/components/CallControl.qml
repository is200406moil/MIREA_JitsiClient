import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

BackgroundItem {
    id: control
    property string text
    property string iconName
    property bool checked: false
    property bool destructive: false
    width: parent.width / 8
    height: Theme.itemSizeLarge
    Accessible.role: Accessible.Button
    Accessible.name: text
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        y: (control.height - height) / 2
        width: Math.min(Theme.itemSizeMedium, control.width - Theme.paddingMedium)
        height: width
        radius: control.destructive ? 6 : 0
        color: control.destructive ? AppStyle.danger : "transparent"
        opacity: control.down ? 0.6 : control.enabled ? 1 : 0.35
        border.width: control.activeFocus ? 2 : 0
        border.color: AppStyle.accentLight
        Icon {
            anchors.centerIn: parent
            source: Qt.resolvedUrl("../icons/" + control.iconName + ".svg")
            color: AppStyle.text
            width: Theme.iconSizeMedium
            height: width
        }
    }
    Label {
        visible: false
        anchors.bottom: parent.bottom
        anchors.bottomMargin: Theme.paddingSmall
        width: parent.width
        text: control.text
        color: control.enabled ? AppStyle.text : AppStyle.muted
        horizontalAlignment: Text.AlignHCenter
        font.pixelSize: Theme.fontSizeExtraSmall
        truncationMode: TruncationMode.Fade
    }
}
