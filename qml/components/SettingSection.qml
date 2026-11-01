import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// FormSection title of settings/components/native: 14 dp semibold text02,
// 24 dp horizontal and 16 dp vertical margins.
Item {
    property alias text: heading.text
    width: parent.width
    height: heading.height + 32
    Label {
        id: heading
        x: 24
        y: 16
        width: parent.width - 48
        color: AppStyle.muted
        font.pixelSize: AppStyle.bodyShort
        font.weight: Font.DemiBold
        wrapMode: Text.Wrap
    }
}
