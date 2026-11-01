import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// RecentListItemMenu of Jitsi Meet: a bottom sheet with the room name and
// date, then "Delete" and "Info".
Item {
    id: sheet
    property var room: null
    signal removeRequested(var room)
    signal infoRequested(var room)
    visible: room !== null
    z: 100

    function open(value) { room = value }
    function close() { room = null }

    Rectangle {
        anchors.fill: parent
        color: "#99000000"
        MouseArea { anchors.fill: parent; onClicked: sheet.close() }
    }

    Rectangle {
        id: panel
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        height: content.height + 16
        radius: 16
        color: AppStyle.surface
        // Square off the bottom corners of the rounded panel.
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 16; color: AppStyle.surface }
        MouseArea { anchors.fill: parent }

        Column {
            id: content
            width: parent.width
            y: 8

            Item {
                width: parent.width
                height: 64
                Column {
                    x: 16
                    width: parent.width - 32
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Label {
                        width: parent.width
                        text: sheet.room ? sheet.room.name : ""
                        color: AppStyle.text
                        font.pixelSize: 16
                        font.bold: true
                        truncationMode: TruncationMode.Fade
                    }
                    Label {
                        width: parent.width
                        visible: text.length > 0
                        text: sheet.room ? appState.roomDate(sheet.room.lastUsed) : ""
                        color: AppStyle.muted
                        font.pixelSize: 14
                    }
                }
            }
            Rectangle { width: parent.width; height: 1; color: AppStyle.field }

            Repeater {
                model: [
                    { icon: "trash", label: appState.t("welcomepage.recentListDelete"), action: "remove" },
                    { icon: "info", label: appState.t("welcomepage.info"), action: "info" }
                ]
                delegate: BackgroundItem {
                    width: content.width
                    height: 48
                    onClicked: {
                        var room = sheet.room
                        sheet.close()
                        if (modelData.action === "remove") sheet.removeRequested(room)
                        else sheet.infoRequested(room)
                    }
                    Icon {
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: 24; height: 24
                        source: Qt.resolvedUrl("../icons/" + modelData.icon + ".svg")
                        color: AppStyle.text
                    }
                    Label {
                        x: 56
                        anchors.verticalCenter: parent.verticalCenter
                        text: modelData.label
                        color: AppStyle.text
                        font.pixelSize: 16
                    }
                }
            }
        }
    }
}
