import QtQuick 2.6
import Sailfish.Silica 1.0
import Nemo.Configuration 1.0
import "../components"

// WelcomePage.native: header, the room name input above the Recent and
// Calendar tabs (hidden on Settings), the tab content and the tab bar.
Page {
    id: page
    objectName: "mainPage"
    allowedOrientations: Orientation.All
    property int selectedTab: 0
    ConfigurationValue { id: legacyRooms; key: "/apps/ru.vkr.JitsiAuroraPrototype/rooms"; defaultValue: "[]" }
    ConfigurationValue { id: legacyName; key: "/apps/ru.vkr.JitsiAuroraPrototype/displayName"; defaultValue: "" }
    Component.onCompleted: appState.importLegacy(legacyRooms.value, legacyName.value)

    function prepareRoom(input) {
        var room = typeof input === "string" ? appState.saveRoom(input, false) : input
        joinForm.error = room.id ? "" : appState.lastError
        if (room.id) pageStack.push(Qt.resolvedUrl("PreJoinPage.qml"), {room: room, mainPage: page})
    }

    Item {
        id: viewport
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.background }

        ScreenHeader {
            id: header
            title: appState.t(page.selectedTab === 2 ? "settings.title" : "welcomepage.headerTitle")
        }
        JoinRoomForm {
            id: joinForm
            anchors.top: header.bottom
            visible: page.selectedTab !== 2
            height: visible ? implicitHeight : 0
            onSubmitted: page.prepareRoom(input)
        }
        Loader {
            id: pane
            clip: true
            anchors { top: joinForm.bottom; bottom: navigation.top; left: parent.left; right: parent.right }
            source: Qt.resolvedUrl(["RecentsView.qml", "CalendarView.qml", "SettingsView.qml"][page.selectedTab])
            onLoaded: {
                if (item.openRoom) item.openRoom.connect(page.prepareRoom)
                if (item.roomMenu) item.roomMenu.connect(function(room) { roomSheet.open(room) })
            }
        }
        BottomNavigation {
            id: navigation
            anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
            selectedTab: page.selectedTab
            onTabSelected: { joinForm.blur(); page.selectedTab = index }
        }
        // While the room field is focused the tabs are disabled (opacity
        // 0.8) and a press on them only drops the focus (_onFieldBlur).
        MouseArea {
            visible: joinForm.focused
            anchors { top: joinForm.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
            z: 1
            onPressed: joinForm.blur()
            Rectangle { anchors.fill: parent; color: AppStyle.background; opacity: 0.2 }
        }
        MouseArea {
            visible: joinForm.focused
            anchors.fill: header
            z: 1
            onPressed: joinForm.blur()
        }
        RoomMenuSheet {
            id: roomSheet
            anchors.fill: parent
            onRemoveRequested: appState.removeRoom(room.id)
            onInfoRequested: pageStack.push(Qt.resolvedUrl("DialInInfoPage.qml"), {room: room})
        }
    }
}
