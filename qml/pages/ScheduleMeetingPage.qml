import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// Planning a meeting for the Calendar tab: the room (a name on the default
// server or a link), a title, the date and time, the length and the
// reminder. The reminder comes from the application while it runs; the
// meeting can also be added to the Aurora calendar, which reminds anyway.
Page {
    id: page
    allowedOrientations: Orientation.All
    property date day: new Date()
    property int hour: (new Date().getHours() + 1) % 24
    property int minute: 0
    property int minutes: 60
    property int remind: 10
    property string error
    readonly property var lengths: [15, 30, 45, 60, 90, 120]
    readonly property var reminders: [0, 5, 10, 15, 30, 60]

    function startTime() {
        return new Date(page.day.getFullYear(), page.day.getMonth(), page.day.getDate(), page.hour, page.minute)
    }
    function next(list, value) {
        var i = list.indexOf(value)
        return list[(i + 1) % list.length]
    }
    function save() {
        var start = page.startTime()
        if (start.getTime() + page.minutes * 60000 < Date.now()) {
            page.error = qsTr("Встреча уже прошла: выберите другое время.")
            return
        }
        if (appState.addScheduled(roomField.text, titleField.text, start.getTime(), page.minutes, page.remind)) pageStack.pop()
        else page.error = appState.lastError
    }

    Item {
        id: viewport
        width: page.width / AppStyle.dp
        height: page.height / AppStyle.dp
        scale: AppStyle.dp
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }

        ScreenHeader {
            id: header
            title: qsTr("Запланировать встречу")
            showBack: true
            closeIcon: true
            onBackClicked: pageStack.pop()
        }
        AppButton {
            id: saveButton
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: 24 }
            type: "primary"
            text: appState.t("polls.create.save")
            enabled: roomField.text.trim().length > 0
            onClicked: page.save()
        }
        SilicaFlickable {
            anchors { left: parent.left; right: parent.right; top: header.bottom; bottom: saveButton.top; bottomMargin: 16 }
            contentHeight: body.height
            clip: true
            Column {
                id: body
                x: 24
                width: parent.width - 48
                spacing: 16
                Item { width: 1; height: 8 }
                JitsiField {
                    id: roomField
                    width: parent.width
                    label: qsTr("Комната")
                    placeholderText: qsTr("Название комнаты или ссылка на встречу")
                    inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText
                    error: page.error.length > 0
                }
                JitsiField {
                    id: titleField
                    width: parent.width
                    label: qsTr("Название (необязательно)")
                    placeholderText: qsTr("Например, защита проекта")
                    emoji: true
                }
                Label {
                    visible: page.error.length > 0
                    width: parent.width
                    text: page.error
                    color: AppStyle.error
                    font.pixelSize: AppStyle.bodyShort
                    wrapMode: Text.Wrap
                }
                Row {
                    width: parent.width
                    spacing: 16
                    AppButton {
                        width: (parent.width - 16) / 2
                        type: "secondary"
                        text: Qt.formatDate(page.day, "d MMMM yyyy")
                        onClicked: {
                            var dialog = pageStack.push("Sailfish.Silica.DatePickerDialog", { date: page.day })
                            dialog.accepted.connect(function() { page.day = dialog.date })
                        }
                    }
                    AppButton {
                        width: (parent.width - 16) / 2
                        type: "secondary"
                        text: (page.hour < 10 ? "0" : "") + page.hour + ":" + (page.minute < 10 ? "0" : "") + page.minute
                        onClicked: {
                            var dialog = pageStack.push("Sailfish.Silica.TimePickerDialog",
                                                        { hour: page.hour, minute: page.minute, hourMode: DateTime.TwentyFourHours })
                            dialog.accepted.connect(function() { page.hour = dialog.hour; page.minute = dialog.minute })
                        }
                    }
                }
                AppButton {
                    width: parent.width
                    type: "secondary"
                    text: qsTr("Длительность: %1 мин").arg(page.minutes)
                    onClicked: page.minutes = page.next(page.lengths, page.minutes)
                }
                AppButton {
                    width: parent.width
                    type: "secondary"
                    text: page.remind > 0 ? qsTr("Напомнить за %1 мин").arg(page.remind) : qsTr("Без напоминания")
                    onClicked: page.remind = page.next(page.reminders, page.remind)
                }
            }
        }
    }
}
