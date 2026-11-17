import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// Prejoin.native: the upper half shows the camera (or the avatar) with the
// room name, the lower half the microphone/camera toolbox, the display name
// and the "Join meeting" / "Join in low bandwidth mode" buttons. A short room
// name first shows UnsafeRoomWarning.native.
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
    property bool requestedAudioOnly: false
    property bool unsafeWarningOpen: unsafeRoomName
    readonly property bool unsafeRoomName: page.room && page.room.name && page.room.name.trim().length > 0 && page.room.name.trim().length <= 8

    function resetPreview() {
        page.joining = false
        page.previewUnavailable = false
        page.previewAllowed = true
    }

    function join(lowBandwidth) {
        if (page.joining) return
        if (!appState.saveProfile(nameField.text, appState.email)) {
            page.formError = appState.lastError
            return
        }
        page.requestedVideoOff = lowBandwidth || page.muteVideo
        page.requestedAudioOnly = lowBandwidth
        page.joining = true
        if (previewLoader.item) previewLoader.item.release()
        page.previewAllowed = false
        joinTimer.start()
    }

    // The camera is released first so that the call page can open it.
    Timer {
        id: joinTimer
        interval: 1500
        onTriggered: {
            if (!appState.startMeeting(page.room, page.muteAudio, page.requestedVideoOff, page.requestedAudioOnly)) {
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

    Rectangle { anchors.fill: parent; color: AppStyle.background }

    Item {
        id: viewport
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft

        ScreenHeader {
            id: header
            z: 2
            title: appState.t("prejoin.joinMeeting")
            showBack: true
            closeIcon: true
            onBackClicked: pageStack.pop()
        }

        // largeVideoContainer: 50 % of the screen.
        Item {
            id: largeVideo
            anchors { top: header.bottom; left: parent.left; right: parent.right }
            height: (viewport.height - header.height) / 2
            Avatar {
                anchors.centerIn: parent
                width: Math.min(parent.height * 0.6, 160)
                name: nameField.text
                imageUrl: appState.avatarUrl
            }
            Loader {
                id: previewLoader
                anchors.fill: parent
                // Unloaded on join: a stopped camera that stays loaded can start again
                // and keep the device from the call page (Aurora OS 5.1).
                active: !page.muteVideo && page.previewAllowed && !page.previewUnavailable
                source: Qt.resolvedUrl("../components/CameraPreview.qml")
                onLoaded: {
                    item.unavailable.connect(function() { page.previewUnavailable = true })
                    item.pageOrientation = Qt.binding(function() { return page.orientation })
                }
            }
            // conferenceInfo + displayRoomNameBackdrop
            Rectangle {
                anchors { top: parent.top; topMargin: 24; horizontalCenter: parent.horizontalCenter }
                width: Math.min(roomName.implicitWidth + 48, 273)
                height: roomName.height + 8
                radius: 6
                color: Qt.rgba(4 / 255, 4 / 255, 4 / 255, 0.7)
                // numberOfLines = 1: one line, ellipsis at the end.
                Label {
                    id: roomName
                    anchors.centerIn: parent
                    width: Math.min(implicitWidth, 273 - 48)
                    text: page.room ? page.room.name : ""
                    color: AppStyle.text
                    font.pixelSize: 20
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                    horizontalAlignment: Text.AlignHCenter
                }
            }
        }

        // contentContainer: the other half, content centred.
        Rectangle {
            anchors { top: largeVideo.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
            color: AppStyle.background
            Column {
                anchors.centerIn: parent
                width: Math.min(352, parent.width - 32)
                spacing: 0

                // toolboxContainer: ui01, radius 6, 60 dp, mic and camera buttons.
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 160
                    height: 60
                    radius: 6
                    color: AppStyle.surface
                    Row {
                        anchors.centerIn: parent
                        Repeater {
                            model: 2
                            delegate: BackgroundItem {
                                width: 80
                                height: 60
                                highlightedColor: "transparent"
                                Accessible.name: appState.t(index === 0 ? "toolbar.mute" : "toolbar.videomute")
                                Icon {
                                    anchors.centerIn: parent
                                    width: 32
                                    height: 32
                                    color: AppStyle.text
                                    source: Qt.resolvedUrl("../icons/" + (index === 0 ? (page.muteAudio ? "mic-slash" : "mic")
                                                                                     : (page.muteVideo ? "video-off" : "video")) + ".svg")
                                }
                                onClicked: {
                                    if (index === 0) page.muteAudio = !page.muteAudio
                                    else { page.muteVideo = !page.muteVideo; if (!page.muteVideo) page.previewUnavailable = false }
                                }
                            }
                        }
                    }
                }
                Item { width: 1; height: 24 }
                JitsiField {
                    id: nameField
                    width: parent.width
                    text: appState.displayName
                    placeholderText: appState.t("dialog.enterDisplayName")
                    onAccepted: page.join(false)
                }
                Item { width: 1; height: 24 }
                AppButton {
                    width: parent.width
                    type: "primary"
                    text: appState.t("prejoin.joinMeeting")
                    enabled: !page.joining
                    onClicked: page.join(false)
                }
                Item { width: 1; height: 24 }
                AppButton {
                    width: parent.width
                    type: "tertiary"
                    text: appState.t("prejoin.joinMeetingInLowBandwidthMode")
                    enabled: !page.joining
                    onClicked: page.join(true)
                }
                Label {
                    width: parent.width
                    visible: page.formError.length > 0
                    topPadding: 8
                    text: page.formError
                    color: AppStyle.error
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                    font.pixelSize: AppStyle.bodyShort
                }
            }
        }

        // UnsafeRoomWarning.native
        Rectangle {
            anchors.fill: parent
            z: 3
            visible: page.unsafeWarningOpen
            color: AppStyle.surface
            MouseArea { anchors.fill: parent }
            ScreenHeader {
                id: warningHeader
                title: appState.t("prejoin.joinMeeting")
                showBack: true
                closeIcon: true
                onBackClicked: pageStack.pop()
            }
            Rectangle {
                anchors { top: warningHeader.bottom; topMargin: 24; horizontalCenter: parent.horizontalCenter }
                width: Math.min(warningRoom.implicitWidth + 48, 273)
                height: warningRoom.height + 8
                radius: 6
                color: Qt.rgba(4 / 255, 4 / 255, 4 / 255, 0.7)
                Label {
                    id: warningRoom
                    anchors.centerIn: parent
                    width: Math.min(implicitWidth, 273 - 48)
                    text: page.room ? page.room.name : ""
                    color: AppStyle.text
                    font.pixelSize: 20
                    font.weight: Font.DemiBold
                    elide: Text.ElideRight
                    horizontalAlignment: Text.AlignHCenter
                }
            }
            Column {
                anchors.centerIn: parent
                width: parent.width - 64
                spacing: 32
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: 120
                    height: 120
                    radius: 60
                    color: "#F8AE1A"  // warning01
                    Icon {
                        anchors.centerIn: parent
                        width: 56
                        height: 56
                        source: Qt.resolvedUrl("../icons/warning.svg")
                        color: AppStyle.surface
                    }
                }
                Label {
                    width: parent.width
                    // getUnsafeRoomText(state, t, 'prejoin')
                    text: appState.t("security.insecureRoomNameWarningWeb", {
                        recommendAction: appState.t("security.unsafeRoomActions.prejoin"),
                        securityUrl: "https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi"
                    })
                    textFormat: Text.StyledText
                    linkColor: AppStyle.accent
                    onLinkActivated: pageStack.push(Qt.resolvedUrl("SecurityHelpPage.qml"), {address: link})
                    color: AppStyle.text
                    font.pixelSize: AppStyle.bodyShortLarge
                    lineHeight: 1.6
                    wrapMode: Text.Wrap
                    horizontalAlignment: Text.AlignHCenter
                }
                AppButton {
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Math.min(352, parent.width)
                    type: "secondary"
                    text: appState.t("prejoin.proceedAnyway")
                    onClicked: page.unsafeWarningOpen = false
                }
            }
        }
    }
}
