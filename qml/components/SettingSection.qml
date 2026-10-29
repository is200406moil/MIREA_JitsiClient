import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Item {
    property alias text: heading.text
    width: parent.width
    height: heading.height + 36
    Rectangle {
        x: 16
        y: 0
        width: parent.width - 2 * x
        height: 1
        color: AppStyle.border
    }
    Label {
        id: heading
        x: 16
        y: parent.height - height - 8
        width: parent.width - 2*x
        color: AppStyle.muted
        font.pixelSize: 14
        wrapMode: Text.Wrap
    }
}
