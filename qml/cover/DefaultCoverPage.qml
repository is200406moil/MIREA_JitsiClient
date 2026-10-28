import QtQuick 2.0
import Sailfish.Silica 1.0

CoverBackground {
    objectName: "defaultCover"

    CoverTemplate {
        objectName: "applicationCover"
        primaryText: qsTr("Jitsi")
        secondaryText: qsTr("Комнаты и встречи")
        icon {
            source: Qt.resolvedUrl("../icons/Jitsi.png")
            sourceSize { width: icon.width; height: icon.height }
        }
    }
}
