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
    function resetPreview() {
        page.joining = false
        page.previewUnavailable = false
        page.previewAllowed = true
    }
    function join(withoutVideo) {
        if (page.joining) return
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
    SilicaFlickable {
        anchors.fill: parent
        contentHeight: body.height + Theme.paddingLarge
        Column {
            id: body
            width: parent.width
            spacing: Theme.paddingLarge
            ScreenHeader {
                title: qsTr("Присоединиться к встрече")
                showBack: true
                onBackClicked: pageStack.pop()
            }
            Rectangle {
                width: parent.width
                height: page.isLandscape ? Theme.itemSizeExtraLarge*1.5 : Theme.itemSizeExtraLarge*2.5
                color: Theme.rgba(Theme.primaryColor, 0.05)
                Label {
                    x: Theme.horizontalPageMargin
                    y: Theme.paddingMedium
                    width: parent.width-2*x
                    text: page.room.name
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                    font.pixelSize: Theme.fontSizeLarge
                }
                Avatar {
                    anchors.centerIn: parent
                    width: Theme.itemSizeExtraLarge
                    name: nameField.text
                    imageUrl: appState.avatarUrl
                }
                Loader {
                    id: previewLoader
                    anchors.fill: parent
                    active: !page.muteVideo && page.previewAllowed && !page.previewUnavailable
                    source: Qt.resolvedUrl("../components/CameraPreview.qml")
                    onLoaded: item.unavailable.connect(function() { page.previewUnavailable = true })
                }
            }
            Row {
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: Theme.paddingLarge
                IconButton {
                    width: Theme.itemSizeMedium
                    height: width
                    icon.width: Theme.iconSizeMedium
                    icon.height: Theme.iconSizeMedium
                    icon.source: Qt.resolvedUrl("../icons/" + (page.muteAudio ? "mic-slash" : "mic") + ".svg")
                    icon.color: page.muteAudio ? Theme.secondaryColor : Theme.highlightColor
                    Accessible.name: page.muteAudio ? qsTr("Включить микрофон") : qsTr("Выключить микрофон")
                    onClicked: page.muteAudio = !page.muteAudio
                }
                IconButton {
                    width: Theme.itemSizeMedium
                    height: width
                    icon.width: Theme.iconSizeMedium
                    icon.height: Theme.iconSizeMedium
                    icon.source: Qt.resolvedUrl("../icons/" + (page.muteVideo ? "video-off" : "video") + ".svg")
                    icon.color: page.muteVideo ? Theme.secondaryColor : Theme.highlightColor
                    Accessible.name: page.muteVideo ? qsTr("Включить камеру") : qsTr("Выключить камеру")
                    onClicked: {
                        page.muteVideo = !page.muteVideo
                        if (!page.muteVideo) page.previewUnavailable = false
                    }
                }
            }
            TextField {
                id: nameField
                width: parent.width
                text: appState.displayName
                label: qsTr("Ваше имя")
                placeholderText: qsTr("Пожалуйста, введите своё имя")
                EnterKey.iconSource: "image://theme/icon-m-enter-accept"
                EnterKey.onClicked: page.join(false)
            }
            Label {
                x: Theme.horizontalPageMargin; width: parent.width-2*x
                text: page.formError; visible: text.length > 0
                color: Theme.highlightColor; wrapMode: Text.Wrap; font.pixelSize: Theme.fontSizeSmall
            }
            Button {
                anchors.horizontalCenter: parent.horizontalCenter
                preferredWidth: parent.width - 2*Theme.horizontalPageMargin
                text: qsTr("Присоединиться к встрече")
                enabled: nameField.text.trim().length > 0
                onClicked: page.join(false)
            }
            BackgroundItem {
                width: parent.width
                height: Theme.itemSizeMedium
                enabled: nameField.text.trim().length > 0
                Accessible.name: qsTr("Присоединиться без видео")
                Label {
                    anchors.centerIn: parent
                    text: qsTr("Присоединиться без видео")
                    color: Theme.highlightColor
                    font.pixelSize: Theme.fontSizeSmall
                }
                onClicked: page.join(true)
            }
        }
        VerticalScrollDecorator {}
    }
}
