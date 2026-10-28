import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Item {
    id: header
    property string title
    property string subtitle
    property bool showBack: false
    signal backClicked()
    width: parent.width
    height: Math.max(Theme.itemSizeLarge, titles.height + 2 * Theme.paddingLarge)
    BackgroundItem {
        id: backButton
        visible: header.showBack
        width: Theme.itemSizeMedium
        height: parent.height
        Accessible.role: Accessible.Button
        Accessible.name: qsTr("Назад")
        Icon {
            anchors.centerIn: parent
            width: Theme.iconSizeMedium
            height: width
            source: Qt.resolvedUrl("../icons/arrow-back.svg")
            color: AppStyle.text
        }
        onClicked: header.backClicked()
    }
    Column {
        id: titles
        anchors.verticalCenter: parent.verticalCenter
        x: header.showBack ? backButton.width : Theme.horizontalPageMargin
        width: header.width - 2 * x
        spacing: Theme.paddingSmall
        Label {
            width: parent.width
            text: header.title
            color: AppStyle.text
            font.pixelSize: Theme.fontSizeLarge
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
        }
        Label {
            visible: header.subtitle.length > 0
            width: parent.width
            text: header.subtitle
            color: AppStyle.muted
            font.pixelSize: Theme.fontSizeExtraSmall
            horizontalAlignment: Text.AlignHCenter
            truncationMode: TruncationMode.Fade
        }
    }
}
