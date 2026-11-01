import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// Button of base/ui/components/native: 56 dp, radius 6, 14 dp semibold label.
// type: "primary" (action01), "secondary" (action02), "tertiary" (no
// background) or "destructive" (actionDanger).
BackgroundItem {
    id: control
    property string text
    property string iconName
    property string type: "primary"
    property bool uppercase: false
    width: parent ? parent.width : implicitWidth
    implicitWidth: content.implicitWidth + 48
    height: 56
    highlightedColor: "transparent"
    Accessible.role: Accessible.Button
    Accessible.name: text

    Rectangle {
        anchors.fill: parent
        radius: 6
        color: {
            if (!control.enabled && control.type !== "tertiary") return "#C2C2C2"
            if (control.type === "primary") return control.down ? AppStyle.accentActive : AppStyle.accent
            if (control.type === "secondary") return control.down ? "#C2C2C2" : AppStyle.secondary
            if (control.type === "destructive") return control.down ? "#CB2233" : AppStyle.danger
            return control.down ? AppStyle.raised : "transparent"
        }
    }

    Row {
        id: content
        anchors.centerIn: parent
        spacing: 8
        Icon {
            anchors.verticalCenter: parent.verticalCenter
            visible: control.iconName.length > 0
            width: 20
            height: 20
            source: control.iconName.length ? Qt.resolvedUrl("../icons/" + control.iconName + ".svg") : ""
            color: label.color
        }
        Label {
            id: label
            text: control.uppercase ? control.text.toUpperCase() : control.text
            color: !control.enabled ? AppStyle.inactive : control.type === "secondary" ? AppStyle.dark : AppStyle.text
            font.pixelSize: AppStyle.bodyShort
            font.weight: Font.DemiBold
        }
    }
}
