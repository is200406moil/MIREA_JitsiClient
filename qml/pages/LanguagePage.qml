import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

Page {
    id: page
    property var mainPage
    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    Item {
    width: page.width / 2
    height: page.height / 2
    scale: 2
    transformOrigin: Item.TopLeft
    ScreenHeader { id: header; title: qsTr("Язык"); showBack: true; onBackClicked: pageStack.pop() }
    Column {
        anchors { top: header.bottom; left: parent.left; right: parent.right }
        Repeater {
            model: [{name: "Русский", code: "ru"}, {name: "English", code: "en"}]
            delegate: BackgroundItem {
                width: page.width; height: 56
                Label { x: 16; anchors.verticalCenter: parent.verticalCenter; text: modelData.name; color: AppStyle.text; font.pixelSize: 16 }
                Label {
                    anchors { right: parent.right; rightMargin: 16; verticalCenter: parent.verticalCenter }
                    visible: appState.preferences.language === modelData.code
                    text: "✓"; color: AppStyle.accent; font.pixelSize: 20
                }
                onClicked: { appState.setPreference("language", modelData.code); pageStack.pop() }
            }
        }
    }
    BottomNavigation {
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        selectedTab: 2
        onTabSelected: { if (page.mainPage) page.mainPage.selectedTab = index; pageStack.pop() }
    }
    }
}
