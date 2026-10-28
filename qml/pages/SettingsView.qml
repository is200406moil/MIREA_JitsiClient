import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

SilicaFlickable {
    id: view
    property string serverError
    property bool ready: false
    contentHeight: body.height + Theme.paddingLarge
    Component.onCompleted: ready = true
    function saveServer() {
        if (!ready || serverField.text === appState.server) return
        if (!appState.saveSettings(serverField.text, appState.audioMuted, appState.videoMuted)) serverError = appState.lastError
        else { serverError = ""; serverField.text = appState.server }
    }
    Column {
        id: body
        width: parent.width
        ListItem {
            width: parent.width
            contentHeight: Theme.itemSizeExtraLarge + Theme.paddingLarge
            onClicked: pageStack.push(Qt.resolvedUrl("ProfilePage.qml"), {mainPage: pageStack.currentPage})
            Avatar {
                id: avatar
                x: Theme.horizontalPageMargin
                anchors.verticalCenter: parent.verticalCenter
                width: Theme.itemSizeLarge
                name: appState.displayName
                imageUrl: appState.avatarUrl
            }
            Column {
                x: avatar.x + avatar.width + Theme.paddingLarge
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - x - Theme.itemSizeSmall
                Label { width: parent.width; text: appState.displayName || qsTr("Профиль"); truncationMode: TruncationMode.Fade }
            }
            Icon {
                anchors { right: parent.right; rightMargin: Theme.horizontalPageMargin; verticalCenter: parent.verticalCenter }
                source: Qt.resolvedUrl("../icons/arrow-right.svg")
                width: Theme.iconSizeSmall; height: width; color: Theme.secondaryColor
            }
        }
        SettingToggle { text: qsTr("Скрыть собственное представление"); preferenceKey: "hideSelfView" }
        ComboBox {
            width: parent.width
            label: qsTr("Язык")
            currentIndex: appState.preferences.language === "en" ? 1 : 0
            menu: ContextMenu {
                MenuItem { text: "Русский"; onClicked: appState.setPreference("language", "ru") }
                MenuItem { text: "English"; onClicked: appState.setPreference("language", "en") }
            }
        }
        SettingSection { text: qsTr("Номера для набора") }
        TextField {
            id: serverField
            width: parent.width
            text: appState.server
            label: qsTr("Адрес сервера")
            placeholderText: "https://meet.jit.si"
            inputMethodHints: Qt.ImhUrlCharactersOnly | Qt.ImhNoAutoUppercase
            onFocusChanged: if (!focus) view.saveServer()
            EnterKey.iconSource: "image://theme/icon-m-enter-accept"
            EnterKey.onClicked: { view.saveServer(); focus = false }
        }
        Label {
            x: Theme.horizontalPageMargin; width: parent.width - 2*x
            visible: view.serverError.length > 0
            text: view.serverError; wrapMode: Text.Wrap; color: Theme.highlightColor
            font.pixelSize: Theme.fontSizeSmall
        }
        SettingToggle {
            text: qsTr("Включать упрощённый режим на ограниченном канале")
            preferenceKey: "lowBandwidth"
        }
        SettingToggle { text: qsTr("Начать с отключённым звуком"); preferenceKey: "audioMuted" }
        SettingToggle { text: qsTr("Начать с отключённым видео"); preferenceKey: "videoMuted" }
        SettingSection { text: qsTr("Включить звук") }
        SettingToggle { text: qsTr("Реакции на встречи"); preferenceKey: "soundReactions" }
        SettingToggle { text: qsTr("Входящее сообщение"); preferenceKey: "soundMessage" }
        SettingToggle { text: qsTr("Участник присоединился"); preferenceKey: "soundJoined" }
        SettingToggle { text: qsTr("Участник вышел"); preferenceKey: "soundLeft" }
        SettingToggle { text: qsTr("Говорите без звука"); preferenceKey: "soundTalkMuted" }
        SettingToggle { text: qsTr("Участник вошёл в лобби"); preferenceKey: "soundLobby" }
        SettingSection { text: qsTr("Отображение уведомлений для") }
        SettingToggle { text: qsTr("Сообщения чата"); preferenceKey: "chatNotifications" }
        SettingSection { text: qsTr("Дополнительные") }
        SettingToggle { text: qsTr("Отключить режим Peer-To-Peer"); preferenceKey: "disableP2p" }
        SettingToggle { text: qsTr("Отключить отправку отчётов о сбоях"); locked: true }
        SettingSection { text: qsTr("Информация о сборке") }
        DetailItem { label: qsTr("Версия"); value: "0.1.24" }
        Row {
            width: parent.width
            Repeater {
                model: [qsTr("Помощь"), qsTr("Условия"), qsTr("Конфиденциальность")]
                delegate: BackgroundItem {
                    width: body.width/3
                    height: Math.max(Theme.itemSizeLarge, linkText.implicitHeight + 2*Theme.paddingMedium)
                    Accessible.name: modelData
                    Label {
                        id: linkText
                        anchors.centerIn: parent
                        width: parent.width - 2*Theme.paddingSmall
                        text: modelData; wrapMode: Text.Wrap
                        horizontalAlignment: Text.AlignHCenter
                        color: Theme.highlightColor; font.pixelSize: Theme.fontSizeExtraSmall
                    }
                    onClicked: {
                        Qt.openUrlExternally(index === 0 ? "https://jitsi.org/user-faq/"
                                             : index === 1 ? "https://jitsi.org/meet-jit-si-terms-of-service/"
                                             : "https://jitsi.org/meet-jit-si-privacy/")
                    }
                }
            }
        }
    }
    VerticalScrollDecorator {}
}
