import QtQuick 2.0
import Sailfish.Silica 1.0
import Nemo.Notifications 1.0

ApplicationWindow {
    objectName: "applicationWindow"
    initialPage: Qt.resolvedUrl("pages/MainPage.qml")
    cover: Qt.resolvedUrl("cover/DefaultCoverPage.qml")
    allowedOrientations: defaultAllowedOrientations
    // The meeting page while a meeting is on (the cover shows it).
    property var activeMeeting: null
    Connections {
        target: appState
        onInterfaceLanguageChanged: languageRefresh.restart()
    }

    // Reminders of the meetings planned in the Calendar tab, while the
    // application runs (also in the background). Once per meeting.
    property var reminded: ({})
    function checkReminders() {
        var now = Date.now()
        var meetings = appState.scheduled
        for (var i = 0; i < meetings.length; i++) {
            var meeting = meetings[i]
            if (meeting.remind <= 0 || reminded[meeting.id]) continue
            if (now < meeting.start - meeting.remind * 60000 || now > meeting.start + 60000) continue
            reminded[meeting.id] = true
            reminder.summary = meeting.title
            reminder.body = qsTr("Встреча начнётся в %1").arg(Qt.formatTime(new Date(meeting.start), "HH:mm"))
            reminder.previewSummary = reminder.summary
            reminder.previewBody = reminder.body
            reminder.replacesId = 0
            reminder.publish()
        }
    }
    Timer {
        interval: 30000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: checkReminders()
    }
    // Calendar invitations opened with the application (FileOpener): the
    // meeting goes to the Calendar tab, which is shown unless a meeting runs.
    function importCalendarFile(path) {
        var result = appState.importCalendarFile(path)
        reminder.summary = result.ok ? (result.duplicate ? qsTr("Встреча обновлена") : qsTr("Встреча добавлена"))
                                     : qsTr("Не удалось добавить встречу")
        reminder.body = result.ok ? result.title + ", " + Qt.formatDateTime(new Date(result.start), "d MMMM, HH:mm")
                                  : result.error
        reminder.previewSummary = reminder.summary
        reminder.previewBody = reminder.body
        reminder.replacesId = 0
        reminder.publish()
        activate()
        if (!result.ok || activeMeeting) return
        var main = pageStack.find(function(page) { return page.objectName === "mainPage" })
        if (main) {
            pageStack.pop(main, PageStackAction.Immediate)
            main.selectedTab = 1
        }
    }
    Connections {
        target: fileOpener
        onFileOpened: importCalendarFile(path)
    }
    Component.onCompleted: {
        var pending = fileOpener.takePending()
        for (var i = 0; i < pending.length; i++) importCalendarFile(pending[i])
    }
    Notification {
        id: reminder
        appName: "Jitsi Meet"
        appIcon: "ru.mirea.JitsiClient"
        urgency: Notification.Normal
    }
    // The strings of the pages are bound once, so the pages are created again
    // in the new language. The language page is still being popped when the
    // language changes; a busy page stack ignores the replacement.
    Timer {
        id: languageRefresh
        interval: 50
        onTriggered: {
            if (pageStack.busy) {
                restart()
                return
            }
            pageStack.replaceAbove(null, Qt.resolvedUrl("pages/MainPage.qml"), {selectedTab: 2}, PageStackAction.Immediate)
        }
    }
}
