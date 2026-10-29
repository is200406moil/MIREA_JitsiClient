import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

Rectangle {
    id: navigation
    property int selectedTab: 0
    signal tabSelected(int index)

    height: 70
    color: AppStyle.surface
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
                    spacing: 4
                    Icon {
                        anchors.horizontalCenter: parent.horizontalCenter
                        source: index === 0 ? "image://theme/icon-m-history" : Qt.resolvedUrl("../icons/" + (index === 1 ? "calendar" : "gear") + ".svg")
                        width: 24; height: width
                        color: navigation.selectedTab === index ? AppStyle.text : AppStyle.inactive
                    }
                    Label {
                        width: parent.width
                        text: modelData
                        horizontalAlignment: Text.AlignHCenter
                        font.pixelSize: 12
                        font.bold: navigation.selectedTab === index
                        color: navigation.selectedTab === index ? AppStyle.text : AppStyle.inactive
                    }
                }
                onClicked: navigation.tabSelected(index)
            }
        }
    }
}
