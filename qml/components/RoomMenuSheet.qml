import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// RecentListItemMenu of Jitsi Meet in the style of the call screen's bottom
// sheets (qml/call/call.css .sheet): ui01 panel with 16 dp top corners that
// slides in, a header with the room's avatar, name and date, then "Delete"
// and "Info" rows of 48 dp with 24 dp icons.
Item {
    id: sheet
    property var room: null
    property var shownRoom: null
    signal removeRequested(var room)
    signal infoRequested(var room)
    visible: shownRoom !== null
    z: 100

    function open(value) { shownRoom = value; room = value }
    function close() { room = null }

    Rectangle {
        id: backdrop
        anchors.fill: parent
        color: "#99000000"
        opacity: sheet.room ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: 200 } }
        MouseArea { anchors.fill: parent; onClicked: sheet.close() }
    }

    Rectangle {
        id: panel
        anchors { left: parent.left; right: parent.right }
        y: sheet.room ? sheet.height - height : sheet.height
        Behavior on y {
            NumberAnimation {
                duration: 200
                easing.type: Easing.OutCubic
                onRunningChanged: if (!running && !sheet.room) sheet.shownRoom = null
            }
        }
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

            // .sheet-title: avatar, then the name and the date.
            Item {
                width: parent.width
                height: 56
                Avatar {
                    id: avatar
                    x: 16
                    anchors.verticalCenter: parent.verticalCenter
                    width: 32
                    name: sheet.shownRoom ? sheet.shownRoom.name : ""
                }
                Column {
                    anchors { left: avatar.right; leftMargin: 12; right: parent.right; rightMargin: 16; verticalCenter: parent.verticalCenter }
                    Label {
                        width: parent.width
                        text: sheet.shownRoom ? sheet.shownRoom.name : ""
                        color: AppStyle.text
                        font.pixelSize: 14
                        font.weight: Font.DemiBold
                        truncationMode: TruncationMode.Fade
                    }
                    Label {
                        width: parent.width
                        visible: text.length > 0
                        text: sheet.shownRoom ? appState.roomDate(sheet.shownRoom.lastUsed) : ""
                        color: AppStyle.muted
                        font.pixelSize: 12
                        truncationMode: TruncationMode.Fade
                    }
                }
            }
            // .sheet-divider
            Item {
                width: parent.width
                height: 17
                Rectangle { anchors.verticalCenter: parent.verticalCenter; width: parent.width; height: 1; color: AppStyle.field }
            }

            Repeater {
                model: [
                    { icon: "trash", label: appState.t("welcomepage.recentListDelete"), action: "remove" },
                    { icon: "info", label: appState.t("welcomepage.info"), action: "info" }
                ]
                // .sheet-item
                // A plain MouseArea: Silica's BackgroundItem paints its own
                // highlight background.
                delegate: MouseArea {
                    width: content.width
                    height: 48
                    Rectangle { anchors.fill: parent; color: AppStyle.field; visible: parent.pressed && parent.containsMouse }
                    onClicked: {
                        var room = sheet.room
                        sheet.close()
                        if (modelData.action === "remove") sheet.removeRequested(room)
                        else sheet.infoRequested(room)
                    }
                    Item {
                        id: iconBox
                        x: 16
                        width: 24
                        height: 24
                        anchors.verticalCenter: parent.verticalCenter
                        Icon {
                            anchors.centerIn: parent
                            // The trash glyph fills its box; draw it at the
                            // optical size of the other icons.
                            width: modelData.icon === "trash" ? 18 : 24
                            height: modelData.icon === "trash" ? 20 : 24
                            source: Qt.resolvedUrl("../icons/" + modelData.icon + ".svg")
                            color: AppStyle.text
                        }
                    }
                    Label {
                        anchors { left: iconBox.right; leftMargin: 16; verticalCenter: parent.verticalCenter }
                        text: modelData.label
                        color: AppStyle.text
                        font.pixelSize: 14
                    }
                }
            }
        }
    }
}
