import QtQuick 2.6
import Sailfish.Silica 1.0
import "../components"

// SettingsView.native with its sections: profile card, General, Conference
// (welcome page only), Notifications, Advanced, build information and links.
SilicaFlickable {
    id: view
    property bool inMeeting: false
    property string serverError
    property bool ready: false
    contentHeight: body.height + 16
    clip: true
    Component.onCompleted: ready = true

    function saveServer() {
        if (!ready || serverField.text === appState.server) return
        if (!appState.saveSettings(serverField.text, appState.audioMuted, appState.videoMuted))
            serverError = appState.lastError
        else {
            serverError = ""
            serverField.text = appState.server
        }
    }

    Rectangle { anchors.fill: parent; color: AppStyle.surface }

    Column {
        id: body
        width: parent.width

        // profileContainerWrapper / profileContainer
        Item {
            width: parent.width
            height: profileCard.height + 64
            BackgroundItem {
                id: profileCard
                x: 32
                y: 32
                width: parent.width - 64
                height: 64 + 48
                highlightedColor: "transparent"
                Accessible.name: appState.t("settingsView.profileSection")
                onClicked: pageStack.push(Qt.resolvedUrl("ProfilePage.qml"), {mainPage: pageStack.currentPage})
                Rectangle { anchors.fill: parent; radius: 6; color: profileCard.down ? AppStyle.field : AppStyle.raised }
                Avatar {
                    id: avatar
                    x: 24
                    anchors.verticalCenter: parent.verticalCenter
                    width: 64
                    name: appState.displayName
                    imageUrl: appState.avatarUrl
                }
                Label {
                    anchors { left: avatar.right; leftMargin: 24; right: arrow.left; rightMargin: 8; verticalCenter: parent.verticalCenter }
                    text: appState.displayName
                    color: AppStyle.text
                    font.pixelSize: AppStyle.bodyShortLarge
                    truncationMode: TruncationMode.Fade
                }
                Icon {
                    id: arrow
                    anchors { right: parent.right; rightMargin: 24; verticalCenter: parent.verticalCenter }
                    source: Qt.resolvedUrl("../icons/arrow-right.svg")
                    width: 24
                    height: 24
                    color: AppStyle.text
                }
            }
        }

        // GeneralSection
        SettingToggle { text: appState.t("videothumbnail.hideSelfView"); preferenceKey: "hideSelfView" }
        BackgroundItem {
            width: parent.width
            height: 64
            highlightedColor: "transparent"
            Accessible.name: appState.t("settings.language")
            onClicked: pageStack.push(Qt.resolvedUrl("LanguagePage.qml"), {mainPage: pageStack.currentPage})
            Label {
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                text: appState.t("settings.language")
                color: AppStyle.text
                font.pixelSize: AppStyle.bodyShortLarge
            }
            Row {
                anchors { right: parent.right; rightMargin: 24; verticalCenter: parent.verticalCenter }
                spacing: 8
                Label {
                    anchors.verticalCenter: parent.verticalCenter
                    text: appState.t("languages:" + appState.preferences.language)
                    color: AppStyle.text
                    font.pixelSize: AppStyle.bodyShortLarge
                }
                Icon {
                    anchors.verticalCenter: parent.verticalCenter
                    source: Qt.resolvedUrl("../icons/arrow-right.svg")
                    width: 24
                    height: 24
                    color: AppStyle.text
                }
            }
        }

        // ConferenceSection
        SettingDivider { visible: !view.inMeeting }
        SettingSection { visible: !view.inMeeting; text: appState.t("settingsView.conferenceSection") }
        Item {
            visible: !view.inMeeting
            width: parent.width
            height: visible ? serverColumn.height + 24 : 0
            Column {
                id: serverColumn
                x: 32
                y: 8
                width: parent.width - 64
                spacing: 8
                JitsiField {
                    id: serverField
                    width: parent.width
                    label: appState.t("settingsView.serverURL")
                    text: appState.server
                    placeholderText: "https://meet.jit.si"
                    error: view.serverError.length > 0
                    inputMethodHints: Qt.ImhUrlCharactersOnly | Qt.ImhNoAutoUppercase
                    onFieldActiveFocusChanged: if (!fieldActiveFocus) view.saveServer()
                    onAccepted: view.saveServer()
                }
                Label {
                    width: parent.width
                    visible: view.serverError.length > 0
                    text: view.serverError
                    color: AppStyle.error
                    wrapMode: Text.Wrap
                    font.pixelSize: AppStyle.label
                }
            }
        }
        SettingToggle { visible: !view.inMeeting; text: appState.t("settingsView.startCarModeInLowBandwidthMode"); preferenceKey: "lowBandwidth" }
        SettingToggle { visible: !view.inMeeting; text: appState.t("settingsView.startWithAudioMuted"); preferenceKey: "audioMuted" }
        SettingToggle { visible: !view.inMeeting; text: appState.t("settingsView.startWithVideoMuted"); preferenceKey: "videoMuted" }

        // NotificationsSection
        SettingDivider {}
        SettingSection { text: appState.t("settings.playSounds") }
        SettingToggle { text: appState.t("settings.reactions"); preferenceKey: "soundReactions" }
        SettingToggle { text: appState.t("settings.incomingMessage"); preferenceKey: "soundMessage" }
        SettingToggle { text: appState.t("settings.participantJoined"); preferenceKey: "soundJoined" }
        SettingToggle { text: appState.t("settings.participantLeft"); preferenceKey: "soundLeft" }
        SettingToggle { text: appState.t("settings.participantKnocking"); preferenceKey: "soundLobby" }
        SettingDivider {}
        SettingSection { text: appState.t("notify.displayNotifications") }
        SettingToggle { text: appState.t("notify.chatMessages"); preferenceKey: "chatNotifications" }

        // AdvancedSection
        SettingDivider { visible: !view.inMeeting }
        SettingSection { visible: !view.inMeeting; text: appState.t("settingsView.advanced") }
        SettingToggle { visible: !view.inMeeting; text: appState.t("settingsView.disableP2P"); preferenceKey: "disableP2p" }
        SettingToggle { visible: !view.inMeeting; text: appState.t("settingsView.disableCrashReporting"); preferenceKey: "disableCrashReporting" }
        SettingDivider { visible: !view.inMeeting }
        SettingSection { visible: !view.inMeeting; text: appState.t("settingsView.buildInfoSection") }
        Item {
            visible: !view.inMeeting
            width: parent.width
            height: visible ? 64 : 0
            Label {
                x: 24
                anchors.verticalCenter: parent.verticalCenter
                text: appState.t("settingsView.version")
                color: AppStyle.text
                font.pixelSize: AppStyle.bodyShortLarge
            }
            Label {
                anchors { right: parent.right; rightMargin: 24; verticalCenter: parent.verticalCenter }
                text: "0.1 build 74"
                color: AppStyle.text
                font.pixelSize: AppStyle.bodyShort
            }
        }

        // LinksSection: three tertiary buttons.
        SettingDivider { visible: !view.inMeeting }
        Row {
            visible: !view.inMeeting
            x: 24
            width: parent.width - 48
            height: visible ? 56 : 0
            Repeater {
                model: [
                    { label: "settingsView.help", link: "https://jitsi.org/user-faq/" },
                    { label: "settingsView.terms", link: "https://jitsi.org/meet-jit-si-terms-of-service/" },
                    { label: "settingsView.privacy", link: "https://jitsi.org/meet-jit-si-privacy/" }
                ]
                delegate: BackgroundItem {
                    width: parent.width / 3
                    height: 56
                    highlightedColor: "transparent"
                    Rectangle { anchors.fill: parent; radius: 6; color: parent.down ? AppStyle.raised : "transparent" }
                    Label {
                        anchors.centerIn: parent
                        width: parent.width - 8
                        text: appState.t(modelData.label)
                        horizontalAlignment: Text.AlignHCenter
                        // Shrinks instead of breaking a long word.
                        fontSizeMode: Text.HorizontalFit
                        minimumPixelSize: 11
                        color: AppStyle.text
                        font.pixelSize: AppStyle.bodyShortLarge
                        font.weight: Font.DemiBold
                    }
                    onClicked: pageStack.push(Qt.resolvedUrl("SecurityHelpPage.qml"), {
                        title: appState.t(modelData.label), address: modelData.link
                    })
                }
            }
        }
    }
    VerticalScrollDecorator {}
}
