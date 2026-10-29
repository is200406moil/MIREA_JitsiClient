import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

Page {
    id: page
    allowedOrientations: Orientation.All
    property var mainPage
    property string error
    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    Item {
    id: viewport
    width: page.width / 2
    height: page.height / 2
    scale: 2
    transformOrigin: Item.TopLeft
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
        anchors { horizontalCenter: parent.horizontalCenter; bottom: navigation.top; bottomMargin: 16 }
        width: parent.width - 32
        text: qsTr("Применить")
        onClicked: {
            if (appState.saveProfile(nameField.text, emailField.text)) pageStack.pop()
            else page.error = appState.lastError
        }
    }
    SilicaFlickable {
        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: applyButton.top }
        contentHeight: body.height + 16
        Column {
            id: body
            width: parent.width
            ScreenHeader { title: qsTr("Профиль"); showBack: true; onBackClicked: pageStack.pop() }
            Item { width: 1; height: 16 }
            Avatar {
                anchors.horizontalCenter: parent.horizontalCenter
                width: 64
                name: nameField.text
                imageUrl: appState.avatarUrl
            }
            Item { width: 1; height: 40 }
            Label {
                x: 16; width: parent.width-32
                text: qsTr("Отображаемое имя")
                color: AppStyle.text; font.pixelSize: 16
            }
            Item { width: 1; height: 8 }
            JitsiField {
                id: nameField; x: 16; width: parent.width-32
                text: appState.displayName; placeholderText: qsTr("Отображаемое имя")
                onAccepted: emailField.focusEditor()
            }
            Item { width: 1; height: 24 }
            Label {
                x: 16; width: parent.width-32
                text: "Email"
                color: AppStyle.text; font.pixelSize: 16
            }
            Item { width: 1; height: 8 }
            JitsiField {
                id: emailField; x: 16; width: parent.width-32
                text: appState.email; placeholderText: "email@example.com"
                inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
            }
            Item { width: 1; height: 8 }
            Label {
                x: 16; width: parent.width-32
                text: qsTr("Если ваш email связан с аккаунтом Gravatar, мы будем использовать его в качестве изображения вашего профиля.")
                color: AppStyle.muted; font.pixelSize: 14; wrapMode: Text.Wrap
            }
            Label {
                x: 16; width: parent.width-32
                visible: page.error.length > 0
                text: page.error; color: AppStyle.danger; wrapMode: Text.Wrap
            }
        }
        VerticalScrollDecorator {}
    }
    }
}
