import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// ProfileView.native: avatar, display name and email inputs, the Gravatar
// note and the Apply button at the bottom; the tab bar stays visible.
Page {
    id: page
    allowedOrientations: Orientation.All
    property var mainPage
    property string error

    Item {
        id: viewport
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }

        ScreenHeader {
            id: header
            title: appState.t("settingsView.profileSection")
            showBack: true
            onBackClicked: pageStack.pop()
        }
        BottomNavigation {
            id: navigation
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            selectedTab: 2
            onTabSelected: {
                if (page.mainPage) page.mainPage.selectedTab = index
                pageStack.pop()
            }
        }
        AppButton {
            id: applyButton
            anchors { left: parent.left; right: parent.right; bottom: navigation.top; leftMargin: 32; rightMargin: 32; bottomMargin: 24 }
            type: "primary"
            text: appState.t("settingsView.apply")
            onClicked: {
                if (appState.saveProfile(nameField.text, emailField.text)) pageStack.pop()
                else page.error = appState.lastError
            }
        }
        SilicaFlickable {
            anchors { left: parent.left; right: parent.right; top: header.bottom; bottom: applyButton.top }
            contentHeight: body.height
            clip: true
            Column {
                id: body
                width: parent.width
                // avatarContainer: padding 24, margin 32
                Item {
                    width: parent.width
                    height: 64 + 2 * 24 + 2 * 32
                    Avatar {
                        anchors.centerIn: parent
                        width: 64
                        name: nameField.text
                        imageUrl: appState.avatarUrl
                    }
                }
                JitsiField {
                    id: nameField
                    x: 32
                    width: parent.width - 64
                    label: appState.t("settingsView.displayName")
                    text: appState.displayName
                    placeholderText: appState.t("settingsView.displayNamePlaceholderText")
                    onAccepted: emailField.focusEditor()
                }
                Item { width: 1; height: 24 }
                JitsiField {
                    id: emailField
                    x: 32
                    width: parent.width - 64
                    label: appState.t("settingsView.email")
                    text: appState.email
                    placeholderText: appState.t("settingsView.emailPlaceholderText")
                    error: page.error.length > 0
                    inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
                }
                Item { width: 1; height: 16 }
                Label {
                    x: 32
                    width: parent.width - 64
                    text: page.error.length > 0 ? page.error : appState.t("settingsView.gavatarMessage")
                    color: page.error.length > 0 ? AppStyle.error : AppStyle.muted
                    font.pixelSize: AppStyle.bodyShort
                    wrapMode: Text.Wrap
                }
            }
            VerticalScrollDecorator {}
        }
    }
}
