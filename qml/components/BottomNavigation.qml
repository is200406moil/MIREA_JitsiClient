import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Rectangle {
    id: navigation
    property int selectedTab: 0
    signal tabSelected(int index)

    height: Math.max(Theme.itemSizeLarge, Theme.fontSizeExtraSmall + Theme.iconSizeMedium + 3*Theme.paddingSmall)
    color: Theme.rgba(Theme.primaryColor, 0.06)
    Rectangle { width: parent.width; height: 1; color: AppStyle.border }
    Row {
        anchors.fill: parent
        Repeater {
            model: [qsTr("Недавние"), qsTr("Календарь"), qsTr("Настройки")]
            delegate: BackgroundItem {
                width: navigation.width/3
                height: navigation.height
                Accessible.name: modelData
                Accessible.role: Accessible.Button
                Column {
                    anchors.centerIn: parent
                    width: parent.width
                    spacing: Theme.paddingSmall
                    Icon {
                        anchors.horizontalCenter: parent.horizontalCenter
                        source: index === 0 ? "image://theme/icon-m-history" : Qt.resolvedUrl("../icons/" + (index === 1 ? "calendar" : "gear") + ".svg")
                        width: Theme.iconSizeMedium; height: width
                        color: navigation.selectedTab === index ? Theme.highlightColor : Theme.secondaryColor
                    }
                    Label {
                        width: parent.width
                        text: modelData
                        horizontalAlignment: Text.AlignHCenter
                        font.pixelSize: Theme.fontSizeExtraSmall
                        font.bold: navigation.selectedTab === index
                        color: navigation.selectedTab === index ? Theme.highlightColor : Theme.secondaryColor
                    }
                }
                onClicked: navigation.tabSelected(index)
            }
        }
    }
}
