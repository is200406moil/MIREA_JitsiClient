import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

Page {
    id: page
    objectName: "preJoinPage"
    allowedOrientations: Orientation.All
    property var room
    property bool muteAudio: appState.audioMuted
    property bool muteVideo: appState.videoMuted || appState.preferences.lowBandwidth
    property string formError
    property bool joining: false
    property bool previewAllowed: true
    property bool previewUnavailable: false
    property bool requestedVideoOff: false
    property bool unsafeWarningOpen: false
    property bool unsafeWarningAccepted: false
    property bool pendingWithoutVideo: false
    readonly property bool unsafeRoomName: page.room && page.room.name && page.room.name.trim().length > 0 && page.room.name.trim().length <= 8
    Rectangle { anchors.fill: parent; color: AppStyle.background }
    function resetPreview() {
        page.joining = false
        page.previewUnavailable = false
        page.previewAllowed = true
    }
    function join(withoutVideo) {
        if (page.joining) return
        if (page.unsafeRoomName && !page.unsafeWarningAccepted) {
            page.pendingWithoutVideo = withoutVideo
            page.unsafeWarningOpen = true
            return
        }
        if (!appState.saveProfile(nameField.text, appState.email)) {
            page.formError = appState.lastError
            return
        }
        page.requestedVideoOff = withoutVideo || page.muteVideo
        page.joining = true
        if (previewLoader.item) previewLoader.item.release()
        page.previewAllowed = false
        joinTimer.start()
    }
    Timer {
        id: joinTimer
        interval: 1500
        onTriggered: {
            if (!appState.startMeeting(page.room, page.muteAudio, page.requestedVideoOff)) {
                page.joining = false
                page.previewAllowed = true
                page.formError = appState.lastError
                return
            }
        pageStack.push(Qt.resolvedUrl("RoomPage.qml"), {
            roomName: page.room.name, serverAddress: page.room.server,
            initialAudioMuted: page.muteAudio, initialVideoMuted: page.requestedVideoOff,
            previousPage: page
        })
        }
    }
    Item {
    id: viewport
    width: page.width / 2
    height: page.height / 2
    scale: 2
    transformOrigin: Item.TopLeft
    SilicaFlickable {
        anchors.fill: parent
        contentHeight: body.height + 16
        Column {
            id: body
            width: parent.width
            spacing: 16
            Item {
                width: parent.width; height: 56
                Rectangle { anchors.fill: parent; color: AppStyle.surface }
                BackgroundItem {
                    width: 72; height: parent.height
                    Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 16 }
                    onClicked: pageStack.pop()
                }
                Label {
                    anchors.centerIn: parent
                    text: qsTr("Присоединиться к встрече")
                    color: AppStyle.text; font.pixelSize: 16
                }
            }
            Rectangle {
                width: parent.width
                height: page.isLandscape ? viewport.height * 0.35 : Math.min(viewport.width * 0.95, viewport.height * 0.47)
                color: AppStyle.surface
                Avatar {
                    anchors.centerIn: parent
                    width: 80
                    name: nameField.text
                    imageUrl: appState.avatarUrl
                }
                Loader {
                    id: previewLoader
                    anchors.fill: parent
                    active: !page.muteVideo && (page.previewAllowed || page.joining) && !page.previewUnavailable
                    source: Qt.resolvedUrl("../components/CameraPreview.qml")
                    onLoaded: item.unavailable.connect(function() { page.previewUnavailable = true })
                }
                Rectangle {
                    anchors { top: parent.top; topMargin: 16; horizontalCenter: parent.horizontalCenter }
                    width: Math.min(parent.width - 32, roomCaption.implicitWidth + 24)
                    height: 38
                    radius: 6
                    color: "#AA000000"
                    Label {
                        id: roomCaption
                        anchors.centerIn: parent
                        width: parent.width - 24
                        text: page.room.name
                        color: AppStyle.text
                        font.pixelSize: 18
                        horizontalAlignment: Text.AlignHCenter
                        truncationMode: TruncationMode.Fade
                    }
                }
            }
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: 8
                IconButton {
                    width: 56
                    height: width
                    icon.width: 24
                    icon.height: 24
                    icon.source: Qt.resolvedUrl("../icons/" + (page.muteAudio ? "mic-slash" : "mic") + ".svg")
                    icon.color: page.muteAudio ? AppStyle.inactive : AppStyle.text
                    Accessible.name: page.muteAudio ? qsTr("Включить микрофон") : qsTr("Выключить микрофон")
                    onClicked: page.muteAudio = !page.muteAudio
                }
                IconButton {
                    width: 56
                    height: width
                    icon.width: 24
                    icon.height: 24
                    icon.source: Qt.resolvedUrl("../icons/" + (page.muteVideo ? "video-off" : "video") + ".svg")
                    icon.color: page.muteVideo ? AppStyle.inactive : AppStyle.text
                    Accessible.name: page.muteVideo ? qsTr("Включить камеру") : qsTr("Выключить камеру")
                    onClicked: {
                        page.muteVideo = !page.muteVideo
                        if (!page.muteVideo) page.previewUnavailable = false
                    }
                }
            }
            JitsiField {
                id: nameField
                x: 16
                width: parent.width - 32
                text: appState.displayName
                placeholderText: qsTr("Пожалуйста, введите своё имя")
                centered: true
                onAccepted: page.join(false)
            }
            Label {
                x: 16; width: parent.width-32
                text: page.formError; visible: text.length > 0
                color: AppStyle.danger; wrapMode: Text.Wrap; font.pixelSize: 14
            }
            AppButton {
                x: 16
                width: parent.width - 32
                text: qsTr("Присоединиться к встрече")
                enabled: nameField.text.trim().length > 0
                onClicked: page.join(false)
            }
            BackgroundItem {
                width: parent.width
                height: 48
                enabled: nameField.text.trim().length > 0
                Accessible.name: qsTr("Присоединиться без видео")
                Label {
                    anchors.centerIn: parent
                    text: qsTr("Присоединиться без видео")
                    color: AppStyle.text
                    font.pixelSize: 16
                }
                onClicked: page.join(true)
            }
        }
        VerticalScrollDecorator {}
    }
    }
    Item {
        id: unsafeWarning
        anchors.fill: parent
        z: 100
        visible: page.unsafeWarningOpen
        Rectangle { anchors.fill: parent; color: AppStyle.surface }
        Rectangle {
            width: parent.width; height: 90; color: AppStyle.surface
            BackgroundItem {
                width: 150; height: parent.height
                Accessible.role: Accessible.Button
                Accessible.name: qsTr("Закрыть")
                Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 30 }
                onClicked: page.unsafeWarningOpen = false
            }
            Label {
                anchors.centerIn: parent
                text: qsTr("Присоединиться к встрече")
                color: AppStyle.text
                font.pixelSize: 32
            }
        }
        Label {
            anchors { top: parent.top; topMargin: 125; horizontalCenter: parent.horizontalCenter }
            text: page.room ? page.room.name : ""
            color: AppStyle.muted
            font.pixelSize: 32
            font.bold: true
        }
        Rectangle {
            width: 180; height: 180; radius: 90
            anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: parent.height * 0.30 }
            color: "#FFB518"
            Icon { anchors.centerIn: parent; source: Qt.resolvedUrl("../icons/warning.svg"); width: 95; height: 95; color: "#111111" }
        }
        Label {
            x: 40
            y: parent.height * 0.49
            width: parent.width - 80
            text: qsTr("Название комнаты небезопасно. Нежелательные участники могут присоединиться к вашей встрече. Рассмотрите возможность использования более уникального имени встречи. Узнайте больше о защите вашей встречи <a href=\"https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi\">here</a>.")
            textFormat: Text.RichText
            onLinkActivated: pageStack.push(Qt.resolvedUrl("SecurityHelpPage.qml"), {address: link})
            color: AppStyle.text
            font.pixelSize: 29
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignHCenter
        }
        BackgroundItem {
            x: 40
            y: parent.height * 0.76
            width: parent.width - 80
            height: 88
            Accessible.role: Accessible.Button
            Accessible.name: qsTr("Продолжить в любом случае")
            Rectangle { anchors.fill: parent; radius: 7; color: "#E4E4E4" }
            Label { anchors.centerIn: parent; text: qsTr("Продолжить в любом случае"); color: "#111111"; font.pixelSize: 28; font.bold: true }
            onClicked: {
                page.unsafeWarningOpen = false
                page.unsafeWarningAccepted = true
                page.join(page.pendingWithoutVideo)
            }
        }
    }
}
