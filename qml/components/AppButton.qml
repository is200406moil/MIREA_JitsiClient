import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

BackgroundItem {
    id: control
    property string text
    property string iconName
    property bool primary: true
    property bool destructive: false
    property bool selected: false
    width: parent ? parent.width : implicitWidth
    height: Math.max(48, buttonText.implicitHeight + 24)
    Accessible.role: Accessible.Button
    Accessible.name: text
    Rectangle {
        anchors.fill: parent
        radius: 6
        color: control.down ? AppStyle.border : control.destructive ? AppStyle.danger
                         : control.primary ? AppStyle.accent : AppStyle.raised
        opacity: control.enabled ? 1 : 0.38
        border.width: control.activeFocus || control.selected ? 2 : 0
        border.color: AppStyle.muted
    }
    Row {
        id: buttonRow
        width: control.width - 2 * Theme.paddingLarge
        anchors.centerIn: parent
        spacing: Theme.paddingMedium
        Icon {
            anchors.verticalCenter: parent.verticalCenter
            visible: control.iconName.length > 0
            width: Theme.iconSizeSmall
            height: width
            source: control.iconName.length ? Qt.resolvedUrl("../icons/" + control.iconName + ".svg") : ""
            color: AppStyle.text
        }
        Label {
            id: buttonText
            width: buttonRow.width - (control.iconName.length ? Theme.iconSizeSmall + buttonRow.spacing : 0)
            color: AppStyle.text
            text: control.text
            font.pixelSize: 16
            font.bold: true
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
        }
    }
}
