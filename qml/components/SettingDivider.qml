import QtQuick 2.6
import "."

// fieldSeparator of settings/components/native: 1 dp ui05 line with 24 dp
// side margins and 16 dp above and below.
Item {
    width: parent.width
    height: 33
    Rectangle {
        x: 24
        y: 16
        width: parent.width - 48
        height: 1
        color: AppStyle.separator
    }
}
