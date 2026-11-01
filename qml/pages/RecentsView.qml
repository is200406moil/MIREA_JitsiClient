import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// RecentList.native through NavigateSectionList: ui02 section headers
// (Today / Yesterday / Earlier) and AvatarListItem rows with a 65 dp
// initials avatar, bold title and secondary lines.
SilicaFlickable {
    id: view
    signal openRoom(var input)
    signal roomMenu(var room)
    property var rooms: appState.rooms
    contentHeight: body.height
    clip: true

    Column {
        id: body
        width: parent.width

        Label {
            x: 20
            width: parent.width - 40
            visible: view.rooms.length === 0
            topPadding: 20
            text: appState.t("welcomepage.recentListEmpty")
            font.pixelSize: AppStyle.bodyShortLarge
            color: Qt.rgba(1, 1, 1, 0.6)
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignHCenter
        }

        Repeater {
            model: view.rooms
            delegate: Column {
                id: entry
                property var room: modelData
                width: body.width

                Rectangle {
                    visible: index === 0 || appState.roomSection(entry.room.lastUsed) !== appState.roomSection(view.rooms[index - 1].lastUsed)
                    width: parent.width
                    height: visible ? sectionText.height + 8 : 0
                    color: AppStyle.raised
                    Label {
                        id: sectionText
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        text: appState.roomSection(entry.room.lastUsed)
                        color: Qt.rgba(1, 1, 1, 0.6)
                        font.pixelSize: AppStyle.bodyShort
                    }
                }

                BackgroundItem {
                    width: parent.width
                    height: Math.max(65, details.height) + 16
                    onClicked: view.openRoom(entry.room)
                    onPressAndHold: view.roomMenu(entry.room)

                    Rectangle {
                        id: avatar
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: 65
                        height: 65
                        radius: 32.5
                        color: AppStyle.avatarColor(entry.room.name)
                        Label {
                            anchors.centerIn: parent
                            text: appState.initials(entry.room.name)
                            color: Qt.rgba(1, 1, 1, 0.6)
                            font.pixelSize: 32
                            font.weight: Font.Thin
                        }
                    }
                    Column {
                        id: details
                        anchors { left: avatar.right; leftMargin: 10; right: parent.right; rightMargin: 21 }
                        anchors.verticalCenter: parent.verticalCenter
                        Label {
                            width: parent.width
                            text: entry.room.name
                            font.bold: true
                            font.pixelSize: AppStyle.bodyShortLarge
                            color: Qt.rgba(1, 1, 1, 0.6)
                            truncationMode: TruncationMode.Fade
                        }
                        Repeater {
                            // getRecentRoomsOf(): date, duration and the server when it is not the default.
                            model: [
                                appState.roomDate(entry.room.lastUsed),
                                entry.room.duration !== undefined
                                    ? Math.floor(entry.room.duration / 60) + ":" + ("0" + entry.room.duration % 60).slice(-2) : "",
                                entry.room.server !== "https://meet.jit.si" ? entry.room.server.replace("https://", "") : ""
                            ].filter(function(line) { return line.length > 0 })
                            delegate: Label {
                                width: details.width
                                text: modelData
                                color: Qt.rgba(1, 1, 1, 0.6)
                                font.pixelSize: AppStyle.bodyShort
                                truncationMode: TruncationMode.Fade
                            }
                        }
                    }
                }
            }
        }
    }
    VerticalScrollDecorator {}
}
