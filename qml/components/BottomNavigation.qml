import QtQuick 2.6
import Sailfish.Silica 1.0
import "."

// Welcome page tabs (welcome/constants.tsx): welcomeCard background without
// a top border, 24 dp icons and 12 dp labels, white when active and text03
// when inactive.
Rectangle {
    id: navigation
    property int selectedTab: 0
    signal tabSelected(int index)
    height: 56
    color: AppStyle.surface

    Row {
        anchors.fill: parent
        Repeater {
            model: [
                { label: "welcomepage.recentList", icon: "restore" },
                { label: "welcomepage.calendar", icon: "calendar" },
                { label: "welcomepage.settings", icon: "gear" }
            ]
            delegate: BackgroundItem {
                width: navigation.width / 3
                height: navigation.height
                highlightedColor: "transparent"
                Accessible.name: appState.t(modelData.label)
                Accessible.role: Accessible.PageTab
                readonly property color tint: navigation.selectedTab === index ? AppStyle.text : AppStyle.inactive
                Column {
                    anchors.centerIn: parent
                    width: parent.width
                    spacing: 2
                    Icon {
                        // Drawn at the final size; the screen is scaled up by AppStyle.dp.
                        sourceSize: Qt.size(Math.ceil(width * AppStyle.dp), Math.ceil(height * AppStyle.dp))
                        anchors.horizontalCenter: parent.horizontalCenter
                        source: Qt.resolvedUrl("../icons/" + modelData.icon + ".svg")
                        width: 24
                        height: 24
                        color: tint
                    }
                    Label {
                        width: parent.width
                        text: appState.t(modelData.label)
                        horizontalAlignment: Text.AlignHCenter
                        font.pixelSize: AppStyle.label
                        color: tint
                    }
                }
                onClicked: navigation.tabSelected(index)
            }
        }
    }
}
