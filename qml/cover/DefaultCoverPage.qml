import QtQuick 2.0
import Sailfish.Silica 1.0

CoverBackground {
    objectName: "defaultCover"

    CoverTemplate {
        objectName: "applicationCover"
        primaryText: "Jitsi"
        secondaryText: "Meet"
        icon {
            source: Qt.resolvedUrl("../icons/Jitsi.png")
            sourceSize { width: icon.width; height: icon.height }
        }
    }
}
