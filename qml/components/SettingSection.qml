import QtQuick 2.6
import Sailfish.Silica 1.0

Item {
    property alias text: heading.text
    width: parent.width
    height: heading.height + 3 * Theme.paddingLarge
    Rectangle {
        x: Theme.horizontalPageMargin
        y: Theme.paddingSmall
        width: parent.width - 2 * x
        height: 1
        color: Theme.rgba(Theme.primaryColor, 0.2)
    }
    Label {
        id: heading
        x: Theme.horizontalPageMargin
        y: parent.height - height - Theme.paddingSmall
        width: parent.width - 2*x
        color: Theme.secondaryColor
        font.pixelSize: Theme.fontSizeSmall
        wrapMode: Text.Wrap
    }
}
