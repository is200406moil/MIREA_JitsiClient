import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

Page {
    id: page
    allowedOrientations: Orientation.All
    property var mainPage
    property string error
    BottomNavigation {
        id: navigation
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        selectedTab: 2
        onTabSelected: {
            if (page.mainPage) page.mainPage.selectedTab = index
            pageStack.pop()
        }
    }
    Button {
        id: applyButton
        anchors { horizontalCenter: parent.horizontalCenter; bottom: navigation.top; bottomMargin: Theme.paddingMedium }
        preferredWidth: parent.width - 2*Theme.horizontalPageMargin
        text: qsTr("Применить")
        onClicked: {
            if (appState.saveProfile(nameField.text, emailField.text)) pageStack.pop()
            else page.error = appState.lastError
        }
    }
    SilicaFlickable {
        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: applyButton.top }
        contentHeight: body.height + Theme.paddingLarge
        Column {
            id: body
            width: parent.width
            ScreenHeader { title: qsTr("Профиль"); showBack: true; onBackClicked: pageStack.pop() }
            Item { width: 1; height: Theme.paddingLarge }
            Avatar {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Theme.itemSizeExtraLarge
                name: nameField.text
                imageUrl: appState.avatarUrl
            }
            Item { width: 1; height: Theme.itemSizeSmall }
            Label {
                x: Theme.horizontalPageMargin; width: parent.width-2*x
                text: qsTr("Отображаемое имя")
            }
            TextField {
                id: nameField; width: parent.width
                text: appState.displayName; placeholderText: qsTr("Отображаемое имя")
                EnterKey.iconSource: "image://theme/icon-m-enter-next"
                EnterKey.onClicked: emailField.focus = true
            }
            Item { width: 1; height: Theme.paddingLarge }
            Label {
                x: Theme.horizontalPageMargin; width: parent.width-2*x
                text: "Email"
            }
            TextField {
                id: emailField; width: parent.width
                text: appState.email; placeholderText: "email@example.com"
                inputMethodHints: Qt.ImhEmailCharactersOnly | Qt.ImhNoAutoUppercase
            }
            Item { width: 1; height: Theme.paddingSmall }
            Label {
                x: Theme.horizontalPageMargin; width: parent.width-2*x
                text: qsTr("Если ваш email связан с аккаунтом Gravatar, мы будем использовать его в качестве изображения вашего профиля.")
                color: Theme.secondaryColor; font.pixelSize: Theme.fontSizeSmall; wrapMode: Text.Wrap
            }
            Label {
                x: Theme.horizontalPageMargin; width: parent.width-2*x
                visible: page.error.length > 0
                text: page.error; color: Theme.highlightColor; wrapMode: Text.Wrap
            }
        }
        VerticalScrollDecorator {}
    }
}
