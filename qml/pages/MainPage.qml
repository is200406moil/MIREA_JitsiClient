import QtQuick 2.6
import Sailfish.Silica 1.0
import Nemo.Configuration 1.0
import "../components"

Page {
    id: page
    objectName: "mainPage"
    allowedOrientations: Orientation.All
    property int selectedTab: 0
    ConfigurationValue { id: legacyRooms; key: "/apps/ru.vkr.JitsiAuroraPrototype/rooms"; defaultValue: "[]" }
    ConfigurationValue { id: legacyName; key: "/apps/ru.vkr.JitsiAuroraPrototype/displayName"; defaultValue: "" }
    Component.onCompleted: appState.importLegacy(legacyRooms.value, legacyName.value)
    function prepareRoom(input) {
        var room = typeof input === "string" ? appState.saveRoom(input) : input
        if (pane.item && pane.item.formError !== undefined) pane.item.formError = room.id ? "" : appState.lastError
        if (room.id) pageStack.push(Qt.resolvedUrl("PreJoinPage.qml"), {room:room})
    }
    Item {
        id: viewport
        width: page.width / 2
        height: page.height / 2
        scale: 2
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.background }
        ScreenHeader {
            id: header
            title: page.selectedTab === 2 ? qsTr("Настройки") : qsTr("Jitsi Meet")
        }
        Loader {
            id: pane
            clip: true
            anchors { top: header.bottom; bottom: navigation.top; left: parent.left; right: parent.right }
            source: Qt.resolvedUrl(["RecentsView.qml", "CalendarView.qml", "SettingsView.qml"][page.selectedTab])
            onLoaded: if (item.openRoom) item.openRoom.connect(page.prepareRoom)
        }
        BottomNavigation {
            id: navigation
            anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
            selectedTab: page.selectedTab
            onTabSelected: page.selectedTab = index
        }
    }
}
