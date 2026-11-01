import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// Calendar tab. Aurora gives applications no access to the system calendar,
// so the list stays empty as in CalendarList.native without events.
SilicaFlickable {
    id: view
    signal openRoom(var input)
    contentHeight: message.height
    Label {
        id: message
        x: 20
        width: parent.width - 40
        topPadding: 20
        text: appState.t("calendarSync.noEvents")
        font.pixelSize: AppStyle.bodyShortLarge
        color: Qt.rgba(1, 1, 1, 0.6)
        wrapMode: Text.Wrap
        horizontalAlignment: Text.AlignHCenter
    }
}
