import QtQuick 2.6
import Sailfish.Silica 1.0
import ru.auroraos.WebView 1.0
import ru.auroraos.WebView.Global 1.0
import "../components"

Page {
    id: page
    objectName: "roomPage"
    allowedOrientations: Orientation.All
    backNavigation: false
    property string roomName
    property string serverAddress
    property bool initialAudioMuted: false
    property bool initialVideoMuted: false
    property bool audioMuted: initialAudioMuted
    property bool videoMuted: initialVideoMuted
    property bool joined: false
    property bool apiReady: false
    property bool leaving: false
    property int participantCount: 0
    property string message
    property bool loadFailed: false
    property var authPopup: null
    property int cameraCount: -1
    property bool cameraIssue: false
    property bool moreOpen: false
    property var previousPage

    function showPopup(popup) {
        if (authPopup) authPopup.destroy()
        authPopup = popup
        popup.parent = popupContent
        popup.anchors.fill = popupContent
        popup.visible = true
        popup.forceActiveFocus()
    }
    function closePopup() {
        if (!authPopup) return
        var popup = authPopup
        authPopup = null
        popup.destroy()
    }

    function command(name) {
        webView.runJavaScript("window.auroraMeeting && window.auroraMeeting.command(" + JSON.stringify(name) + ")",
            function(result) {}, function(error) { page.message = qsTr("Команда не выполнена. Повторите попытку.") })
    }
    function closeMeeting() {
        if (leaving) return
        leaving = true
        moreOpen = false
        closePopup()
        if (apiReady) command("hangup")
        closeTimer.start()
    }
    Timer { id: closeTimer; interval: 1000; onTriggered: pageStack.pop() }
    Timer {
        interval: 45000
        running: !page.joined && !page.leaving
        onTriggered: {
            if (!page.apiReady) {
                page.loadFailed = true
                page.message = qsTr("Сервер не ответил. Проверьте соединение и повторите попытку.")
            }
        }
    }
    Component.onDestruction: {
        appState.finishMeeting()
        if (previousPage) previousPage.resetPreview()
    }
    Rectangle { anchors.fill: parent; color: AppStyle.background }

    Connections {
        target: PermissionHandler
        onMediaAccessRequested: {
            if (appState.isTrustedOrigin(mediaAccessRequest.requestingOrigin)) mediaAccessRequest.accept()
            else mediaAccessRequest.deny()
        }
        onPermissionsRequested: {
            var allowed = appState.isTrustedOrigin(permissionRequest.requestingOrigin)
            var permissions = permissionRequest.requestedPermissions
            for (var i = 0; i < permissions.length; i++) {
                if (permissions[i] !== Permissions.CEF_PERMISSION_TYPE_CAMERA_STREAM
                        && permissions[i] !== Permissions.CEF_PERMISSION_TYPE_MIC_STREAM) allowed = false
            }
            if (allowed) permissionRequest.accept()
            else permissionRequest.deny()
        }
    }
    Connections {
        target: appState
        onConferenceEvent: {
            switch (name) {
            case "apiReady": page.apiReady = true; break
            case "videoConferenceJoined": page.joined = true; page.participantCount = 1; page.message = ""; break
            case "videoConferenceLeft": page.joined = false; page.participantCount = 0; break
            case "participantCount": page.participantCount = data.count; break
            case "audioMuteStatusChanged": page.audioMuted = data.muted; break
            case "videoMuteStatusChanged": page.videoMuted = data.muted; break
            case "cameraError": page.videoMuted = true; page.cameraIssue = true; break
            case "deviceInventory":
                page.cameraCount = data.videoInput
                console.info("Jitsi devices: cameras=" + data.videoInput + ", microphones=" + data.audioInput)
                break
            case "videoAvailabilityChanged":
                if (!data.available) page.videoMuted = true
                else page.cameraIssue = false
                break
            case "micError": page.audioMuted = true; page.message = qsTr("Микрофон недоступен. Проверьте разрешения и подключённые устройства."); break
            case "settingUnavailable": page.message = qsTr("Этот сервер не поддерживает упрощённый режим."); break
            case "passwordRequired": page.message = qsTr("Введите пароль комнаты в окне встречи."); break
            case "scriptError": page.loadFailed = true; page.message = qsTr("Не удалось загрузить встречу с этого сервера. Проверьте его адрес и соединение."); break
            case "errorOccurred":
                if (data.name === "conference.authenticationRequired")
                    page.message = qsTr("Ожидаем организатора. Для начала встречи сервер требует вход в учётную запись.")
                else if (data.isFatal)
                    page.message = qsTr("Не удалось подключиться. Проверьте сообщение в окне встречи.")
                break
            case "readyToClose": if (!page.leaving) { page.leaving = true; closeTimer.start() }; break
            }
        }
    }
    Column {
        id: topPanel
        width: parent.width
        ScreenHeader {
            title: page.roomName
            subtitle: page.leaving ? qsTr("Завершаем встречу…") : page.joined
                       ? qsTr("На встрече: ") + page.participantCount
                       : (page.apiReady ? qsTr("Ожидание входа · ") : qsTr("Подключение к ")) + page.serverAddress.replace("https://", "")
            showBack: true
            onBackClicked: page.closeMeeting()
        }
        Rectangle {
            visible: page.message.length > 0 || page.cameraCount === 0 || page.cameraIssue
            width: parent.width
            height: messageLabel.height + 2 * Theme.paddingMedium
            color: AppStyle.raised
            Label {
                id: messageLabel
                x: Theme.horizontalPageMargin
                y: Theme.paddingMedium
                width: parent.width - 2 * x
                text: page.message + (page.cameraCount === 0 || page.cameraIssue
                    ? (page.message.length ? "\n" : "") + qsTr("Камера недоступна для встречи. Можно продолжить без видео.") : "")
                color: AppStyle.text
                font.pixelSize: Theme.fontSizeExtraSmall
                wrapMode: Text.Wrap
            }
        }
    }
    WebView {
        id: webView
        anchors { top: topPanel.bottom; bottom: callBar.top; left: parent.left; right: parent.right }
        url: appState.meetingUrl
        userAgent: "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"
        TouchInput { enabled: true }
        KeyboardInput { enabled: true }
        PopupExtension {
            function beforePopup(address, frameName, userGesture) {
                // Returning a component lets Aurora bind the actual Chromium popup,
                // preserving window.opener and the login callback to the meeting.
                if (page.authPopup || !userGesture) return null
                if (address.scheme !== "https" && !(address.scheme === "about" && address.path === "blank")) return null
                return loginPopupComponent
            }
            function popupReady(popup) { page.showPopup(popup) }
        }
        onLoadError: {
            if (errorCode !== -3) {
                page.loadFailed = true
                page.message = qsTr("Не удалось открыть встречу. Проверьте подключение к интернету.")
            }
        }
        onLoadStart: page.loadFailed = false
    }
    BusyIndicator {
        anchors.centerIn: webView
        size: BusyIndicatorSize.Large
        running: !page.apiReady && !page.loadFailed
        visible: running
    }
    AppButton {
        visible: page.loadFailed
        anchors.centerIn: webView
        width: parent.width - 2 * Theme.horizontalPageMargin
        text: qsTr("Повторить подключение")
        onClicked: {
            page.message = ""
            page.apiReady = false
            page.loadFailed = false
            webView.reload()
        }
    }
    Rectangle {
        id: callBar
        anchors { bottom: parent.bottom; left: parent.left; right: parent.right }
        height: controls.height + Theme.paddingSmall
        color: AppStyle.surface
        Row {
            id: controls
            width: parent.width
            height: Theme.itemSizeLarge
            CallControl {
                text: page.audioMuted ? qsTr("Без звука") : qsTr("Микрофон")
                iconName: page.audioMuted ? "mic-slash" : "mic"
                checked: !page.audioMuted
                enabled: page.apiReady && !page.leaving
                onClicked: page.command("toggleAudio")
            }
            CallControl {
                text: page.cameraCount === 0 ? qsTr("Нет камеры") : page.videoMuted ? qsTr("Без видео") : qsTr("Камера")
                iconName: page.videoMuted ? "video-off" : "video"
                checked: !page.videoMuted
                enabled: page.apiReady && !page.leaving && page.cameraCount !== 0
                onClicked: page.command("toggleVideo")
            }
            CallControl {
                text: qsTr("Чат")
                iconName: "chat-unread"
                enabled: page.joined && !page.leaving
                onClicked: page.command("toggleChat")
            }
            CallControl {
                text: qsTr("Ещё")
                iconName: "dots-horizontal"
                enabled: page.joined && !page.leaving
                onClicked: page.moreOpen = true
            }
            CallControl {
                text: qsTr("Выйти")
                iconName: "hangup"
                destructive: true
                enabled: !page.leaving
                onClicked: page.closeMeeting()
            }
        }
    }
    Rectangle {
        anchors.fill: parent
        z: 80
        visible: page.moreOpen
        color: "#99000000"
        MouseArea { anchors.fill: parent; onClicked: page.moreOpen = false }
    }
    Rectangle {
        id: moreSheet
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        z: 81
        visible: page.moreOpen
        height: Math.min(page.height * 0.75, sheetContent.height + 2*Theme.paddingLarge)
        radius: Theme.paddingLarge
        color: AppStyle.background
        SilicaFlickable {
            anchors.fill: parent
            contentHeight: sheetContent.height + 2*Theme.paddingLarge
            Column {
                id: sheetContent
                y: Theme.paddingLarge
                width: parent.width
                Repeater {
                    model: [
                        {label: qsTr("Участники"), command: "toggleParticipantsPane"},
                        {label: qsTr("Плиточный вид"), command: "toggleTileView"},
                        {label: qsTr("Переключить камеру"), command: "toggleCamera"}
                    ]
                    delegate: ListItem {
                        width: sheetContent.width
                        contentHeight: Theme.itemSizeMedium
                        visible: modelData.command !== "toggleCamera" || page.cameraCount > 1
                        enabled: visible
                        Label {
                            x: Theme.horizontalPageMargin
                            anchors.verticalCenter: parent.verticalCenter
                            text: modelData.label
                        }
                        onClicked: {
                            page.moreOpen = false
                            page.command(modelData.command)
                        }
                    }
                }
                Button {
                    anchors.horizontalCenter: parent.horizontalCenter
                    preferredWidth: parent.width - 2*Theme.horizontalPageMargin
                    text: qsTr("Поднять / опустить руку")
                    onClicked: {
                        page.moreOpen = false
                        page.command("toggleRaiseHand")
                    }
                }
            }
            VerticalScrollDecorator {}
        }
    }
    Component {
        id: loginPopupComponent
        WebView {
            // Aurora loads the requested URL into this bound popup. Assigning url
            // here would discard the browser's opener relationship.
            TouchInput { enabled: true }
            KeyboardInput { enabled: true }
            PopupExtension {
                function beforePopup(address, frameName, userGesture) { return null }
            }
            onClosing: page.closePopup()
        }
    }
    Rectangle {
        anchors.fill: parent
        z: 100
        visible: page.authPopup !== null
        color: AppStyle.background
        ScreenHeader {
            id: popupHeader
            title: qsTr("Вход организатора")
            subtitle: page.authPopup ? String(page.authPopup.url).split("/").slice(0, 3).join("/") : ""
            showBack: true
            onBackClicked: page.closePopup()
        }
        Item {
            id: popupContent
            anchors { top: popupHeader.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
            clip: true
        }
    }
}
