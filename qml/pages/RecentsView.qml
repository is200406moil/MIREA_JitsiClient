import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

SilicaFlickable {
    id: view
    signal openRoom(var input)
    property string formError
    property var rooms: appState.rooms
    contentHeight: body.height + Theme.paddingLarge
    Column {
        id: body
        width: parent.width
        JoinRoomForm { error: view.formError; onSubmitted: view.openRoom(input) }
        Repeater {
            model: view.rooms
            delegate: Column {
                id: entry
                property var room: modelData
                width: body.width
                Rectangle {
                    visible: index === 0 || appState.roomSection(entry.room.lastUsed) !== appState.roomSection(view.rooms[index-1].lastUsed)
                    width: parent.width
                    height: visible ? Theme.itemSizeSmall / 2 : 0
                    color: Theme.rgba(Theme.primaryColor, 0.12)
                    Label {
                        x: Theme.horizontalPageMargin
                        anchors.verticalCenter: parent.verticalCenter
                        text: appState.roomSection(entry.room.lastUsed)
                        color: Theme.secondaryColor
                        font.pixelSize: Theme.fontSizeExtraSmall
                    }
                }
                ListItem {
                    id: row
                    width: parent.width
                    contentHeight: Math.max(Theme.itemSizeExtraLarge, roomText.height + 2 * Theme.paddingMedium)
                    onClicked: view.openRoom(entry.room)
                    menu: ContextMenu {
                        MenuItem {
                            text: qsTr("Удалить")
                            onClicked: row.remorseAction(qsTr("Удаление комнаты"), function() { appState.removeRoom(entry.room.id) })
                        }
                    }
                    Rectangle {
                        id: initials
                        x: Theme.horizontalPageMargin
                        anchors.verticalCenter: parent.verticalCenter
                        width: Theme.itemSizeMedium
                        height: width
                        radius: width/2
                        color: Theme.rgba(Theme.highlightColor, 0.25)
                        Label {
                            anchors.centerIn: parent
                            text: appState.initials(entry.room.name)
                            font.pixelSize: Theme.fontSizeExtraLarge
                        }
                    }
                    Column {
                        id: roomText
                        x: initials.x + initials.width + Theme.paddingLarge
                        width: parent.width - x - Theme.horizontalPageMargin
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Theme.paddingSmall
                        Label {
                            width: parent.width
                            text: entry.room.name
                            font.bold: true
                            truncationMode: TruncationMode.Fade
                        }
                        Label {
                            width: parent.width
                            text: appState.roomDate(entry.room.lastUsed)
                            color: Theme.secondaryColor
                            font.pixelSize: Theme.fontSizeSmall
                            truncationMode: TruncationMode.Fade
                        }
                        Label {
                            width: parent.width
                            text: entry.room.server.replace("https://", "")
                            visible: entry.room.server !== "https://meet.jit.si"
                            color: Theme.secondaryColor
                            font.pixelSize: Theme.fontSizeSmall
                            truncationMode: TruncationMode.Fade
                        }
                    }
                }
            }
        }
    }
    VerticalScrollDecorator {}
}
