import QtQuick 2.0
import Sailfish.Silica 1.0
import "../components"

// The application cover, in the manner of the system covers (the Calendar):
// - in a meeting: a live mark, the room, the meeting time and the
//   microphone, with cover actions for the microphone and leaving;
// - otherwise the next planned meetings (the day, the time, the title), or
//   the recent rooms when nothing is planned, or the logo with an invitation
//   to start; the cover actions open the tabs of the main screen.
CoverBackground {
    id: cover
    objectName: "defaultCover"
    readonly property var meeting: __silica_applicationwindow_instance.activeMeeting
    property double now: Date.now()
    readonly property real actionsHeight: cover.coverActionArea ? cover.coverActionArea.height
                                                                 : Theme.itemSizeSmall
    readonly property var upcoming: appState.scheduled.filter(function(meeting) {
        return meeting.start + meeting.minutes * 60000 > cover.now
    })
    readonly property var recent: appState.rooms.slice(0, 3)

    function dayTitle(ms) {
        var day = new Date(ms)
        var today = new Date(cover.now)
        today = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        var diff = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()) - today) / 86400000)
        if (diff === 0) return appState.t("calendarSync.today")
        if (diff === 1) return qsTr("Завтра")
        return Qt.formatDate(day, "d MMMM, dddd")
    }

    // The time is redrawn only while the cover is visible: every second in a
    // meeting, every half a minute for the planned meetings.
    Timer {
        interval: cover.meeting ? 1000 : 30000
        repeat: true
        triggeredOnStart: true
        running: cover.status === Cover.Active
        onTriggered: cover.now = Date.now()
    }

    // The content area: below the system header, above the cover actions.
    Item {
        id: area
        x: Theme.paddingCover
        width: parent.width - 2 * Theme.paddingCover
        height: parent.height - cover.actionsHeight
        clip: true

        // ---- In a meeting -------------------------------------------------
        Column {
            visible: !!cover.meeting
            width: parent.width
            spacing: Theme.paddingSmall

            Row {
                spacing: Theme.paddingSmall
                Rectangle {
                    id: liveDot
                    anchors.verticalCenter: parent.verticalCenter
                    width: Theme.paddingMedium
                    height: width
                    radius: width / 2
                    color: AppStyle.success
                    SequentialAnimation on opacity {
                        running: !!cover.meeting && cover.status === Cover.Active
                        loops: Animation.Infinite
                        NumberAnimation { to: 0.3; duration: 800; easing.type: Easing.InOutQuad }
                        NumberAnimation { to: 1; duration: 800; easing.type: Easing.InOutQuad }
                    }
                }
                Label {
                    text: qsTr("Идёт встреча")
                    font.pixelSize: Theme.fontSizeExtraSmall
                    color: Theme.secondaryColor
                }
            }
            Label {
                width: parent.width
                text: cover.meeting ? cover.meeting.roomName : ""
                wrapMode: Text.Wrap
                maximumLineCount: 2
                elide: Text.ElideRight
                font.pixelSize: Theme.fontSizeMedium
                font.weight: Font.Medium
                color: Theme.primaryColor
            }
            Label {
                text: cover.meeting && cover.meeting.callStartedAt > 0
                      ? appState.formatDuration(cover.now - cover.meeting.callStartedAt) : "—"
                font.pixelSize: Theme.fontSizeExtraLarge
                font.weight: Font.Light
                color: Theme.highlightColor
            }
            Row {
                spacing: Theme.paddingSmall
                Image {
                    anchors.verticalCenter: parent.verticalCenter
                    width: Theme.iconSizeExtraSmall
                    height: width
                    sourceSize { width: width; height: height }
                    source: cover.meeting && cover.meeting.callAudioMuted
                            ? "image://theme/icon-cover-mute" : "image://theme/icon-cover-mic"
                    opacity: 0.8
                }
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: cover.meeting && cover.meeting.callAudioMuted
                          ? qsTr("Микрофон выключен") : qsTr("Микрофон включён")
                    font.pixelSize: Theme.fontSizeTiny
                    color: cover.meeting && cover.meeting.callAudioMuted ? AppStyle.error : Theme.secondaryColor
                }
            }
        }

        // ---- The planned meetings -----------------------------------------
        Column {
            visible: !cover.meeting && cover.upcoming.length > 0
            width: parent.width
            spacing: Theme.paddingSmall

            Label {
                text: qsTr("Встречи")
                font.pixelSize: Theme.fontSizeExtraSmall
                color: Theme.secondaryColor
            }
            Repeater {
                model: cover.upcoming.slice(0, 2)
                delegate: Column {
                    width: area.width
                    readonly property bool ongoing: modelData.start <= cover.now
                    Label {
                        visible: index === 0 || cover.dayTitle(modelData.start) !== cover.dayTitle(cover.upcoming[index - 1].start)
                        width: parent.width
                        text: cover.dayTitle(modelData.start)
                        font.pixelSize: Theme.fontSizeSmall
                        font.weight: Font.Medium
                        truncationMode: TruncationMode.Fade
                    }
                    Item {
                        width: parent.width
                        height: Math.max(time.height, title.height) + Theme.paddingSmall
                        Label {
                            id: time
                            text: Qt.formatTime(new Date(modelData.start), "HH:mm")
                            font.pixelSize: Theme.fontSizeExtraSmall
                            color: ongoing ? Theme.highlightColor : Theme.secondaryColor
                        }
                        Rectangle {
                            id: bar
                            anchors { left: time.right; leftMargin: Theme.paddingSmall }
                            y: 2
                            width: Theme.dp(3)
                            height: title.height - 4
                            radius: width / 2
                            color: ongoing ? AppStyle.success : AppStyle.avatarColor(modelData.room)
                        }
                        Label {
                            id: title
                            anchors { left: bar.right; leftMargin: Theme.paddingSmall; right: parent.right }
                            text: modelData.title
                            wrapMode: Text.Wrap
                            maximumLineCount: 2
                            elide: Text.ElideRight
                            font.pixelSize: Theme.fontSizeExtraSmall
                        }
                    }
                }
            }
        }

        // ---- The recent rooms ---------------------------------------------
        Column {
            visible: !cover.meeting && cover.upcoming.length === 0 && cover.recent.length > 0
            width: parent.width
            spacing: Theme.paddingSmall

            Label {
                text: qsTr("Недавние")
                font.pixelSize: Theme.fontSizeExtraSmall
                color: Theme.secondaryColor
            }
            Repeater {
                model: cover.recent
                delegate: Row {
                    width: area.width
                    spacing: Theme.paddingSmall
                    Rectangle {
                        id: badge
                        width: Theme.iconSizeSmall
                        height: width
                        radius: width / 2
                        color: AppStyle.avatarColor(modelData.name)
                        Label {
                            anchors.centerIn: parent
                            text: appState.initials(modelData.name)
                            font.pixelSize: Theme.fontSizeTiny
                            font.weight: Font.Medium
                            color: "white"
                        }
                    }
                    Label {
                        anchors.verticalCenter: badge.verticalCenter
                        width: parent.width - badge.width - parent.spacing
                        text: modelData.name
                        font.pixelSize: Theme.fontSizeExtraSmall
                        truncationMode: TruncationMode.Fade
                    }
                }
            }
        }

        // ---- Nothing yet --------------------------------------------------
        Column {
            visible: !cover.meeting && cover.upcoming.length === 0 && cover.recent.length === 0
            anchors.centerIn: parent
            width: parent.width
            spacing: Theme.paddingMedium
            Image {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Theme.iconSizeLarge
                height: width
                source: Qt.resolvedUrl("../icons/Jitsi.png")
                sourceSize { width: width; height: height }
            }
            Label {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                text: qsTr("Начните или запланируйте встречу")
                wrapMode: Text.Wrap
                font.pixelSize: Theme.fontSizeExtraSmall
                color: Theme.secondaryColor
            }
        }
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
        var window = __silica_applicationwindow_instance
        var stack = window.pageStack
        var main = stack.find(function(page) { return page.objectName === "mainPage" })
        if (main) {
            stack.pop(main, PageStackAction.Immediate)
            main.selectedTab = index
        }
        window.activate()
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
