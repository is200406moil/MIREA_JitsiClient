import QtQuick 2.0
import Sailfish.Silica 1.0

// The application cover. During a meeting it shows the room, the meeting
// time and the microphone state, with cover actions for the microphone and
// leaving, like the cover of a call; otherwise the Jitsi Meet logo.
CoverBackground {
    id: cover
    objectName: "defaultCover"
    readonly property var meeting: __silica_applicationwindow_instance.activeMeeting
    property double now: Date.now()

    CoverTemplate {
        objectName: "applicationCover"
        visible: !cover.meeting
        primaryText: "Jitsi"
        secondaryText: "Meet"
        icon {
            source: Qt.resolvedUrl("../icons/Jitsi.png")
            sourceSize { width: icon.width; height: icon.height }
        }
    }

    Column {
        visible: !!cover.meeting
        x: Theme.paddingLarge
        y: Theme.paddingLarge
        width: parent.width - 2 * Theme.paddingLarge
        spacing: Theme.paddingSmall

        Image {
            width: Theme.iconSizeMedium
            height: width
            source: Qt.resolvedUrl("../icons/Jitsi.png")
            sourceSize { width: width; height: height }
        }
        Label {
            width: parent.width
            text: cover.meeting ? cover.meeting.roomName : ""
            wrapMode: Text.Wrap
            maximumLineCount: 3
            elide: Text.ElideRight
            font.pixelSize: Theme.fontSizeMedium
            color: Theme.primaryColor
        }
        Label {
            text: cover.meeting && cover.meeting.callStartedAt > 0
                  ? appState.formatDuration(cover.now - cover.meeting.callStartedAt) : ""
            font.pixelSize: Theme.fontSizeLarge
            color: Theme.highlightColor
        }
    }

    // The time is redrawn only while the cover is visible.
    Timer {
        interval: 1000
        repeat: true
        triggeredOnStart: true
        running: !!cover.meeting && cover.status === Cover.Active
        onTriggered: cover.now = Date.now()
    }

    // Outside a meeting: the tabs of the main screen (BottomNavigation).
    CoverActionList {
        enabled: !cover.meeting
        CoverAction {
            iconSource: Qt.resolvedUrl("../icons/cover-restore.svg")
            onTriggered: cover.openTab(0)
        }
        CoverAction {
            iconSource: Qt.resolvedUrl("../icons/cover-calendar.svg")
            onTriggered: cover.openTab(1)
        }
        CoverAction {
            iconSource: Qt.resolvedUrl("../icons/cover-gear.svg")
            onTriggered: cover.openTab(2)
        }
    }

    function openTab(index) {
        var main = pageStack.find(function(page) { return page.objectName === "mainPage" })
        if (main) {
            pageStack.pop(main, PageStackAction.Immediate)
            main.selectedTab = index
        }
        __silica_applicationwindow_instance.activate()
    }

    CoverActionList {
        enabled: !!cover.meeting
        CoverAction {
            iconSource: cover.meeting && cover.meeting.callAudioMuted
                        ? "image://theme/icon-cover-mute" : "image://theme/icon-cover-mic"
            onTriggered: if (cover.meeting) cover.meeting.toggleAudio()
        }
        CoverAction {
            iconSource: "image://theme/icon-cover-hangup"
            onTriggered: if (cover.meeting) cover.meeting.hangup()
        }
    }
}
