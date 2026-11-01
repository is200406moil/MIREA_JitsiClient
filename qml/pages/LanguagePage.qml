import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// LanguageSelectView.native: one 48 dp row per language with a ui05 line
// below; the current language is greyed out and not selectable.
Page {
    id: page
    allowedOrientations: Orientation.All
    property var mainPage

    Item {
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }

        ScreenHeader {
            id: header
            title: appState.t("settings.language")
            showBack: true
            onBackClicked: pageStack.pop()
        }
        Column {
            anchors { top: header.bottom; left: parent.left; right: parent.right }
            Repeater {
                // The interface is translated into these languages.
                model: ["en", "ru"]
                delegate: BackgroundItem {
                    readonly property bool current: appState.preferences.language === modelData
                    width: parent.width
                    height: 48
                    enabled: !current
                    highlightedColor: "transparent"
                    Rectangle { anchors.fill: parent; color: parent.down ? AppStyle.raised : "transparent" }
                    Label {
                        x: 32
                        anchors.verticalCenter: parent.verticalCenter
                        text: appState.t("languages:" + modelData)
                        color: current ? AppStyle.inactive : AppStyle.text
                        font.pixelSize: AppStyle.bodyShortLarge
                    }
                    Rectangle { x: 32; anchors.bottom: parent.bottom; width: parent.width - 64; height: 1; color: AppStyle.separator }
                    onClicked: { appState.setPreference("language", modelData); pageStack.pop() }
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
