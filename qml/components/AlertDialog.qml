import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// Alert.alert of the native client in the style of the call dialogs: a
// backdrop, a ui01 card with a title and a text, Cancel and OK on the right.
// Created on the window with open(); accepted() follows OK.
MouseArea {
    id: alert
    property string title
    property string text
    property string acceptLabel: appState.t("settingsView.alertOk")
    property string cancelLabel: appState.t("settingsView.alertCancel")
    signal accepted()
    signal dismissed()

    anchors.fill: parent
    z: 1000
    // Taps on the backdrop close the alert, like the call dialogs.
    onClicked: {
        alert.dismissed()
        alert.destroy()
    }

    Rectangle { anchors.fill: parent; color: "#000000"; opacity: 0.6 }

    Rectangle {
        anchors.centerIn: parent
        width: Math.min(parent.width - 48, 400)
        height: card.height + 48
        radius: 6
        color: AppStyle.surface

        // Keeps taps on the card from reaching the backdrop.
        MouseArea { anchors.fill: parent }

        Column {
            id: card
            x: 24
            y: 24
            width: parent.width - 48
            spacing: 8
            Label {
                width: parent.width
                text: alert.title
                wrapMode: Text.Wrap
                color: AppStyle.text
                font.pixelSize: AppStyle.bodyShortLarge
                font.weight: Font.DemiBold
            }
            Label {
                width: parent.width
                text: alert.text
                wrapMode: Text.Wrap
                color: AppStyle.muted
                font.pixelSize: AppStyle.bodyShort
            }
            Item { width: 1; height: 16 }
            Row {
                anchors.right: parent.right
                spacing: 8
                AppButton {
                    width: implicitWidth
                    height: 40
                    type: "tertiary"
                    text: alert.cancelLabel
                    onClicked: {
                        alert.dismissed()
                        alert.destroy()
                    }
                }
                AppButton {
                    width: implicitWidth
                    height: 40
                    text: alert.acceptLabel
                    onClicked: {
                        alert.accepted()
                        alert.destroy()
                    }
                }
            }
        }
    }
}
