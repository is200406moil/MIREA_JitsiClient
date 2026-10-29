import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

SilicaFlickable {
    id: view
    property string serverError
    property bool ready: false
    contentHeight: body.height + 16
    Component.onCompleted: ready = true

    function saveServer() {
        if (!ready || serverField.text === appState.server) return
        if (!appState.saveSettings(serverField.text, appState.audioMuted, appState.videoMuted))
            serverError = appState.lastError
        else {
            serverError = ""
            serverField.text = appState.server
        }
    }

    Rectangle { anchors.fill: parent; color: AppStyle.surface }
    Column {
        id: body
        width: parent.width

        Item { width: 1; height: 16 }
        BackgroundItem {
            x: 16
            width: parent.width - 32
            height: 96
            onClicked: pageStack.push(Qt.resolvedUrl("ProfilePage.qml"), {mainPage: pageStack.currentPage})
            Rectangle { anchors.fill: parent; radius: 6; color: AppStyle.raised }
            Avatar {
                id: avatar
                x: 16
                anchors.verticalCenter: parent.verticalCenter
                width: 64
                name: appState.displayName
                imageUrl: appState.avatarUrl
            }
            Label {
                x: 96
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width - 136
                text: appState.displayName
                color: AppStyle.text
                font.pixelSize: 16
                truncationMode: TruncationMode.Fade
            }
            Icon {
                anchors { right: parent.right; rightMargin: 16; verticalCenter: parent.verticalCenter }
                source: Qt.resolvedUrl("../icons/arrow-right.svg")
                width: 24; height: width; color: AppStyle.text
            }
        }
        Item { width: 1; height: 16 }
        SettingToggle { text: qsTr("Скрыть собственное представление"); preferenceKey: "hideSelfView" }
        BackgroundItem {
            width: parent.width
            height: 56
            onClicked: pageStack.push(Qt.resolvedUrl("LanguagePage.qml"), {mainPage: pageStack.currentPage})
            Label {
                x: 16
                anchors.verticalCenter: parent.verticalCenter
                text: qsTr("Язык")
                color: AppStyle.text; font.pixelSize: 16
            }
            Icon {
                anchors { right: parent.right; rightMargin: 16; verticalCenter: parent.verticalCenter }
                source: Qt.resolvedUrl("../icons/arrow-right.svg")
                width: 20; height: width; color: AppStyle.text
            }
            Label {
                anchors { right: parent.right; rightMargin: 42; verticalCenter: parent.verticalCenter }
                text: appState.preferences.language === "en" ? "English" : "Русский"
                color: AppStyle.text; font.pixelSize: 16
            }
        }
        SettingSection { text: qsTr("Номера для набора") }
        Label {
            x: 16; width: parent.width - 32
            text: qsTr("Адрес сервера")
            color: AppStyle.text; font.pixelSize: 16
        }
        Item { width: 1; height: 8 }
        JitsiField {
            id: serverField
            x: 16; width: parent.width - 32
            text: appState.server
            placeholderText: "https://meet.jit.si"
            inputMethodHints: Qt.ImhUrlCharactersOnly | Qt.ImhNoAutoUppercase
            onFieldActiveFocusChanged: if (!fieldActiveFocus) view.saveServer()
            onAccepted: view.saveServer()
        }
        Label {
            x: 16; width: parent.width - 32
            visible: view.serverError.length > 0
            text: view.serverError
            color: AppStyle.danger; wrapMode: Text.Wrap; font.pixelSize: 14
        }
        Item { width: 1; height: 8 }
        SettingToggle { text: qsTr("Включать упрощённый режим на ограниченном канале"); preferenceKey: "lowBandwidth" }
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
        Item {
            width: parent.width; height: 56
            Label { x: 16; anchors.verticalCenter: parent.verticalCenter; text: qsTr("Версия"); color: AppStyle.text; font.pixelSize: 16 }
            Label { anchors { right: parent.right; rightMargin: 16; verticalCenter: parent.verticalCenter } text: "0.1.43"; color: AppStyle.muted; font.pixelSize: 14 }
        }
        Row {
            width: parent.width; height: 56
            Repeater {
                model: [qsTr("Помощь"), qsTr("Условия"), qsTr("Конфиденциальность")]
                delegate: BackgroundItem {
                    width: body.width / 3; height: 56
                    Label { anchors.centerIn: parent; width: parent.width - 8; text: modelData; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap; color: AppStyle.text; font.pixelSize: 14; font.bold: true }
                    onClicked: Qt.openUrlExternally(index === 0 ? "https://jitsi.org/user-faq/" : index === 1 ? "https://jitsi.org/meet-jit-si-terms-of-service/" : "https://jitsi.org/meet-jit-si-privacy/")
                }
            }
        }
    }
    VerticalScrollDecorator {}
}
