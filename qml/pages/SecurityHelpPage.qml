import QtQuick 2.6
import Sailfish.Silica 1.0
import ru.auroraos.WebView 1.0
import "../components"

Page {
    id: page
    allowedOrientations: Orientation.All
    backNavigation: true
    property string address: "https://jitsi.github.io/handbook/docs/faq/#how-can-i-protect-my-meetings-with-jitsi"

    Rectangle { anchors.fill: parent; color: AppStyle.background }
    Rectangle {
        id: header
        anchors { top: parent.top; left: parent.left; right: parent.right }
        height: 80
        color: AppStyle.surface
        BackgroundItem {
            width: 140; height: parent.height
            Accessible.role: Accessible.Button
            Accessible.name: qsTr("Закрыть")
            Label { anchors.centerIn: parent; text: qsTr("Закрыть"); color: AppStyle.accent; font.pixelSize: 28 }
            onClicked: pageStack.pop()
        }
        Label {
            anchors.centerIn: parent
            text: qsTr("Безопасность встречи")
            color: AppStyle.text
            font.pixelSize: 28
            font.bold: true
        }
    }
    WebView {
        anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right }
        url: page.address
        TouchInput { enabled: true }
        KeyboardInput { enabled: true }
    }
}
