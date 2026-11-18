import QtQuick 2.6
import Sailfish.Silica 1.0
import Sailfish.Share 1.0
import "../components"

// Calendar tab. The system calendar is closed to applications (the Calendar
// permission is not allowed for them), so the tab lists the meetings planned
// in the application (AppState.scheduled), as CalendarList.native lists the
// calendar events: by day, with the time and the room, joined with a tap.
// A press and hold opens the sheet of MainPage (as for a recent room):
// sharing the invitation, opening it in the Aurora calendar, removing.
SilicaFlickable {
    id: view
    signal openRoom(var input)
    // Press and hold: the sheet of MainPage, which calls meetingAction.
    signal meetingMenu(var meeting)
    property var now: new Date()
    readonly property var meetings: appState.scheduled.filter(function(meeting) {
        return meeting.start + meeting.minutes * 60000 > view.now.getTime()
    })
    contentHeight: body.height
    clip: true

    // An invitation for a colleague: the meeting as an iCalendar file (time,
    // link, reminder) through the system sharing (mail, messengers,
    // Bluetooth); any calendar takes it, Jitsi Meet on Aurora OS too.
    ShareAction {
        id: inviteShare
        mimeType: "text/calendar"
        title: qsTr("Поделиться приглашением")
    }

    // The sheet shows meeting.name (Qt 5.6 has no Object.assign).
    function withName(meeting) {
        var copy = { name: meeting.title }
        for (var key in meeting) copy[key] = meeting[key]
        copy.name = meeting.title
        return copy
    }

    function meetingAction(action, meeting) {
        var file = appState.exportScheduled(meeting.id)
        if (!file) return
        if (action === "share") {
            inviteShare.resources = [file]
            inviteShare.trigger()
        } else if (action === "calendar") {
            // The system asks which application opens the file: the
            // Calendar (Jitsi Meet takes .ics files too).
            Qt.openUrlExternally(file)
        }
    }

    // The ended meetings leave the list, the ongoing one is marked.
    Timer {
        interval: 30000
        running: view.visible
        repeat: true
        triggeredOnStart: true
        onTriggered: view.now = new Date()
    }

    function dayTitle(ms) {
        var day = new Date(ms)
        var today = new Date(view.now.getFullYear(), view.now.getMonth(), view.now.getDate())
        var date = new Date(day.getFullYear(), day.getMonth(), day.getDate())
        var diff = Math.round((date - today) / 86400000)
        if (diff === 0) return appState.t("calendarSync.today")
        if (diff === 1) return qsTr("Завтра")
        return Qt.formatDate(day, "dddd, d MMMM")
    }

    Column {
        id: body
        width: parent.width

        Item { width: 1; height: 16 }
        AppButton {
            x: 16
            width: parent.width - 32
            type: "secondary"
            text: qsTr("Запланировать встречу")
            onClicked: pageStack.push(Qt.resolvedUrl("ScheduleMeetingPage.qml"))
        }
        Item { width: 1; height: 16 }

        Label {
            x: 20
            width: parent.width - 40
            visible: view.meetings.length === 0
            text: appState.t("calendarSync.noEvents")
            font.pixelSize: AppStyle.bodyShortLarge
            color: Qt.rgba(1, 1, 1, 0.6)
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignHCenter
        }

        Repeater {
            model: view.meetings
            delegate: Column {
                id: entry
                property var meeting: modelData
                readonly property bool ongoing: meeting.start <= view.now.getTime()
                width: body.width

                Rectangle {
                    visible: index === 0 || view.dayTitle(entry.meeting.start) !== view.dayTitle(view.meetings[index - 1].start)
                    width: parent.width
                    height: visible ? dayText.height + 8 : 0
                    color: AppStyle.raised
                    Label {
                        id: dayText
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        text: view.dayTitle(entry.meeting.start)
                        color: Qt.rgba(1, 1, 1, 0.6)
                        font.pixelSize: AppStyle.bodyShort
                    }
                }

                BackgroundItem {
                    id: item
                    width: parent.width
                    height: Math.max(65, details.height) + 16
                    onClicked: view.openRoom(entry.meeting.link)
                    onPressAndHold: view.meetingMenu(view.withName(entry.meeting))

                    Rectangle {
                        id: badge
                        x: 16
                        anchors.verticalCenter: parent.verticalCenter
                        width: 65
                        height: 65
                        radius: 32.5
                        color: entry.ongoing ? AppStyle.accent : AppStyle.avatarColor(entry.meeting.room)
                        Label {
                            anchors.centerIn: parent
                            text: Qt.formatTime(new Date(entry.meeting.start), "HH:mm")
                            color: AppStyle.text
                            font.pixelSize: 16
                            font.weight: Font.DemiBold
                        }
                    }
                    Column {
                        id: details
                        anchors { left: badge.right; leftMargin: 10; right: parent.right; rightMargin: 21 }
                        anchors.verticalCenter: parent.verticalCenter
                        Label {
                            width: parent.width
                            text: entry.meeting.title
                            color: AppStyle.text
                            font.pixelSize: AppStyle.bodyShortLarge
                            font.weight: Font.DemiBold
                            elide: Text.ElideRight
                        }
                        Label {
                            width: parent.width
                            text: (entry.ongoing ? appState.t("calendarSync.ongoingMeeting") + " · " : "")
                                  + Qt.formatTime(new Date(entry.meeting.start), "HH:mm") + " – "
                                  + Qt.formatTime(new Date(entry.meeting.start + entry.meeting.minutes * 60000), "HH:mm")
                            color: entry.ongoing ? AppStyle.accent : AppStyle.muted
                            font.pixelSize: AppStyle.bodyShort
                            elide: Text.ElideRight
                        }
                        Label {
                            width: parent.width
                            text: entry.meeting.link.replace(/^https:\/\//, "")
                            color: AppStyle.muted
                            font.pixelSize: AppStyle.bodyShort
                            elide: Text.ElideMiddle
                        }
                    }
                }
            }
        }
        Item { width: 1; height: 16 }
    }
}
