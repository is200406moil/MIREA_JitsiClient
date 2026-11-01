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
        Label {
            x: 24; width: parent.width - 48
            visible: view.rooms.length === 0
            topPadding: 16
            text: qsTr("Сейчас ваш список недавно проведенных конференций пуст. По мере вашего пользования сервисом он будет пополняться.")
            font.pixelSize: 12; color: AppStyle.muted; wrapMode: Text.Wrap; horizontalAlignment: Text.AlignHCenter
        }
        Repeater {
            model: view.rooms
            delegate: Column {
                id: entry
                property var room: modelData
                width: body.width
                Rectangle {
                    visible: index === 0 || appState.roomSection(entry.room.lastUsed) !== appState.roomSection(view.rooms[index-1].lastUsed)
                    width: parent.width
                    height: visible ? 28 : 0
                    color: AppStyle.field
                    Label {
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        text: appState.roomSection(entry.room.lastUsed)
                        color: AppStyle.muted
                        font.pixelSize: 14
                    }
                }
                ListItem {
                    id: row
                    width: parent.width
                    contentHeight: Math.max(68, roomText.height + 16)
                    onClicked: view.openRoom(entry.room)
                    menu: ContextMenu {
                        MenuItem {
                            text: qsTr("Удалить")
                            onClicked: row.remorseAction(qsTr("Удаление комнаты"), function() { appState.removeRoom(entry.room.id) })
                        }
                        MenuItem {
                            text: qsTr("Инфо")
                            onClicked: pageStack.push(Qt.resolvedUrl("DialInInfoPage.qml"), {room: entry.room})
                        }
                    }
                    Rectangle {
                        id: initials
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: 54
                        height: width
                        radius: width/2
                        color: AppStyle.avatarColor(entry.room.server === "https://meet.jit.si" ? entry.room.name : entry.room.server)
                        Label {
                            anchors.centerIn: parent
                            text: appState.initials(entry.room.name)
                            color: AppStyle.text
                            font.pixelSize: 29
                            font.weight: Font.Light
                        }
                    }
                    Column {
                        id: roomText
                        x: initials.x + initials.width + 5
                        width: parent.width - x - 16
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: 2
                        Label {
                            width: parent.width
                            text: entry.room.name
                            font.bold: true
                            font.pixelSize: 16
                            color: AppStyle.muted
                            truncationMode: TruncationMode.Fade
                        }
                        Label {
                            width: parent.width
                            text: appState.roomDate(entry.room.lastUsed)
                            color: AppStyle.muted
                            font.pixelSize: 14
                            truncationMode: TruncationMode.Fade
                        }
                        Label {
                            width: parent.width
                            visible: entry.room.duration !== undefined
                            text: Math.floor((entry.room.duration || 0) / 60) + ":" + ("0" + ((entry.room.duration || 0) % 60)).slice(-2)
                            color: AppStyle.muted
                            font.pixelSize: 12
                        }
                        Label {
                            width: parent.width
                            text: entry.room.server.replace("https://", "")
                            visible: entry.room.server !== "https://meet.jit.si"
                            color: AppStyle.muted
                            font.pixelSize: 14
                            truncationMode: TruncationMode.Fade
                        }
                    }
                }
            }
        }
    }
    VerticalScrollDecorator {}
}
