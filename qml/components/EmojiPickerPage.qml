import QtQuick 2.6
import Sailfish.Silica 1.0
import "."
import "EmojiData.js" as EmojiData

// Emoji for the text fields of the native screens (JitsiField.emoji): the
// system keyboard of Aurora OS has none. The most used emoji first, all of
// them by category on the other tabs, as the panel of the meeting page.
// A tap puts the emoji into the field; the page stays open.
Page {
    id: page
    allowedOrientations: Orientation.All
    property var field
    property string tab: "recent"
    readonly property var items: page.tab === "recent" ? EmojiData.recent() : (EmojiData.groups[page.tab] || [])

    Item {
        id: viewport
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }

        ScreenHeader {
            id: header
            title: appState.t("chat.smileysPanel")
            showBack: true
            closeIcon: true
            onBackClicked: pageStack.pop()
        }

        // The text of the field, to see what is being typed.
        Label {
            id: preview
            anchors { top: header.bottom; left: parent.left; right: parent.right; margins: 16 }
            text: page.field ? page.field.text : ""
            color: AppStyle.text
            font.pixelSize: 20
            elide: Text.ElideLeft
        }

        Flickable {
            id: tabs
            anchors { top: preview.bottom; topMargin: 12; left: parent.left; right: parent.right }
            height: 48
            contentWidth: tabRow.width
            flickableDirection: Flickable.HorizontalFlick
            clip: true
            Row {
                id: tabRow
                x: 8
                spacing: 4
                Repeater {
                    model: EmojiData.tabs
                    delegate: BackgroundItem {
                        width: 48
                        height: 48
                        visible: modelData[0] === "recent" || (EmojiData.groups[modelData[0]] || []).length > 0
                        Rectangle {
                            anchors.fill: parent
                            radius: 6
                            color: page.tab === modelData[0] ? AppStyle.raised : "transparent"
                        }
                        Label {
                            anchors.centerIn: parent
                            text: modelData[1]
                            font.pixelSize: 24
                            opacity: page.tab === modelData[0] ? 1 : 0.6
                        }
                        onClicked: { page.tab = modelData[0]; grid.contentY = 0 }
                    }
                }
            }
        }

        GridView {
            id: grid
            anchors { top: tabs.bottom; bottom: parent.bottom; left: parent.left; right: parent.right; margins: 8 }
            cellWidth: Math.floor(width / Math.max(1, Math.floor(width / 52)))
            cellHeight: 52
            clip: true
            model: page.items
            delegate: BackgroundItem {
                width: grid.cellWidth
                height: grid.cellHeight
                Label {
                    anchors.centerIn: parent
                    text: modelData
                    font.pixelSize: 30
                }
                onClicked: {
                    EmojiData.count(modelData)
                    if (page.field) page.field.insertText(modelData)
                }
            }
        }
    }
}
