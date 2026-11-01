import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

Page {
    id: page
    objectName: "preJoinPage"
    allowedOrientations: Orientation.All
    property var room
    property var mainPage
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
    Component.onCompleted: page.unsafeWarningOpen = page.unsafeRoomName
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
            previousPage: page, returnPage: page.mainPage
        })
        }
    }
    Item {
    id: viewport
    width: page.width / 2
    height: page.height / 2
    scale: 2
    transformOrigin: Item.TopLeft
    Item {
        anchors.fill: parent
        Item {
            id: header
            width: parent.width; height: 56
            Rectangle { anchors.fill: parent; color: AppStyle.surface }
            BackgroundItem {
                width: 40; height: parent.height
                Label { anchors.centerIn: parent; text: "×"; color: AppStyle.text; font.pixelSize: 24 }
                onClicked: pageStack.pop()
            }
            Label { x: 40; anchors.verticalCenter: parent.verticalCenter; text: qsTr("Присоединиться к встрече"); color: AppStyle.text; font.pixelSize: 16; font.bold: true }
        }
        Rectangle {
            id: preview
            anchors.top: header.bottom
            width: parent.width
            height: page.isLandscape ? viewport.height * 0.35 : viewport.height * 0.47
            color: page.muteVideo ? AppStyle.background : AppStyle.surface
            Avatar { anchors.centerIn: parent; width: Math.min(parent.width / 3, 144); name: nameField.text; imageUrl: appState.avatarUrl }
            Loader {
                id: previewLoader
                anchors.fill: parent
                active: !page.muteVideo && (page.previewAllowed || page.joining) && !page.previewUnavailable
                source: Qt.resolvedUrl("../components/CameraPreview.qml")
                onLoaded: item.unavailable.connect(function() { page.previewUnavailable = true })
            }
            Rectangle {
                anchors { top: parent.top; topMargin: 16; horizontalCenter: parent.horizontalCenter }
                width: roomCaption.implicitWidth + 24; height: 32; radius: 4
                color: page.muteVideo ? "transparent" : "#AA000000"
                Label { id: roomCaption; anchors.centerIn: parent; text: page.room.name; color: AppStyle.muted; font.pixelSize: 16; font.bold: true }
            }
        }
        Rectangle {
            y: viewport.height * 0.64
            anchors.horizontalCenter: parent.horizontalCenter
            width: 112; height: 48; radius: 4; color: AppStyle.surface
            Row {
                anchors.fill: parent
                Repeater {
                    model: 2
                    delegate: BackgroundItem {
                        width: 56; height: 48
                        Icon { anchors.centerIn: parent; width: 24; height: 24; color: AppStyle.text; source: Qt.resolvedUrl("../icons/" + (index === 0 ? (page.muteAudio ? "mic-slash" : "mic") : (page.muteVideo ? "video-off" : "video")) + ".svg") }
                        onClicked: {
                            if (index === 0) page.muteAudio = !page.muteAudio
                            else { page.muteVideo = !page.muteVideo; if (!page.muteVideo) page.previewUnavailable = false }
                        }
                    }
                }
            }
        }
        JitsiField {
            id: nameField
            y: viewport.height * 0.72
            anchors.horizontalCenter: parent.horizontalCenter
            width: parent.width * 0.585
            text: appState.displayName
            placeholderText: qsTr("Пожалуйста, введите свое имя")
            centered: true
            onAccepted: page.join(false)
        }
        AppButton {
            y: viewport.height * 0.78
            anchors.horizontalCenter: parent.horizontalCenter
            width: parent.width * 0.585; height: 40
            text: qsTr("Присоединиться к встрече")
            enabled: !page.joining
            onClicked: page.join(false)
        }
        BackgroundItem {
            y: viewport.height * 0.84
            anchors.horizontalCenter: parent.horizontalCenter
            width: parent.width * 0.585; height: 40
            enabled: !page.joining
            Label { anchors.centerIn: parent; text: qsTr("Присоединиться без видео"); color: AppStyle.text; font.pixelSize: 12 }
            onClicked: page.join(true)
        }
        Label { x: 16; y: viewport.height * 0.91; width: parent.width - 32; text: page.formError; visible: text.length > 0; color: AppStyle.danger; wrapMode: Text.Wrap; font.pixelSize: 12 }
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
                width: 80; height: parent.height
                Accessible.role: Accessible.Button
                Accessible.name: qsTr("Закрыть")
                Label { anchors.centerIn: parent; text: "×"; color: AppStyle.text; font.pixelSize: 48 }
                onClicked: pageStack.pop()
            }
            Label {
                x: 80; anchors.verticalCenter: parent.verticalCenter
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
            width: 160; height: 160; radius: 80
            anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: parent.height * 0.38 }
            color: "#FFB518"
            Icon { anchors.centerIn: parent; source: Qt.resolvedUrl("../icons/warning.svg"); width: 95; height: 95; color: "#111111" }
        }
        Label {
            id: unsafeWarningText
            x: 40
            y: parent.height * 0.50
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
            y: Math.max(parent.height * 0.65, unsafeWarningText.y + unsafeWarningText.height + 48)
            width: parent.width - 80
            height: 88
            Accessible.role: Accessible.Button
            Accessible.name: qsTr("Продолжить в любом случае")
            Rectangle { anchors.fill: parent; radius: 7; color: "#E4E4E4" }
            Label { anchors.centerIn: parent; text: qsTr("Продолжить в любом случае"); color: "#111111"; font.pixelSize: 24 }
            onClicked: {
                page.unsafeWarningOpen = false
                page.unsafeWarningAccepted = true
            }
        }
    }
}
