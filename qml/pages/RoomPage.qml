import QtQuick 2.6
import Sailfish.Silica 1.0
import Sailfish.Share 1.0
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
    property bool chatOpen: false
    property bool participantsOpen: false
    property bool settingsOpen: false
    property bool audioOnly: false
    property var chatMessages: []
    property var participants: []
    property string selfId: ""
    property bool moderator: false
    property var previousPage
    property string inviteLink: page.serverAddress.replace(/\/$/, "") + "/" + encodeURIComponent(page.roomName)
    ShareAction {
        id: inviteAction
        mimeType: "text/plain"
        title: qsTr("Пригласить")
        resources: [{"data": page.inviteLink, "name": "Jitsi Meet"}]
    }

    function invite() {
        appState.copyText(page.inviteLink)
        inviteAction.trigger()
    }

    function sendChat(text) {
        var value = text.trim()
        if (!value || !apiReady) return
        webView.runJavaScript("window.auroraMeeting && window.auroraMeeting.sendChatMessage(" + JSON.stringify(value) + ")",
            function(result) {}, function(error) {})
    }
    function muteEveryone(mediaType) {
        webView.runJavaScript("window.auroraMeeting && window.auroraMeeting.muteEveryone(" + JSON.stringify(mediaType) + ")",
            function(result) {}, function(error) {})
    }

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
        chatOpen = false
        participantsOpen = false
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
            case "videoConferenceJoined": page.joined = true; page.participantCount = 1; page.selfId = data.id || ""; page.message = ""; break
            case "videoConferenceLeft": page.joined = false; page.participantCount = 0; page.participants = []; break
            case "participantCount": page.participantCount = data.count; break
            case "participantJoined":
                var people = page.participants.slice()
                people.push({id: data.id, name: data.displayName || data.id})
                page.participants = people
                break
            case "participantLeft":
                page.participants = page.participants.filter(function(person) { return person.id !== data.id })
                break
            case "participantRoleChanged": page.moderator = data.role === "moderator"; break
            case "incomingMessage":
                var messages = page.chatMessages.slice()
                messages.push({nick: data.nick || "", message: data.message || ""})
                page.chatMessages = messages
                break
            case "outgoingMessage":
                var outgoing = page.chatMessages.slice()
                outgoing.push({nick: appState.displayName, message: data.message || ""})
                page.chatMessages = outgoing
                break
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
        Rectangle {
            width: parent.width
            height: 68
            color: AppStyle.background
            Label {
                x: 16
                width: Math.min(parent.width * 0.40, 140)
                anchors.verticalCenter: parent.verticalCenter
                text: page.roomName
                font.pixelSize: 31
                font.bold: true
                color: AppStyle.text
                truncationMode: TruncationMode.Fade
            }
            Row {
                anchors { right: parent.right; rightMargin: 8; verticalCenter: parent.verticalCenter }
                spacing: 2
                BackgroundItem {
                    width: 54; height: 60
                    enabled: page.cameraCount > 1
                    Accessible.name: qsTr("Переключить камеру")
                    Icon { anchors.centerIn: parent; source: Qt.resolvedUrl("../icons/camera-refresh.svg"); width: 42; height: 42; color: AppStyle.text }
                    onClicked: page.command("toggleCamera")
                }
                Item {
                    width: 54; height: 60
                    Icon { anchors.centerIn: parent; source: Qt.resolvedUrl("../icons/volume-up.svg"); width: 42; height: 42; color: AppStyle.text }
                }
                BackgroundItem {
                    width: 54; height: 60
                    Accessible.name: qsTr("Участники")
                    Icon { anchors.centerIn: parent; source: Qt.resolvedUrl("../icons/users.svg"); width: 42; height: 42; color: AppStyle.text }
                    Label { anchors { right: parent.right; top: parent.top } text: page.participantCount; font.pixelSize: 20; color: AppStyle.muted }
                    onClicked: page.participantsOpen = true
                }
            }
        }
        Rectangle {
            visible: page.loadFailed && page.message.length > 0
            width: parent.width
            height: visible ? messageLabel.height + 16 : 0
            color: AppStyle.raised
            Label {
                id: messageLabel
                x: 16
                y: 8
                width: parent.width - 2 * x
                text: page.message
                color: AppStyle.text
                font.pixelSize: 22
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
        height: 80
        color: AppStyle.background
        Row {
            id: controls
            width: parent.width
            height: parent.height
            CallControl {
                height: 80
                text: page.audioMuted ? qsTr("Без звука") : qsTr("Микрофон")
                iconName: page.audioMuted ? "mic-slash" : "mic"
                checked: !page.audioMuted
                enabled: page.apiReady && !page.leaving
                onClicked: page.command("toggleAudio")
            }
            CallControl {
                height: 80
                text: page.cameraCount === 0 ? qsTr("Нет камеры") : page.videoMuted ? qsTr("Без видео") : qsTr("Камера")
                iconName: page.videoMuted ? "video-off" : "video"
                checked: !page.videoMuted
                enabled: page.apiReady && !page.leaving && page.cameraCount !== 0
                onClicked: page.command("toggleVideo")
            }
            CallControl {
                height: 80
                text: qsTr("Чат")
                iconName: "chat-unread"
                enabled: page.joined && !page.leaving
                onClicked: page.chatOpen = true
            }
            CallControl {
                height: 80
                text: qsTr("Ещё")
                iconName: "dots-horizontal"
                enabled: page.joined && !page.leaving
                onClicked: page.moreOpen = true
            }
            CallControl {
                height: 80
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
        height: Math.min(page.height * 0.79, sheetContent.height + 16)
        radius: 16
        color: AppStyle.raised
        SilicaFlickable {
            anchors.fill: parent
            contentHeight: sheetContent.height + 16
            Column {
                id: sheetContent
                y: 8
                width: parent.width
                Repeater {
                    model: [
                        {label: qsTr("Упрощенный режим"), icon: "car", command: "setLowBandwidthMode"},
                        {label: qsTr("Выключить видео (экономичный режим)"), icon: "video-off", command: "audioOnly"},
                        {label: qsTr("Настройки безопасности"), icon: "security-off", command: ""},
                        {label: qsTr("Начать трансляцию"), icon: "share", command: ""},
                        {label: qsTr("Показать интерактивную доску"), icon: "whiteboard", command: "toggleWhiteboard"},
                        {label: qsTr("Видео YouTube"), icon: "video", command: ""},
                        {label: qsTr("Общий план"), icon: "tile-view", command: "toggleTileView"},
                        {label: qsTr("Начать трансляцию с экрана"), icon: "screenshare", command: ""},
                        {label: qsTr("Статистика"), icon: "meter", command: ""},
                        {label: qsTr("Настройки"), icon: "gear", command: "settings"}
                    ]
                    delegate: BackgroundItem {
                        width: sheetContent.width
                        height: 58
                        enabled: modelData.command.length > 0
                        Icon {
                            x: 18
                            anchors.verticalCenter: parent.verticalCenter
                            source: Qt.resolvedUrl("../icons/" + modelData.icon + ".svg")
                            width: 36; height: 36
                            color: modelData.command.length ? AppStyle.text : AppStyle.inactive
                        }
                        Label {
                            x: 68
                            width: parent.width - x - 16
                            anchors.verticalCenter: parent.verticalCenter
                            text: modelData.label
                            font.pixelSize: 26
                            color: modelData.command.length ? AppStyle.text : AppStyle.inactive
                            truncationMode: TruncationMode.Fade
                        }
                        onClicked: {
                            page.moreOpen = false
                            if (modelData.command === "settings") page.settingsOpen = true
                            else if (modelData.command === "audioOnly") {
                                page.audioOnly = !page.audioOnly
                                webView.runJavaScript("window.auroraMeeting && window.auroraMeeting.setAudioOnly(" + page.audioOnly + ")",
                                    function(result) {}, function(error) {})
                            }
                            else page.command(modelData.command)
                        }
                    }
                }
                Row {
                    width: parent.width
                    height: 55
                    spacing: 8
                    Repeater {
                        model: ["👍", "👏", "😀", "😮", "😞", "😐", "💖"]
                        delegate: BackgroundItem {
                            width: (sheetContent.width - 48) / 7; height: 55
                            enabled: false
                            Label { anchors.centerIn: parent; text: modelData; font.pixelSize: 30 }
                        }
                    }
                }
                BackgroundItem {
                    x: 70
                    width: parent.width - 140
                    height: 54
                    Rectangle { anchors.fill: parent; radius: 6; color: "#E4E4E4" }
                    Label { anchors.centerIn: parent; text: qsTr("✋ Поднять руку"); color: "#111111"; font.pixelSize: 27; font.bold: true }
                    onClicked: {
                        page.moreOpen = false
                        page.command("toggleRaiseHand")
                    }
                }
            }
            VerticalScrollDecorator {}
        }
    }
    Item {
        id: chatViewport
        z: 90
        visible: page.chatOpen
        width: page.width / 2
        height: page.height / 2
        scale: 2
        transformOrigin: Item.TopLeft
        property int selectedTab: 0
        Rectangle { anchors.fill: parent; color: AppStyle.surface }
        Item {
            id: chatHeader
            width: parent.width; height: 56
            BackgroundItem {
                x: 0; width: 104; height: parent.height
                Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 16 }
                onClicked: page.chatOpen = false
            }
            Label { anchors.centerIn: parent; text: "Chat and Чат"; color: AppStyle.text; font.pixelSize: 18; font.bold: true }
        }
        Row {
            id: chatTabs
            anchors.top: chatHeader.bottom
            width: parent.width; height: 48
            Repeater {
                model: [qsTr("Чат"), qsTr("Опросы")]
                delegate: BackgroundItem {
                    width: chatTabs.width / 2; height: chatTabs.height
                    Label { anchors.centerIn: parent; text: modelData; color: index === chatViewport.selectedTab ? AppStyle.text : AppStyle.inactive; font.pixelSize: 16; font.bold: true }
                    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: index === chatViewport.selectedTab ? AppStyle.accent : AppStyle.border }
                    onClicked: chatViewport.selectedTab = index
                }
            }
        }
        JitsiField {
            id: chatSearch
            visible: chatViewport.selectedTab === 0
            anchors { top: chatTabs.bottom; topMargin: 8; left: parent.left; leftMargin: 16; right: parent.right; rightMargin: 16 }
            placeholderText: "Search in chat"
        }
        SilicaFlickable {
            id: chatScroll
            visible: chatViewport.selectedTab === 0
            anchors { top: chatSearch.bottom; bottom: chatEntry.top; left: parent.left; right: parent.right }
            contentHeight: chatList.height
            Column {
                id: chatList
                width: parent.width
                Repeater {
                    model: page.chatMessages.filter(function(item) { return !chatSearch.text || (item.message + item.nick).toLowerCase().indexOf(chatSearch.text.toLowerCase()) >= 0 })
                    delegate: Column {
                        width: chatList.width
                        spacing: 2
                        Label { x: 16; width: parent.width - 32; text: modelData.nick; color: AppStyle.muted; font.pixelSize: 13; font.bold: true }
                        Label { x: 16; width: parent.width - 32; text: modelData.message; color: AppStyle.text; font.pixelSize: 16; wrapMode: Text.Wrap }
                        Item { width: 1; height: 10 }
                    }
                }
            }
            VerticalScrollDecorator {}
        }
        Label {
            visible: chatViewport.selectedTab === 0 && page.chatMessages.length === 0
            anchors.centerIn: parent
            width: parent.width - 40
            text: qsTr("В конференции пока нет никаких сообщений. Начните разговор!")
            color: AppStyle.muted; font.pixelSize: 15; font.bold: true
            horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap
        }
        Row {
            id: chatEntry
            visible: chatViewport.selectedTab === 0
            anchors { bottom: parent.bottom; left: parent.left; leftMargin: 16; right: parent.right; rightMargin: 16 }
            height: 58; spacing: 8
            JitsiField {
                id: chatInput
                width: chatEntry.width - 58; height: 48
                placeholderText: qsTr("Введите здесь ваше сообщение")
                onAccepted: { page.sendChat(text); text = "" }
            }
            BackgroundItem {
                width: 48; height: 48
                Rectangle { anchors.fill: parent; radius: 6; color: chatInput.text.trim() ? AppStyle.accent : AppStyle.field }
                Label { anchors.centerIn: parent; text: "➤"; font.pixelSize: 24; color: AppStyle.text }
                onClicked: { page.sendChat(chatInput.text); chatInput.text = "" }
            }
        }
        Label {
            visible: chatViewport.selectedTab === 1
            anchors.centerIn: parent
            width: parent.width - 40
            text: qsTr("На собрании еще нет опросов. Начать опрос здесь!")
            color: AppStyle.muted; font.pixelSize: 15; font.bold: true
            horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap
        }
        BackgroundItem {
            visible: chatViewport.selectedTab === 1
            enabled: false
            anchors { bottom: parent.bottom; left: parent.left; leftMargin: 16; right: parent.right; rightMargin: 16 }
            height: 48
            Rectangle { anchors.fill: parent; radius: 6; color: AppStyle.field }
            Label { anchors.centerIn: parent; text: qsTr("Создать опрос"); color: AppStyle.inactive; font.pixelSize: 16; font.bold: true }
        }
    }
    Item {
        id: participantsViewport
        z: 90
        visible: page.participantsOpen
        width: page.width / 2
        height: page.height / 2
        scale: 2
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }
        Item {
            id: peopleHeader
            width: parent.width; height: 56
            BackgroundItem {
                width: 104; height: parent.height
                Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 16 }
                onClicked: page.participantsOpen = false
            }
            Label { anchors.centerIn: parent; text: qsTr("Участники"); color: AppStyle.text; font.pixelSize: 18; font.bold: true }
        }
        Label {
            id: peopleHeading
            x: 16; y: peopleHeader.height + 42
            text: qsTr("Список участников (%1)").arg(page.participantCount)
            color: AppStyle.text; font.pixelSize: 16; font.bold: true
        }
        AppButton {
            id: inviteButton
            x: 32; width: parent.width - 64
            anchors.top: peopleHeading.bottom; anchors.topMargin: 20
            text: qsTr("Пригласить")
            onClicked: page.invite()
        }
        JitsiField {
            id: peopleSearch
            x: 32; width: parent.width - 64
            anchors.top: inviteButton.bottom; anchors.topMargin: 8
            placeholderText: qsTr("Поиск участников")
            centered: true
        }
        SilicaFlickable {
            anchors { top: peopleSearch.bottom; topMargin: 18; bottom: peopleActions.top; left: parent.left; right: parent.right }
            contentHeight: peopleList.height
            Column {
                id: peopleList
                width: parent.width
                Repeater {
                    model: (page.joined ? [{name: appState.displayName, self: true}] : []).concat(page.participants)
                    delegate: Item {
                        width: peopleList.width; height: 58
                        visible: !peopleSearch.text || modelData.name.toLowerCase().indexOf(peopleSearch.text.toLowerCase()) >= 0
                        Avatar { x: 24; anchors.verticalCenter: parent.verticalCenter; width: 36; name: modelData.name; imageUrl: modelData.self ? appState.avatarUrl : "" }
                        Column {
                            x: 72; anchors.verticalCenter: parent.verticalCenter; spacing: 2
                            Label { text: modelData.name + (modelData.self ? qsTr(" (вы)") : ""); color: AppStyle.text; font.pixelSize: 15 }
                            Label { visible: modelData.self && page.moderator; text: qsTr("Модератор"); color: AppStyle.muted; font.pixelSize: 13 }
                        }
                    }
                }
            }
            VerticalScrollDecorator {}
        }
        Row {
            id: peopleActions
            anchors { bottom: parent.bottom; bottomMargin: 18; horizontalCenter: parent.horizontalCenter }
            spacing: 8
            BackgroundItem {
                width: 216; height: 48; enabled: page.moderator
                Rectangle { anchors.fill: parent; color: page.moderator ? "#E4E4E4" : AppStyle.field; radius: 6 }
                Label { anchors.centerIn: parent; text: qsTr("Выключить звук у всех"); color: "#111111"; font.pixelSize: 14; font.bold: true }
                onClicked: page.muteEveryone("audio")
            }
            BackgroundItem {
                width: 48; height: 48; enabled: page.moderator
                Rectangle { anchors.fill: parent; color: page.moderator ? "#E4E4E4" : AppStyle.field; radius: 6 }
                Icon { anchors.centerIn: parent; source: Qt.resolvedUrl("../icons/dots-horizontal.svg"); width: 24; height: 24; color: "#111111" }
                onClicked: page.muteEveryone("video")
            }
        }
    }
    Item {
        z: 90
        visible: page.settingsOpen
        width: page.width / 2
        height: page.height / 2
        scale: 2
        transformOrigin: Item.TopLeft
        Rectangle { anchors.fill: parent; color: AppStyle.surface }
        Item {
            id: meetingSettingsHeader
            width: parent.width; height: 56
            BackgroundItem {
                width: 104; height: parent.height
                Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 16 }
                onClicked: page.settingsOpen = false
            }
            Label { anchors.centerIn: parent; text: qsTr("Настройки"); color: AppStyle.text; font.pixelSize: 18; font.bold: true }
        }
        SettingsView {
            anchors { top: meetingSettingsHeader.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
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
