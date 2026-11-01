import QtQuick 2.6
import Sailfish.Silica 1.0
import "."
import "../lib/RoomName.js" as RoomName

// Room name input of WelcomePage.native: "Enter room name", a field whose
// placeholder types a generated room name letter by letter, the insecure
// room name warning and, while the field is focused, the hint box with the
// CREATE / JOIN button.
Column {
    id: form
    property string error
    property string generatedRoomName: ""
    property string roomPlaceholder: ""
    readonly property bool focused: room.fieldActiveFocus
    readonly property bool unsafeName: room.text.trim().length > 0 && room.text.trim().length <= 8
    signal submitted(string input)
    width: parent.width
    topPadding: 24
    bottomPadding: 24
    spacing: 8

    function blur() { room.blurEditor() }

    function submit() {
        form.submitted(room.text.trim() || form.generatedRoomName)
    }

    // AbstractWelcomePage: a new name every 10 s, typed in 70 ms steps.
    Timer {
        id: nextName
        interval: 10000
        repeat: true
        running: true
        triggeredOnStart: true
        onTriggered: {
            form.generatedRoomName = RoomName.generateRoomWithoutSeparator()
            form.roomPlaceholder = ""
            typing.start()
        }
    }
    Timer {
        id: typing
        interval: 70
        repeat: true
        onTriggered: {
            if (form.roomPlaceholder.length >= form.generatedRoomName.length) { stop(); return }
            form.roomPlaceholder = form.generatedRoomName.substr(0, form.roomPlaceholder.length + 1)
        }
    }

    Label {
        x: 24
        width: parent.width - 48
        text: appState.t("welcomepage.roomname")
        color: AppStyle.text
        font.pixelSize: 18
        wrapMode: Text.Wrap
    }
    JitsiField {
        id: room
        x: 24
        width: parent.width - 48
        placeholderText: form.roomPlaceholder
        inputMethodHints: Qt.ImhNoAutoUppercase | Qt.ImhNoPredictiveText | Qt.ImhUrlCharactersOnly
        onAccepted: form.submit()
    }

    // messageContainer + insecureRoomNameWarningContainer
    Rectangle {
        x: 24
        width: parent.width - 48
        visible: form.unsafeName
        height: visible ? Math.max(unsafeText.height, 24) + 32 : 0
        radius: 6
        color: AppStyle.field
        Icon {
            x: 12
            anchors.verticalCenter: parent.verticalCenter
            width: 24
            height: 24
            source: Qt.resolvedUrl("../icons/warning.svg")
            color: AppStyle.warning
        }
        Label {
            id: unsafeText
            x: 46
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x - 8
            // getUnsafeRoomText(): the web string carries the localized link.
            text: appState.t("security.insecureRoomNameWarningWeb", {
                recommendAction: appState.t("security.unsafeRoomActions.welcome"),
                securityUrl: "https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi"
            })
            textFormat: Text.StyledText
            linkColor: AppStyle.accent
            onLinkActivated: pageStack.push(Qt.resolvedUrl("../pages/SecurityHelpPage.qml"), {address: link})
            color: AppStyle.text
            font.pixelSize: AppStyle.bodyShort
            wrapMode: Text.Wrap
        }
    }

    // Hint box shown while the field has focus.
    Rectangle {
        x: 24
        width: parent.width - 48
        visible: form.focused
        height: visible ? hint.height + joinButton.height + 64 : 0
        radius: 6
        color: AppStyle.field
        Label {
            id: hint
            x: 8
            y: 16
            width: parent.width - 16
            text: appState.t("welcomepage.roomnameHint")
            color: AppStyle.text
            font.pixelSize: AppStyle.bodyShort
            wrapMode: Text.Wrap
            horizontalAlignment: Text.AlignHCenter
        }
        AppButton {
            id: joinButton
            anchors { horizontalCenter: parent.horizontalCenter; top: hint.bottom; topMargin: 16 }
            width: Math.min(parent.width - 16, implicitWidth)
            uppercase: true
            text: appState.t("welcomepage.join")
            onClicked: form.submit()
        }
    }

    Label {
        visible: form.error.length > 0
        x: 24
        width: parent.width - 48
        text: form.error
        color: AppStyle.error
        wrapMode: Text.Wrap
        font.pixelSize: AppStyle.bodyShort
    }
}
